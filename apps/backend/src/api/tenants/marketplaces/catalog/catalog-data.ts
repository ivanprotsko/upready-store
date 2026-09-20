import path from "path";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace";
import {
  buildCatalogRows,
  catalogCounts,
  catalogSummary,
  DEFAULT_THRESHOLDS,
  type CatalogCard,
  type CatalogCounts,
  type CatalogOffer,
  type CatalogRow,
  type CatalogSources,
  type CatalogThresholds,
  type ShopEnrichment,
  type ShopVariant,
  type StoredLink,
} from "../../../../modules/marketplace/catalog";
import { tenantVariants } from "../../../../modules/marketplace/project";
import type MarketplaceModuleService from "../../../../modules/marketplace/service";

/**
 * Everything the «Маркетплейсы → Каталог» screen shows, for one shop
 * (w14-mp-catalog-link).
 *
 * The decisions are in `modules/marketplace/catalog.ts` and are pure. This
 * file only READS: the normalized `mp_*` layer through the module service, and
 * the shop's own price, stock and photo counts straight off the shared
 * Postgres connection.
 *
 * WHY RAW SQL FOR THE SHOP HALF. A price in this catalog is a row of `price`
 * under a price set, a stock is a sum over `inventory_level`, and a photo
 * count is a count of `image` — three aggregates over three modules. The graph
 * would return every price of every currency of every variant (241 regions are
 * seeded, so that is tens of thousands of rows) for the panel to add up. The
 * aggregate belongs in the database, and the joins here are the ones the Admin
 * screens use, named column by column.
 *
 * READ-ONLY toward the marketplaces, with nothing to enforce: this file sends
 * no request anywhere. Everything it reads is already in our database.
 */

/** Where the numbers came from, for the screen to print when a count is zero. */
export const catalogSources = (tenantId: string): CatalogSources => ({
  /**
   * The absolute path of the rule THIS process is running, computed rather
   * than typed: on a stand it is the `.ts` under `src`, in the image it is the
   * compiled file under `.medusa/server`, and naming the wrong one would send
   * the reader to a file that is not deciding anything (rule 17a).
   */
  matcher: path.resolve(__dirname, "../../../../modules/marketplace/link.ts"),
  cards: `mp_product (tenant_id=${tenantId})`,
  variants: `product_variant через tenant_tenant_product_product (tenant_id=${tenantId})`,
  links: `mp_link (tenant_id=${tenantId})`,
});

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

const photoCount = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/**
 * The shop's own price, stock and photo count for a set of variants.
 *
 * `price_list_id is null` keeps a sale price out of the comparison: a price
 * list is a temporary override with its own dates, and comparing it against a
 * marketplace price would call a running promotion a mismatch every time.
 *
 * EXPORTED because «Маркетплейсы → Цены и остатки» (w17-mp-price-stock-table)
 * reads the same three numbers. Two readers would be two answers to «какая у
 * товара цена в магазине» on two screens of one panel, and the owner would be
 * right to trust neither (rule 19b).
 */
export const shopFacts = async (
  pg: Knex,
  variantIds: readonly string[],
  productIds: readonly string[],
): Promise<{
  prices: Map<string, Record<string, number>>;
  stock: Map<string, number>;
  products: Map<string, { title: string | null; photos: number }>;
}> => {
  const prices = new Map<string, Record<string, number>>();
  const stock = new Map<string, number>();
  const products = new Map<string, { title: string | null; photos: number }>();

  if (!variantIds.length) {
    return { prices, stock, products };
  }

  const priceRows = (await pg("product_variant_price_set as vps")
    .join("price as pr", "pr.price_set_id", "vps.price_set_id")
    .whereIn("vps.variant_id", variantIds as string[])
    .whereNull("vps.deleted_at")
    .whereNull("pr.deleted_at")
    .whereNull("pr.price_list_id")
    .groupBy("vps.variant_id", "pr.currency_code")
    .select("vps.variant_id as variant_id", "pr.currency_code as currency_code")
    .min("pr.amount as amount")) as {
    variant_id: string;
    currency_code: string;
    amount: unknown;
  }[];

  for (const row of priceRows) {
    const amount = asNumber(row.amount);
    if (amount === null) {
      continue;
    }
    const bucket = prices.get(row.variant_id) ?? {};
    bucket[String(row.currency_code).toLowerCase()] = amount;
    prices.set(row.variant_id, bucket);
  }

  const stockRows = (await pg("product_variant_inventory_item as pvi")
    .join("inventory_level as il", "il.inventory_item_id", "pvi.inventory_item_id")
    .whereIn("pvi.variant_id", variantIds as string[])
    .whereNull("pvi.deleted_at")
    .whereNull("il.deleted_at")
    .groupBy("pvi.variant_id")
    .select("pvi.variant_id as variant_id")
    .sum("il.stocked_quantity as stocked")) as {
    variant_id: string;
    stocked: unknown;
  }[];

  for (const row of stockRows) {
    const stocked = asNumber(row.stocked);
    if (stocked !== null) {
      stock.set(row.variant_id, stocked);
    }
  }

  if (productIds.length) {
    const productRows = (await pg("product as p")
      .leftJoin("image as i", function joinImages() {
        this.on("i.product_id", "=", "p.id").onNull("i.deleted_at");
      })
      .whereIn("p.id", productIds as string[])
      .groupBy("p.id", "p.title")
      .select("p.id as id", "p.title as title")
      .count("i.id as photos")) as { id: string; title: string | null; photos: unknown }[];

    for (const row of productRows) {
      products.set(row.id, { title: row.title ?? null, photos: asNumber(row.photos) ?? 0 });
    }
  }

  return { prices, stock, products };
};

/**
 * What `w07-tenant-catalog-enrich` recorded for these products
 * (`product_marketplace_link`, PR #74, merged 2026-09-16).
 *
 * Read with SQL and not through w07's module service for the same reason the
 * price and the stock are: it is one row per product and the alternative is
 * resolving another module's service here just to list it. The column set is
 * that module's own (`models/product-marketplace-link.ts`).
 *
 * A shop whose enrichment has never run gets an empty map and the screen says
 * nothing — it does NOT say «обновлено» with an invented date.
 */
const enrichmentByProduct = async (
  pg: Knex,
  productIds: readonly string[],
): Promise<Map<string, ShopEnrichment>> => {
  const index = new Map<string, ShopEnrichment>();

  if (!productIds.length) {
    return index;
  }

  const rows = (await pg("product_marketplace_link")
    .select("product_id", "marketplace", "external_id", "matched_by", "linked_at")
    .whereIn("product_id", productIds as string[])
    .whereNull("deleted_at")
    .orderBy("linked_at", "desc")) as {
    product_id: string;
    marketplace: string;
    external_id: string;
    matched_by: string;
    linked_at: unknown;
  }[];

  for (const row of rows) {
    /** Newest first, so the first row of a product is the one that stands. */
    if (!index.has(row.product_id)) {
      index.set(row.product_id, {
        marketplace: row.marketplace,
        external_id: row.external_id,
        matched_by: row.matched_by,
        linked_at: asIso(row.linked_at),
      });
    }
  }

  return index;
};

export type CatalogPayload = {
  rows: CatalogRow[];
  counts: CatalogCounts;
  summary: string;
  thresholds: CatalogThresholds;
  sources: CatalogSources;
  /** What the raw layers hold, so a zero on the screen can be told from an empty import. */
  stored: {
    cards: number;
    offers: number;
    links: number;
    variants: number;
    enriched: number;
  };
};

export const loadCatalog = async (
  scope: MedusaContainer,
  tenantId: string,
  thresholds: CatalogThresholds = DEFAULT_THRESHOLDS,
): Promise<CatalogPayload> => {
  const mp = scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const [productRows, offerRows, linkRows, variantRows] = await Promise.all([
    mp.listMpProducts({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpOffers({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpLinks({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    tenantVariants({ container: scope, tenantId }),
  ]);

  const productIds = [...new Set(variantRows.map((variant) => variant.product_id))];
  const [facts, enrichment] = await Promise.all([
    shopFacts(
      pg,
      variantRows.map((variant) => variant.id),
      productIds,
    ),
    enrichmentByProduct(pg, productIds),
  ]);

  const cards: CatalogCard[] = productRows.map((row) => ({
    marketplace: String(row.marketplace),
    external_id: String(row.external_id),
    vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    title: row.title ? String(row.title) : null,
    photos: photoCount(row.photos),
    mp_updated_at: asIso(row.mp_updated_at),
  }));

  const offers: CatalogOffer[] = offerRows.map((row) => ({
    marketplace: String(row.marketplace),
    external_id: String(row.external_id),
    price: asNumber(row.price),
    discount_price: asNumber(row.discount_price),
    currency: row.currency ? String(row.currency) : null,
    stock: asNumber(row.stock),
  }));

  const links: StoredLink[] = linkRows.map((row) => ({
    id: String(row.id),
    marketplace: String(row.marketplace),
    external_id: String(row.external_id),
    product_id: String(row.product_id),
    variant_id: row.variant_id ? String(row.variant_id) : null,
    matched_by: String(row.matched_by),
    linked_at: asIso(row.linked_at),
  }));

  const variants: ShopVariant[] = variantRows.map((variant) => {
    const product = facts.products.get(variant.product_id);
    return {
      id: variant.id,
      product_id: variant.product_id,
      product_title: product?.title ?? null,
      sku: variant.sku,
      prices: facts.prices.get(variant.id) ?? {},
      stock: facts.stock.has(variant.id) ? (facts.stock.get(variant.id) as number) : null,
      photos: product?.photos ?? 0,
      enriched: enrichment.get(variant.product_id) ?? null,
    };
  });

  const rows = buildCatalogRows({ cards, offers, variants, links, thresholds });
  const counts = catalogCounts(rows);
  const sources = catalogSources(tenantId);

  return {
    rows,
    counts,
    summary: catalogSummary(counts, { total: cards.length }, sources),
    thresholds,
    sources,
    stored: {
      cards: cards.length,
      offers: offers.length,
      links: links.length,
      variants: variants.length,
      /** How many products the content enrichment (w07) has touched. */
      enriched: enrichment.size,
    },
  };
};

/**
 * Thresholds from the query string, each falling back to the default when it
 * is absent or not a number. A threshold read as `NaN` would highlight nothing
 * and look like "no differences" (rule 20a), so a bad value is refused here
 * rather than carried into the comparison.
 */
export const thresholdsFromQuery = (query: Record<string, unknown>): CatalogThresholds => {
  const read = (name: keyof CatalogThresholds): number => {
    const raw = query[name];
    if (raw === undefined || raw === null || raw === "") {
      return DEFAULT_THRESHOLDS[name];
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_THRESHOLDS[name];
  };

  return {
    price_pct: read("price_pct"),
    stock_abs: read("stock_abs"),
    photos_abs: read("photos_abs"),
  };
};
