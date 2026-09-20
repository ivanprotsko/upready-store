import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace";
import { articleKey } from "../../../../modules/marketplace/catalog";
import {
  aggregateLines,
  buildPriceStockRows,
  DEFAULT_PRICE_STOCK_THRESHOLDS,
  filterByTab,
  priceStockCounts,
  priceStockSummary,
  type PriceStockCard,
  type PriceStockCounts,
  type PriceStockImport,
  type PriceStockLine,
  type PriceStockRow,
  type PriceStockSources,
  type PriceStockTab,
  type PriceStockThresholds,
  type PriceStockVariant,
} from "../../../../modules/marketplace/price-stock";
import { SOURCE_LABELS } from "../../../../modules/marketplace/order-feed";
import { tenantVariants } from "../../../../modules/marketplace/project";
import { MARKETPLACE_IDS } from "../../../../modules/marketplace/registry";
import type MarketplaceModuleService from "../../../../modules/marketplace/service";
import { shopFacts } from "../catalog/catalog-data";

/**
 * Everything «Маркетплейсы → Цены и остатки» shows, for one shop
 * (w17-mp-price-stock-table).
 *
 * The decisions live in `modules/marketplace/price-stock.ts` and are pure.
 * This file only READS: the normalized `mp_*` layer through the module
 * service, the import journal for the freshness, and the shop's own price and
 * stock through `shopFacts` — the SAME reader the catalog screen uses, so the
 * two screens of one panel cannot disagree about what a product costs in the
 * shop (rule 19b).
 *
 * READ-ONLY, with nothing to enforce here: this file opens no socket toward a
 * marketplace, and `__tests__/price-stock-read-only.unit.spec.ts` proves it of
 * every file of the screen rather than of this comment.
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

/** Where the numbers came from, named table by table, for the screen's zero. */
export const priceStockSources = (tenantId: string): PriceStockSources => ({
  cards: `mp_product (tenant_id=${tenantId})`,
  lines: `mp_offer (tenant_id=${tenantId})`,
  variants: `product_variant через tenant_tenant_product_product (tenant_id=${tenantId})`,
  imports: `mp_sync_run (tenant_id=${tenantId}, status='succeeded')`,
});

export type PriceStockPayload = {
  rows: PriceStockRow[];
  counts: PriceStockCounts;
  summary: string;
  thresholds: PriceStockThresholds;
  /** Column order of the screen and of the export, from the adapter registry. */
  marketplaces: string[];
  /**
   * How each marketplace is CALLED on the screen. Taken from the same map the
   * order desk prints («Wildberries», «Ozon»), so the two screens of one panel
   * do not name one marketplace two ways, and an unregistered label falls back
   * to the id rather than to a blank header (rule 20).
   */
  marketplace_labels: Record<string, string>;
  sources: PriceStockSources;
  /** What the raw layers hold, so a zero on the screen can be told from an empty import. */
  stored: { cards: number; lines: number; variants: number; imports: number };
  /** The moment the ages on this screen were measured against (rule 17a). */
  as_of: string;
};

/**
 * Thresholds from the query string, each falling back to the default when it
 * is absent or not a number. A threshold read as `NaN` would highlight nothing
 * and look like «расхождений нет» (rule 20a).
 */
export const priceStockThresholdsFromQuery = (
  query: Record<string, unknown>,
): PriceStockThresholds => {
  const read = (name: keyof PriceStockThresholds): number => {
    const raw = query[name];
    if (raw === undefined || raw === null || raw === "") {
      return DEFAULT_PRICE_STOCK_THRESHOLDS[name];
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PRICE_STOCK_THRESHOLDS[name];
  };

  return { price_pct: read("price_pct"), stock_abs: read("stock_abs") };
};

const TABS: readonly PriceStockTab[] = ["both", "shop_only", "marketplace_only", "over_threshold"];

/** The tab from the query string, or `null` for «все строки». An unknown tab is `null`. */
export const tabFromQuery = (query: Record<string, unknown>): PriceStockTab | null => {
  const raw = query.tab;
  const value = raw === undefined || raw === null ? "" : String(raw);
  return (TABS as readonly string[]).includes(value) ? (value as PriceStockTab) : null;
};

export const loadPriceStock = async (
  scope: MedusaContainer,
  tenantId: string,
  options: { thresholds?: PriceStockThresholds; tab?: PriceStockTab | null } = {},
): Promise<PriceStockPayload> => {
  const mp = scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const thresholds = options.thresholds ?? DEFAULT_PRICE_STOCK_THRESHOLDS;

  const [productRows, offerRows, runRows, variantRows] = await Promise.all([
    mp.listMpProducts({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpOffers({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpSyncRuns({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    tenantVariants({ container: scope, tenantId }),
  ]);

  const productIds = [...new Set(variantRows.map((variant) => variant.product_id))];
  const facts = await shopFacts(
    pg,
    variantRows.map((variant) => variant.id),
    productIds,
  );

  const cards: PriceStockCard[] = productRows.map((row) => ({
    marketplace: String(row.marketplace),
    external_id: String(row.external_id),
    vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    title: row.title ? String(row.title) : null,
  }));

  const lines: PriceStockLine[] = offerRows.map((row) => ({
    marketplace: String(row.marketplace),
    external_id: String(row.external_id),
    offer_key: String(row.offer_key),
    vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    size_external: row.size_external ? String(row.size_external) : null,
    sku_external: row.sku_external ? String(row.sku_external) : null,
    storage_type: row.storage_type ? String(row.storage_type) : null,
    warehouse_id: row.warehouse_id ? String(row.warehouse_id) : null,
    warehouse_name: row.warehouse_name ? String(row.warehouse_name) : null,
    price: asNumber(row.price),
    discount_price: asNumber(row.discount_price),
    currency: row.currency ? String(row.currency) : null,
    stock: asNumber(row.stock),
    reserved: asNumber(row.reserved),
    measured_at: asIso(row.measured_at),
  }));

  const imports: PriceStockImport[] = runRows.map((row) => ({
    marketplace: String(row.marketplace),
    kind: String(row.kind),
    status: String(row.status),
    finished_at: asIso(row.finished_at),
  }));

  const variants: PriceStockVariant[] = variantRows.map((variant) => ({
    id: variant.id,
    product_id: variant.product_id,
    product_title: facts.products.get(variant.product_id)?.title ?? null,
    sku: variant.sku,
    prices: facts.prices.get(variant.id) ?? {},
    stock: facts.stock.has(variant.id) ? (facts.stock.get(variant.id) as number) : null,
  }));

  /**
   * The clock is read ONCE, here, and travels into the pure builder as an
   * argument: two `new Date()` inside the comparison would age two columns of
   * one screen against two different «сейчас» (rule 17a).
   */
  const now = new Date();

  const all = buildPriceStockRows({
    cards,
    lines,
    variants,
    imports,
    marketplaces: [...MARKETPLACE_IDS],
    thresholds,
    now,
  });

  /**
   * The counts are of the WHOLE table and the rows are of the tab. A tab that
   * counted only itself would make the tab labels change as the owner clicks
   * between them, and the three-groups arithmetic unverifiable.
   */
  const counts = priceStockCounts(all);
  const rows = options.tab ? filterByTab(all, options.tab) : all;
  const sources = priceStockSources(tenantId);

  return {
    rows,
    counts,
    summary: priceStockSummary(
      counts,
      { cards: cards.length, lines: lines.length, variants: variants.length },
      sources,
    ),
    thresholds,
    marketplaces: [...MARKETPLACE_IDS],
    marketplace_labels: Object.fromEntries(
      MARKETPLACE_IDS.map((id) => [
        id,
        (SOURCE_LABELS as Record<string, string>)[id] ?? id,
      ]),
    ),
    sources,
    stored: {
      cards: cards.length,
      lines: lines.length,
      variants: variants.length,
      imports: imports.length,
    },
    as_of: now.toISOString(),
  };
};

/** One expanded row: every warehouse and size line behind one article. */
export type PriceStockLinesPayload = {
  vendor_code: string;
  columns: {
    marketplace: string;
    /** The number the collapsed row shows. It IS the sum of `lines` below. */
    stock: number | null;
    stock_lines: number;
    price: number | null;
    discount_price: number | null;
    effective_price: number | null;
    currency: string | null;
    lines: PriceStockLine[];
  }[];
  /** What the caller can assert: the sum of the expanded stocks, recomputed here. */
  stock_check: { marketplace: string; collapsed: number | null; sum_of_lines: number | null }[];
};

/**
 * The expansion of ONE article (deliverable 1: «строка раскрывается в свои
 * склады и размеры»).
 *
 * WHY A SEPARATE ROUTE. The stand holds 11 819 `mp_offer` lines against 463
 * cards, so shipping every line with the table would be megabytes of JSON for
 * a screen that expands one row at a time. Nothing is capped: the list route
 * carries the line COUNT of every column, and this route returns ALL lines of
 * the article asked for.
 *
 * The collapsed number and the expanded lines come through `aggregateLines` —
 * the same function the table uses — so «свёрнутый остаток = сумма
 * развёрнутых» is one function's output compared with itself, not two
 * implementations agreeing today. `stock_check` recomputes the sum from the
 * returned lines so the acceptor can assert it without trusting either.
 */
export const loadPriceStockLines = async (
  scope: MedusaContainer,
  tenantId: string,
  vendorCode: string,
): Promise<PriceStockLinesPayload> => {
  const mp = scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const wanted = articleKey(vendorCode);

  const [productRows, offerRows] = await Promise.all([
    mp.listMpProducts({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
    mp.listMpOffers({ tenant_id: tenantId }) as Promise<Record<string, unknown>[]>,
  ]);

  const articleOfCard = new Map<string, string | null>(
    productRows.map((row) => [
      `${String(row.marketplace)}|${String(row.external_id)}`,
      articleKey(row.vendor_code ? String(row.vendor_code) : null),
    ]),
  );

  const mine = offerRows
    .map((row): PriceStockLine => ({
      marketplace: String(row.marketplace),
      external_id: String(row.external_id),
      offer_key: String(row.offer_key),
      vendor_code: row.vendor_code ? String(row.vendor_code) : null,
      size_external: row.size_external ? String(row.size_external) : null,
      sku_external: row.sku_external ? String(row.sku_external) : null,
      storage_type: row.storage_type ? String(row.storage_type) : null,
      warehouse_id: row.warehouse_id ? String(row.warehouse_id) : null,
      warehouse_name: row.warehouse_name ? String(row.warehouse_name) : null,
      price: asNumber(row.price),
      discount_price: asNumber(row.discount_price),
      currency: row.currency ? String(row.currency) : null,
      stock: asNumber(row.stock),
      reserved: asNumber(row.reserved),
      measured_at: asIso(row.measured_at),
    }))
    .filter((line) => {
      const key =
        articleOfCard.get(`${line.marketplace}|${line.external_id}`) ?? articleKey(line.vendor_code);
      return key !== null && key === wanted;
    });

  const columns = MARKETPLACE_IDS.map((marketplace) => {
    const lines = mine
      .filter((line) => line.marketplace === marketplace)
      .sort(
        (left, right) =>
          (left.warehouse_name ?? "").localeCompare(right.warehouse_name ?? "", "ru") ||
          (left.size_external ?? "").localeCompare(right.size_external ?? "", "ru"),
      );
    const aggregate = aggregateLines(lines);

    return {
      marketplace,
      stock: aggregate.stock,
      stock_lines: aggregate.stock_lines,
      price: aggregate.price,
      discount_price: aggregate.discount_price,
      effective_price: aggregate.effective_price,
      currency: aggregate.currency,
      lines,
    };
  }).filter((column) => column.lines.length > 0);

  return {
    vendor_code: vendorCode,
    columns,
    stock_check: columns.map((column) => {
      const reported = column.lines.filter((line) => line.stock !== null);
      return {
        marketplace: column.marketplace,
        collapsed: column.stock,
        sum_of_lines: reported.length
          ? reported.reduce((sum, line) => sum + (line.stock as number), 0)
          : null,
      };
    }),
  };
};
