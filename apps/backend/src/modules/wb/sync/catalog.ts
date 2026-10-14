import { pagesOf } from "../../marketplace/batch";
import {
  type WbSyncDeps,
  MAX_PAGES,
  asText,
  asNumber,
  asDate,
  type WbRunCounter,
  type WbReader,
  pagedList,
  upsertRows,
} from "./core";

/**
 * The catalog imports: listings, prices and stocks.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** Cards come 100 at a time; WB's own pagination example uses this limit. */
const CARDS_PAGE = 100;

/** `GET /api/v2/list/goods/filter`: "set limit=1000, and use the offset field". */
const PRICES_PAGE = 1000;

/** `POST /api/v3/stocks/{warehouseId}`: "Array of integers <= 1000 items". */
const STOCKS_CHUNK = 1000;

/** `POST /content/v2/get/cards/list`, WB's "Returns the listings", cursor-paginated. */
export const syncCards = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Card = Record<string, unknown> & { nmID?: number; updatedAt?: string };
  type Answer = { cards?: Card[]; cursor?: { updatedAt?: string; nmID?: number; total?: number } };

  let cursor: { updatedAt?: string; nmID?: number } = {};

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("content.cards.list", {
      query: { locale: "ru" },
      body: {
        settings: {
          sort: { ascending: true },
          cursor: { limit: CARDS_PAGE, ...cursor },
          filter: { withPhoto: -1 },
        },
      },
    });

    const cards = answer.cards ?? [];
    const fetchedAt = new Date();

    counter.rows += await upsertRows(
      deps.wb,
      "WbProduct",
      deps.tenantId,
      cards.map((card) => ({
        keys: { nm_id: String(card.nmID) },
        values: {
          imt_id: asText(card.imtID),
          vendor_code: asText(card.vendorCode),
          title: asText(card.title),
          brand: asText(card.brand),
          subject_id: asText(card.subjectID),
          subject_name: asText(card.subjectName),
          photos: card.photos ?? null,
          dimensions: card.dimensions ?? null,
          sizes: card.sizes ?? null,
          source: "wb",
          fetched_at: fetchedAt,
          wb_updated_at: asDate(card.updatedAt),
          raw: card,
        },
      })),
    );

    const total = answer.cursor?.total ?? cards.length;
    deps.logger.info(
      `[wb] cards page ${page + 1}: ${cards.length} listings (cursor total ${total})`,
    );

    if (total < CARDS_PAGE || !answer.cursor?.nmID) {
      break;
    }
    cursor = { updatedAt: answer.cursor.updatedAt, nmID: answer.cursor.nmID };
  }

};

/** `GET /api/v2/list/goods/filter`, WB's "Returns item data", offset-paginated. */
export const syncPrices = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Good = Record<string, unknown> & { nmID?: number };
  type Answer = { data?: { listGoods?: Good[] } };

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("prices.goods.filter", {
      query: { limit: PRICES_PAGE, offset: page * PRICES_PAGE },
    });

    const goods = answer.data?.listGoods ?? [];
    if (!goods.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbPrice",
      deps.tenantId,
      goods.map((good) => ({
        keys: { nm_id: String(good.nmID) },
        values: {
          vendor_code: asText(good.vendorCode),
          currency_iso: asText(good.currencyIsoCode4217),
          discount: asNumber(good.discount),
          club_discount: asNumber(good.clubDiscount),
          editable_size_price:
            typeof good.editableSizePrice === "boolean" ? good.editableSizePrice : null,
          sizes: good.sizes ?? null,
          source: "wb",
          fetched_at: fetchedAt,
          raw: good,
        },
      })),
    );

    deps.logger.info(`[wb] prices page ${page + 1}: ${goods.length} items`);

    if (goods.length < PRICES_PAGE) {
      break;
    }
  }

};

/**
 * `GET /api/v3/warehouses`, then `POST /api/v3/stocks/{warehouseId}`, which is
 * WB's "Get Inventory" and answers for the `chrtIds` it is given. The size ids
 * come from the cards already mirrored, so `cards` has to run first; with an
 * empty `wb_product` this import writes nothing and says so.
 */
export const syncStocks = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Warehouse = { id?: number; name?: string };
  type StockLine = { sku?: string; amount?: number };

  const warehouses = await read<Warehouse[]>("marketplace.warehouses");
  if (!warehouses?.length) {
    deps.logger.warn("[wb] the cabinet has no seller warehouses, so there is no inventory to read");
    return;
  }

  const chrtIds: number[] = [];
  const bySku = new Map<string, { chrt_id: string | null; nm_id: string }>();

  /** Two columns of the card mirror, a page at a time: the size ids are all this import reads. */
  for await (const products of pagesOf(
    pagedList<{ id: string; nm_id: string; sizes: unknown }>(deps.wb, "WbProduct"),
    { tenant_id: deps.tenantId },
    ["id", "nm_id", "sizes"],
  )) {
    for (const product of products) {
      for (const size of (product.sizes as Array<Record<string, unknown>> | null) ?? []) {
        const chrtId = asNumber(size.chrtID);
        if (chrtId !== null) {
          chrtIds.push(chrtId);
        }
        for (const sku of (size.skus as string[] | undefined) ?? []) {
          bySku.set(String(sku), { chrt_id: asText(size.chrtID), nm_id: product.nm_id });
        }
      }
    }
  }

  if (!chrtIds.length) {
    deps.logger.warn(
      `[wb] no size ids in wb_product for tenant ${deps.tenantId}: run the cards import first`,
    );
    return;
  }

  for (const warehouse of warehouses) {
    if (warehouse.id === undefined || warehouse.id === null) {
      continue;
    }
    for (let offset = 0; offset < chrtIds.length; offset += STOCKS_CHUNK) {
      const chunk = chrtIds.slice(offset, offset + STOCKS_CHUNK);
      const answer = await read<{ stocks?: StockLine[] }>("marketplace.stocks", {
        params: { warehouseId: warehouse.id },
        body: { chrtIds: chunk },
      });

      const lines = answer.stocks ?? [];
      const fetchedAt = new Date();

      counter.rows += await upsertRows(
        deps.wb,
        "WbStock",
        deps.tenantId,
        lines
          .filter((line) => Boolean(line.sku))
          .map((line) => {
            const known = bySku.get(String(line.sku));
            return {
              keys: { warehouse_id: String(warehouse.id), sku: String(line.sku) },
              values: {
                warehouse_name: asText(warehouse.name),
                chrt_id: known?.chrt_id ?? null,
                nm_id: known?.nm_id ?? null,
                amount: asNumber(line.amount) ?? 0,
                source: "wb",
                fetched_at: fetchedAt,
                raw: line,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] stocks warehouse ${warehouse.id} (${warehouse.name ?? "?"}): ` +
          `${lines.length} lines for ${chunk.length} size ids`,
      );
    }
  }

};
