import {
  type OzonSyncDeps,
  MAX_PAGES,
  asText,
  asNumber,
  asDate,
  asAmount,
  type OzonRunCounter,
  type OzonReader,
  type Upsert,
  upsertRows,
} from "./core";

/**
 * The catalog imports: products, prices and stocks.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** `POST /v3/product/list`: "Количество значений на странице. Минимум — 1, максимум — 1000." */
const PRODUCT_LIST_PAGE = 1000;

/** `POST /v3/product/info/list`: "не больше 1000 товаров ... в сумме". */
const PRODUCT_INFO_CHUNK = 1000;

/** `POST /v5/product/info/prices` and `/v4/product/info/stocks`: limit [1..1000]. */
const PRICES_PAGE = 1000;
const STOCKS_PAGE = 1000;

/**
 * `POST /v1/product/info/description` answers for ONE card, so a catalogue of
 * N cards costs N requests. Bounded on purpose, and the cap is LOGGED when it
 * bites: a silent truncation reads as "we imported everything" when it did not.
 */
const DESCRIPTIONS_MAX = 500;

/**
 * `POST /v3/product/list` for the ids, then `POST /v3/product/info/list` for
 * the cards, `POST /v4/product/info/attributes` for the characteristics and
 * `POST /v1/product/info/description` for the text.
 *
 * The list method answers only ids and flags ("Метод для получения списка всех
 * товаров"), so the card itself always costs a second request — that is Ozon's
 * shape, not a design choice here.
 */
export const syncProducts = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type ListItem = { product_id?: number | string; offer_id?: string; sku?: number | string; archived?: boolean };
  type ListAnswer = { result?: { items?: ListItem[]; total?: number; last_id?: string } };

  const ids: string[] = [];
  let lastId = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<ListAnswer>("product.list", {
      body: {
        filter: { visibility: "ALL" },
        last_id: lastId,
        limit: PRODUCT_LIST_PAGE,
      },
    });

    const items = answer.result?.items ?? [];
    for (const item of items) {
      const id = asText(item.product_id);
      if (id) {
        ids.push(id);
      }
    }

    deps.logger.info(`[ozon] product.list page ${page + 1}: ${items.length} ids`);

    const nextId = answer.result?.last_id ?? "";
    if (items.length < PRODUCT_LIST_PAGE || !nextId || nextId === lastId) {
      break;
    }
    lastId = nextId;
  }

  if (!ids.length) {
    deps.logger.warn("[ozon] the cabinet answered no product ids, so there are no cards to import");
    return;
  }

  type Card = Record<string, unknown> & { id?: number | string; offer_id?: string };
  type InfoAnswer = { items?: Card[] };
  type AttributesAnswer = { result?: Array<Record<string, unknown> & { id?: number | string }> };

  const fetchedAt = new Date();
  /**
   * How many cards answered, and the ids of the ones whose description is read
   * below. The cards themselves are written page by page and not kept: the
   * whole catalogue in one array is the answer held at once (t-2026-10-06-21).
   */
  let answered = 0;
  const described: string[] = [];

  for (let offset = 0; offset < ids.length; offset += PRODUCT_INFO_CHUNK) {
    const idChunk = ids.slice(offset, offset + PRODUCT_INFO_CHUNK);
    const answer = await read<InfoAnswer>("product.info.list", { body: { product_id: idChunk } });
    for (const card of answer.items ?? []) {
      answered += 1;
      if (described.length < DESCRIPTIONS_MAX) {
        described.push(String(card.id));
      }
    }

    const attributes = await read<AttributesAnswer>("product.info.attributes", {
      body: {
        filter: { product_id: idChunk, visibility: "ALL" },
        limit: idChunk.length,
        last_id: "",
      },
    });
    const byId = new Map(
      (attributes.result ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
    );

    counter.rows += await upsertRows(
      deps.ozon,
      "OzonProduct",
      deps.tenantId,
      (answer.items ?? []).map((card) => {
        const statuses = (card.statuses ?? null) as Record<string, unknown> | null;
        return {
          keys: { product_id: String(card.id) },
          values: {
            offer_id: asText(card.offer_id),
            sku: asText(card.sku),
            name: asText(card.name),
            barcodes: card.barcodes ?? null,
            category_id: asText(card.description_category_id),
            type_id: asText(card.type_id),
            images: card.images ?? null,
            primary_image: Array.isArray(card.primary_image)
              ? asText((card.primary_image as unknown[])[0])
              : asText(card.primary_image),
            statuses: statuses ?? null,
            attributes: byId.get(String(card.id)) ?? null,
            archived: card.is_archived === true,
            source: "ozon",
            fetched_at: fetchedAt,
            ozon_updated_at: asDate(card.updated_at),
            raw: card,
          },
        };
      }),
    );
  }

  deps.logger.info(`[ozon] cards: ${answered} of ${ids.length} ids answered`);

  // The description is one request per card. Bounded, and the bound is said
  // out loud when it bites (no silent caps).
  if (answered > DESCRIPTIONS_MAX) {
    deps.logger.warn(
      `[ozon] descriptions: only the first ${DESCRIPTIONS_MAX} of ${answered} cards were asked ` +
        "for (/v1/product/info/description answers for one card per request). The rest keep the " +
        "description they already had; raise DESCRIPTIONS_MAX or run this kind again to continue.",
    );
  }

  const descriptions: Upsert[] = [];
  for (const productId of described) {
    try {
      const answer = await read<{ result?: { description?: string } }>("product.info.description", {
        body: { product_id: Number(productId) },
      });
      const text = asText(answer.result?.description);
      if (text) {
        descriptions.push({
          keys: { product_id: productId },
          values: { description: text, fetched_at: new Date() },
        });
      }
    } catch (error) {
      // One card without a description must not fail the whole import, but it
      // must not be silent either (rule 20a).
      deps.logger.warn(
        `[ozon] description of ${productId} could not be read: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (descriptions.length) {
    await upsertRows(deps.ozon, "OzonProduct", deps.tenantId, descriptions);
    deps.logger.info(`[ozon] descriptions: ${descriptions.length} cards`);
  }
};

/** `POST /v5/product/info/prices`, cursor-paginated. */
export const syncPrices = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Item = Record<string, unknown> & { product_id?: number | string; offer_id?: string };
  type Answer = { items?: Item[]; cursor?: string; total?: number };

  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("product.prices", {
      body: { cursor, filter: { visibility: "ALL" }, limit: PRICES_PAGE },
    });

    const items = answer.items ?? [];
    if (!items.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.ozon,
      "OzonPrice",
      deps.tenantId,
      items.map((item) => {
        const price = (item.price ?? {}) as Record<string, unknown>;
        return {
          keys: { product_id: String(item.product_id) },
          values: {
            offer_id: asText(item.offer_id),
            price: asAmount(price.price),
            old_price: asAmount(price.old_price),
            min_price: asAmount(price.min_price),
            currency_code: asText(price.currency_code),
            vat: asText(price.vat),
            commissions: item.commissions ?? null,
            price_indexes: item.price_indexes ?? null,
            marketing_actions: item.marketing_actions ?? null,
            source: "ozon",
            fetched_at: fetchedAt,
            raw: item,
          },
        };
      }),
    );

    deps.logger.info(`[ozon] prices page ${page + 1}: ${items.length} cards`);

    const next = answer.cursor ?? "";
    if (items.length < PRICES_PAGE || !next || next === cursor) {
      break;
    }
    cursor = next;
  }
};

/** `POST /v4/product/info/stocks`, cursor-paginated; one row per (sku, scheme). */
export const syncStocks = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Line = { sku?: number | string; type?: string; present?: number; reserved?: number; shipment_type?: string };
  type Item = { offer_id?: string; product_id?: number | string; stocks?: Line[] };
  type Answer = { items?: Item[]; cursor?: string; total?: number };

  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("product.stocks", {
      body: { cursor, filter: { visibility: "ALL" }, limit: STOCKS_PAGE },
    });

    const items = answer.items ?? [];
    if (!items.length) {
      break;
    }

    const fetchedAt = new Date();
    const rows: Upsert[] = [];

    for (const item of items) {
      for (const line of item.stocks ?? []) {
        const sku = asText(line.sku);
        const type = asText(line.type);
        if (!sku || !type) {
          continue;
        }
        rows.push({
          keys: {
            sku,
            stock_type: type,
            shipment_type: asText(line.shipment_type) ?? "",
          },
          values: {
            product_id: String(item.product_id),
            offer_id: asText(item.offer_id),
            present: asNumber(line.present) ?? 0,
            reserved: asNumber(line.reserved) ?? 0,
            source: "ozon",
            fetched_at: fetchedAt,
            raw: line,
          },
        });
      }
    }

    counter.rows += await upsertRows(deps.ozon, "OzonStock", deps.tenantId, rows);
    deps.logger.info(
      `[ozon] stocks page ${page + 1}: ${rows.length} lines over ${items.length} cards`,
    );

    const next = answer.cursor ?? "";
    if (items.length < STOCKS_PAGE || !next || next === cursor) {
      break;
    }
    cursor = next;
  }
};
