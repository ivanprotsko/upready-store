import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import {
  buildPriceStockRows,
  measuredOf,
  offersWithoutCard,
  priceStockCounts,
  type PriceStockCard,
  type PriceStockCounts,
  type PriceStockImport,
  type PriceStockLine,
  type PriceStockLink,
  type PriceStockRow,
  type PriceStockThresholds,
  type PriceStockVariant,
} from "../../../../../modules/marketplace/price-stock";
import { offerLinesOf, photoUrls, type ProductOfferLine } from "../../../../../modules/marketplace/products-list";
import { tenantVariants } from "../../../../../modules/marketplace/project";
import { shopFacts } from "../../catalog/catalog-data";

/**
 * Everything «Wildberries → Цены и остатки» shows, for one shop and one
 * marketplace (mp-section-design task-03).
 *
 * The decisions live in `modules/marketplace/price-stock.ts` and are pure.
 * This file only READS, and only our own database: `mp_product`, `mp_offer`,
 * `mp_link`, the succeeded `mp_sync_run` of the price and stock families, and
 * the shop's own price and stock through `shopFacts` — the SAME reader the
 * catalog screen uses, so two screens of one panel cannot disagree about what
 * a product costs in the shop (rule 19b). Opening the screen sends no request
 * to the marketplace; `__tests__/price-stock-read-only.unit.spec.ts` proves it
 * of every file of the screen rather than of this comment.
 *
 * The whole table is built on every request and then filtered, ordered and
 * paged in memory, the way the orders of task-04 are: the counts are of the
 * whole table whatever the filter, and the stand holds 423 cards over 12 035
 * lines, which one statement each reads in well under a second.
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

const LINE_COLUMNS = [
  "marketplace",
  "external_id",
  "offer_key",
  "vendor_code",
  "size_external",
  "sku_external",
  "storage_type",
  "warehouse_id",
  "warehouse_name",
  "price",
  "discount_price",
  "currency",
  "stock",
  "reserved",
  "measured_at",
];

const toLine = (row: Record<string, unknown>): PriceStockLine => ({
  marketplace: String(row.marketplace),
  external_id: String(row.external_id),
  offer_key: String(row.offer_key),
  vendor_code: asText(row.vendor_code),
  size_external: asText(row.size_external),
  sku_external: asText(row.sku_external),
  storage_type: asText(row.storage_type),
  warehouse_id: asText(row.warehouse_id),
  warehouse_name: asText(row.warehouse_name),
  price: asNumber(row.price),
  discount_price: asNumber(row.discount_price),
  currency: asText(row.currency),
  stock: asNumber(row.stock),
  reserved: asNumber(row.reserved),
  measured_at: asIso(row.measured_at),
});

/**
 * The currency of the marketplace's price list for this shop: the one most of
 * its lines name (WB reports one per cabinet). It prices the rows that have no
 * line of their own; with no line at all it is `null`, and those rows show no
 * shop price rather than one in a guessed currency.
 */
const commonCurrency = (lines: readonly PriceStockLine[]): string | null => {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line.currency) {
      counts.set(line.currency, (counts.get(line.currency) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [currency, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) {
      best = currency;
    }
  }
  return best;
};

/** The shop's variants with their title, thumbnail, price and stock. */
const shopVariants = async (scope: MedusaContainer, pg: Knex, tenantId: string): Promise<PriceStockVariant[]> => {
  const variants = await tenantVariants({ container: scope, tenantId });
  if (!variants.length) {
    return [];
  }
  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  const [facts, productRows] = await Promise.all([
    /** No product ids: the titles and thumbnails come from the query below, in one statement. */
    shopFacts(
      pg,
      variants.map((variant) => variant.id),
      [],
    ),
    pg("product").whereIn("id", productIds).whereNull("deleted_at").select("id", "title", "thumbnail") as Promise<
      { id: string; title: string | null; thumbnail: string | null }[]
    >,
  ]);
  const products = new Map(productRows.map((row) => [row.id, row]));

  return variants
    .filter((variant) => products.has(variant.product_id))
    .map((variant) => ({
      id: variant.id,
      product_id: variant.product_id,
      product_title: products.get(variant.product_id)?.title ?? null,
      thumbnail: products.get(variant.product_id)?.thumbnail ?? null,
      sku: variant.sku,
      prices: facts.prices.get(variant.id) ?? {},
      stock: facts.stock.has(variant.id) ? (facts.stock.get(variant.id) as number) : null,
    }));
};

export type PriceStockTable = {
  /** Every row of the marketplace's table, in the default order. */
  rows: PriceStockRow[];
  counts: PriceStockCounts;
  thresholds: PriceStockThresholds;
  measured: { prices_at: string | null; stocks_at: string | null };
  /**
   * What the tables hold, so the screen can tell its empty states apart:
   * no cards and no products at all, cards without a single price line yet,
   * or a filter that matched nothing (rule 20a). `offers_without_card` counts
   * the marketplace's priced cards that `mp_product` does not hold.
   */
  stored: { cards: number; lines: number; variants: number; offers_without_card: number };
};

export const loadPriceStockTable = async (
  scope: MedusaContainer,
  tenantId: string,
  adapter: MarketplaceAdapter,
  thresholds: PriceStockThresholds,
): Promise<PriceStockTable> => {
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const scoped = { tenant_id: tenantId, marketplace: adapter.id };

  const [cardRows, lineRows, linkRows, importRows, variants] = await Promise.all([
    pg("mp_product").where(scoped).whereNull("deleted_at").select("id", "external_id", "vendor_code", "title", "photos") as Promise<
      Record<string, unknown>[]
    >,
    pg("mp_offer").where(scoped).whereNull("deleted_at").select(LINE_COLUMNS) as Promise<Record<string, unknown>[]>,
    pg("mp_link").where(scoped).whereNull("deleted_at").select("external_id", "product_id", "variant_id") as Promise<
      Record<string, unknown>[]
    >,
    /** The newest succeeded run of every kind is all `lastImportOf` looks at. */
    pg("mp_sync_run")
      .where({ ...scoped, status: "succeeded" })
      .whereNull("deleted_at")
      .groupBy("kind")
      .select("kind")
      .max("finished_at as finished_at") as Promise<Record<string, unknown>[]>,
    shopVariants(scope, pg, tenantId),
  ]);

  const cards: PriceStockCard[] = cardRows.map((row) => ({
    id: String(row.id),
    external_id: String(row.external_id),
    vendor_code: asText(row.vendor_code),
    title: asText(row.title),
    thumbnail: photoUrls(row.photos, "thumb")[0] ?? null,
  }));
  const lines = lineRows.map(toLine);
  const links: PriceStockLink[] = linkRows.map((row) => ({
    external_id: String(row.external_id),
    product_id: String(row.product_id),
    variant_id: asText(row.variant_id),
  }));
  const imports: PriceStockImport[] = importRows.map((row) => ({
    marketplace: adapter.id,
    kind: String(row.kind),
    status: "succeeded",
    finished_at: asIso(row.finished_at),
  }));

  /**
   * The clock is read ONCE, here, and travels into the pure builder as an
   * argument: two `new Date()` inside the comparison would age two columns of
   * one screen against two different «сейчас» (rule 17a).
   */
  const now = new Date();
  const rows = buildPriceStockRows({
    marketplace: adapter.id,
    cards,
    lines,
    links,
    variants,
    imports,
    thresholds,
    currency: commonCurrency(lines),
    now,
  });

  return {
    rows,
    counts: priceStockCounts(rows),
    thresholds,
    measured: measuredOf(lines, imports, adapter.id),
    stored: {
      cards: cards.length,
      lines: lines.length,
      variants: variants.length,
      offers_without_card: offersWithoutCard(cards, lines),
    },
  };
};

/**
 * The lines of ONE card for the drawer «Строки по складам»: every size on
 * every warehouse, with the sizes named the way the card names them (the same
 * `offerLinesOf` the card page of «Товары» uses).
 *
 * A card that is not this shop's, or not this marketplace's, is a 404 — the
 * same answer as a card that does not exist, so the response never tells one
 * tenant that another's row is there.
 */
export const loadPriceStockLines = async (
  scope: MedusaContainer,
  tenantId: string,
  adapter: MarketplaceAdapter,
  externalId: string,
): Promise<{ lines: ProductOfferLine[] }> => {
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const byCard = { tenant_id: tenantId, marketplace: adapter.id, external_id: externalId };

  const [card, lineRows] = await Promise.all([
    pg("mp_product").where(byCard).whereNull("deleted_at").first("attributes") as Promise<
      { attributes: unknown } | undefined
    >,
    pg("mp_offer").where(byCard).whereNull("deleted_at").select(LINE_COLUMNS) as Promise<Record<string, unknown>[]>,
  ]);

  if (!card && !lineRows.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Карточки ${externalId} у этого магазина нет.`);
  }

  return { lines: offerLinesOf(lineRows.map(toLine), card?.attributes ?? null) };
};
