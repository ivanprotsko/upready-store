import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import {
  aggregateOfferLines,
  attributesOf,
  buildProductRow,
  candidatesBySku,
  offerLinesOf,
  photoUrls,
  productLink,
  productsPage,
  type OfferAggregate,
  type OfferLine,
  type ProductCard,
  type ProductOfferLine,
  type ProductRow,
  type ProductsListQuery,
  type ProductsPage,
  type StoredProductLink,
} from "../../../../../modules/marketplace/products-list";
import { tenantVariants } from "../../../../../modules/marketplace/project";
import { MARKETPLACE_IDS, adapterFor } from "../../../../../modules/marketplace/registry";
import { readMarketplaceKey } from "../../../marketplace-keys";

/**
 * Everything «Wildberries → Товары» and its card page show, for one shop and
 * one marketplace (task-02 of mp-section-design).
 *
 * The decisions live in `modules/marketplace/products-list.ts` and are pure.
 * This file only READS, and only our own database: `mp_product`, `mp_offer`,
 * `mp_link`, `mp_sync_run`, the shop's variants and the stored key's presence.
 * Opening the screen sends no request to the marketplace, which is criterion 7
 * of the task and is proven by `products-read-only.unit.spec.ts` rather than
 * by this comment.
 *
 * Raw SQL rather than the module service, for one reason each: the cards are
 * read without `attributes` (the list does not need the size table of every
 * card), and the offer lines are aggregated by the database, so a list request
 * does not carry twelve thousand lines into the process to add them up.
 */

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asIso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const asText = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** The adapter named in the address, or a 404 that names what is registered. */
export const marketplaceOf = (id: unknown): MarketplaceAdapter => {
  const adapter = adapterFor(String(id ?? ""));
  if (!adapter) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Маркетплейс ${String(id)} не подключён. Есть: ${MARKETPLACE_IDS.join(", ")}.`,
    );
  }
  return adapter;
};

const CARD_COLUMNS = [
  "id",
  "marketplace",
  "external_id",
  "vendor_code",
  "sku_external",
  "title",
  "brand",
  "category_name",
  "photos",
  "mp_updated_at",
  "synced_at",
];

const toCard = (row: Record<string, unknown>): ProductCard => ({
  id: String(row.id),
  marketplace: String(row.marketplace),
  external_id: String(row.external_id),
  vendor_code: asText(row.vendor_code),
  sku_external: asText(row.sku_external),
  title: asText(row.title),
  brand: asText(row.brand),
  category_name: asText(row.category_name),
  photos: row.photos ?? null,
  mp_updated_at: asIso(row.mp_updated_at),
  synced_at: asIso(row.synced_at) as string,
});

const toLink = (row: Record<string, unknown>): StoredProductLink => ({
  id: String(row.id),
  external_id: String(row.external_id),
  product_id: String(row.product_id),
  variant_id: asText(row.variant_id),
  matched_by: String(row.matched_by),
});

/** The shop's product titles for the linked cards, for the tooltip and the card page. */
const productTitles = async (pg: Knex, productIds: readonly string[]) => {
  const titles = new Map<string, string | null>();
  if (!productIds.length) {
    return titles;
  }
  const rows = (await pg("product")
    .whereIn("id", productIds as string[])
    .whereNull("deleted_at")
    .select("id", "title")) as { id: string; title: string | null }[];
  for (const row of rows) {
    titles.set(row.id, row.title ?? null);
  }
  return titles;
};

export type ProductsSync = {
  /** The adapter's own import kind that fills `mp_product` (WB `cards`, Ozon `products`). */
  kind: string;
  last_success_at: string | null;
  /** Cards of this marketplace stored for this shop, whatever the filters. */
  cards: number;
  /** The newest run of that kind, whatever it ended with; `null` when none ever ran. */
  status: string | null;
  /**
   * Whether a key for this marketplace is stored at all (an undecryptable one
   * counts as stored). Tells «ключ не сохранён» from «обновление ещё не
   * приходило» on an empty list; the key itself is never read out.
   */
  key_set: boolean;
};

const loadSync = async (
  scope: MedusaContainer,
  pg: Knex,
  adapter: MarketplaceAdapter,
  tenantId: string,
  cards: number,
): Promise<ProductsSync> => {
  const kinds = adapter.mirrorKinds.products;
  const runs = () =>
    pg("mp_sync_run")
      .where({ tenant_id: tenantId, marketplace: adapter.id })
      .whereIn("kind", kinds as string[])
      .whereNull("deleted_at");

  const [latest, succeeded, key] = await Promise.all([
    runs().orderBy("started_at", "desc").first("status"),
    runs().where({ status: "succeeded" }).orderBy("finished_at", "desc").first("finished_at", "started_at"),
    readMarketplaceKey(pg, adapter, tenantId, scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)),
  ]);

  return {
    kind: kinds.join(","),
    last_success_at: succeeded ? asIso(succeeded.finished_at ?? succeeded.started_at) : null,
    cards,
    status: latest ? String(latest.status) : null,
    key_set: Boolean(key.slot) || Boolean(key.unreadable),
  };
};

export type ProductsPayload = ProductsPage & { sync: ProductsSync };

export const loadProductsPage = async (
  scope: MedusaContainer,
  tenantId: string,
  adapter: MarketplaceAdapter,
  query: ProductsListQuery,
): Promise<ProductsPayload> => {
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const scoped = { tenant_id: tenantId, marketplace: adapter.id };

  const [cardRows, offerRows, linkRows, variants] = await Promise.all([
    pg("mp_product").where(scoped).whereNull("deleted_at").select(CARD_COLUMNS) as Promise<Record<string, unknown>[]>,
    /**
     * `sum(stock)` is NULL when no line of the card reported a stock, and that
     * NULL is carried through as `null`: «—» on the screen, never «0 шт».
     * `min(currency)` is the one currency WB reports per cabinet.
     */
    pg("mp_offer")
      .where(scoped)
      .whereNull("deleted_at")
      .groupBy("external_id")
      .select("external_id")
      .min("price as min_price")
      .min("discount_price as min_discount_price")
      .min("currency as currency")
      .sum("stock as stock_sum")
      .count("* as lines") as Promise<Record<string, unknown>[]>,
    pg("mp_link")
      .where(scoped)
      .whereNull("deleted_at")
      .select("id", "external_id", "product_id", "variant_id", "matched_by") as Promise<Record<string, unknown>[]>,
    tenantVariants({ container: scope, tenantId }),
  ]);

  const offers = new Map<string, OfferAggregate>(
    offerRows.map((row) => [
      String(row.external_id),
      {
        external_id: String(row.external_id),
        min_price: asNumber(row.min_price),
        min_discount_price: asNumber(row.min_discount_price),
        currency: asText(row.currency),
        stock_sum: asNumber(row.stock_sum),
        lines: asNumber(row.lines) ?? 0,
      },
    ]),
  );
  const links = new Map(linkRows.map((row) => [String(row.external_id), toLink(row)]));
  const candidates = candidatesBySku(variants);
  const titles = await productTitles(pg, [...new Set([...links.values()].map((link) => link.product_id))]);

  const rows: ProductRow[] = cardRows.map((row) => {
    const card = toCard(row);
    return buildProductRow(
      card,
      offers.get(card.external_id),
      productLink(card, links.get(card.external_id), candidates, titles),
    );
  });

  const sync = await loadSync(scope, pg, adapter, tenantId, rows.length);

  return { ...productsPage(rows, query), sync };
};

export type ProductCardPayload = {
  product: Omit<ProductRow, "offers"> & {
    photos: string[];
    attributes: Record<string, string>;
    offers: ProductOfferLine[];
  };
};

/**
 * The marketplace's own characteristics of one card, from the raw mirror row
 * the card was projected from (`mp_product.source_row_id`).
 *
 * WB returns `characteristics[]` on every card and `modules/wb/normalize.ts`
 * does not carry it into `mp_product.attributes`, so without this the card
 * page would show sizes and dimensions only. The mirror is our own table, read
 * by its id and this tenant; nothing leaves the process. A marketplace with
 * no entry here shows the normalized attributes alone, which is a statement
 * and not a gap: once `normalize` carries the characteristics, `attributesOf`
 * reads them from `mp_product.attributes` and this map can go.
 */
const RAW_CHARACTERISTICS: Record<string, { table: string; column: string }> = {
  wb: { table: "wb_product", column: "raw" },
};

const loadCharacteristics = async (
  pg: Knex,
  marketplace: string,
  tenantId: string,
  sourceRowId: string | null,
): Promise<unknown> => {
  const source = RAW_CHARACTERISTICS[marketplace];
  if (!source || !sourceRowId) {
    return null;
  }
  const row = (await pg(source.table)
    .where({ id: sourceRowId, tenant_id: tenantId })
    .whereNull("deleted_at")
    .first(pg.raw("?? -> 'characteristics' as characteristics", [source.column]))) as
    | { characteristics: unknown }
    | undefined;
  return row?.characteristics ?? null;
};

/**
 * One card with its lines, photos and characteristics. A card of another shop
 * or of another marketplace is a 404, the same answer as a card that does not
 * exist, so the response never tells one tenant that another's row is there.
 */
export const loadProductCard = async (
  scope: MedusaContainer,
  tenantId: string,
  adapter: MarketplaceAdapter,
  id: string,
): Promise<ProductCardPayload> => {
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const scoped = { tenant_id: tenantId, marketplace: adapter.id };

  const row = (await pg("mp_product")
    .where({ ...scoped, id })
    .whereNull("deleted_at")
    .first([...CARD_COLUMNS, "attributes", "source_row_id"])) as Record<string, unknown> | undefined;

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Карточки ${id} у этого магазина нет.`);
  }

  const card = toCard(row);
  const byCard = { ...scoped, external_id: card.external_id };

  const [lineRows, linkRow, variants, characteristics] = await Promise.all([
    pg("mp_offer")
      .where(byCard)
      .whereNull("deleted_at")
      .select(
        "size_external",
        "warehouse_id",
        "warehouse_name",
        "price",
        "discount_price",
        "currency",
        "stock",
        "reserved",
        "measured_at",
      ) as Promise<Record<string, unknown>[]>,
    pg("mp_link").where(byCard).whereNull("deleted_at").first("id", "external_id", "product_id", "variant_id", "matched_by") as Promise<
      Record<string, unknown> | undefined
    >,
    tenantVariants({ container: scope, tenantId }),
    loadCharacteristics(pg, adapter.id, tenantId, asText(row.source_row_id)),
  ]);

  const lines: OfferLine[] = lineRows.map((line) => ({
    size_external: asText(line.size_external),
    warehouse_id: asText(line.warehouse_id),
    warehouse_name: asText(line.warehouse_name),
    price: asNumber(line.price),
    discount_price: asNumber(line.discount_price),
    currency: asText(line.currency),
    stock: asNumber(line.stock),
    reserved: asNumber(line.reserved),
    measured_at: asIso(line.measured_at),
  }));

  const link = linkRow ? toLink(linkRow) : undefined;
  const titles = await productTitles(pg, link ? [link.product_id] : []);
  const summary = buildProductRow(
    card,
    aggregateOfferLines(card.external_id, lines),
    productLink(card, link, candidatesBySku(variants), titles),
  );

  return {
    product: {
      /** The list's `offers` is a count; here the same key holds the lines themselves. */
      ...summary,
      photos: photoUrls(card.photos, "large"),
      attributes: attributesOf(row.attributes, characteristics),
      offers: offerLinesOf(lines, row.attributes),
    },
  };
};
