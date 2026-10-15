import { MedusaError } from "@medusajs/framework/utils";
import { DEFAULT_PRICE_STOCK_THRESHOLDS, type PriceStockThresholds } from "./freshness";
import { PRICE_STOCK_STATES, type PriceStockState } from "./rows";

/**
 * The query string of the table and of its export.
 *
 * `../price-stock.ts` re-exports what callers use from here (t-2026-10-14-55).
 */


export const PRICE_STOCK_ORDER_FIELDS = ["title", "vendor_code", "price_pct", "stock_abs"] as const;
export type PriceStockOrderField = (typeof PRICE_STOCK_ORDER_FIELDS)[number];

export const DEFAULT_PRICE_STOCK_LIMIT = 20;
const MAX_PRICE_STOCK_LIMIT = 200;

/** The export's ceiling, the same as the orders' (task-04). The stand holds about 500 rows. */
export const PRICE_STOCK_EXPORT_LIMIT = 10_000;

export type PriceStockQuery = {
  limit: number;
  offset: number;
  q: string | null;
  /** `null` is the default order: highlighted first, then by state, then by title. */
  order: { field: PriceStockOrderField; desc: boolean } | null;
  states: PriceStockState[] | null;
  over_threshold: boolean;
  thresholds: PriceStockThresholds;
};

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/** `a,b,c` as the panel's filter row writes it, or a repeated key. Empty items are dropped. */
const listOf = (raw: unknown): string[] | null => {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)] : null;
};

const integer = (raw: unknown, name: string, fallback: number, min: number, max: number): number => {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw invalid(`${name} должен быть целым числом не меньше ${min}, пришло «${String(raw)}».`);
  }
  return Math.min(parsed, max);
};

/**
 * The query string of `GET /tenants/marketplaces/:marketplace/price-stock` and
 * of its export.
 *
 * Anything the server cannot honour is a 400 that names what exists, never a
 * quiet fallback: a table the owner believes is cut at «20 %» while it is cut
 * at the default 10 looks right and is not (rule 20a).
 */
export const parsePriceStockQuery = (query: Record<string, unknown>): PriceStockQuery => {
  let order: PriceStockQuery["order"] = null;
  if (query.order !== undefined && query.order !== null && query.order !== "") {
    const raw = String(query.order);
    const desc = raw.startsWith("-");
    const field = desc ? raw.slice(1) : raw;
    if (!(PRICE_STOCK_ORDER_FIELDS as readonly string[]).includes(field)) {
      throw invalid(`order: поля «${field}» нет. Есть: ${PRICE_STOCK_ORDER_FIELDS.join(", ")} (с «-» по убыванию).`);
    }
    order = { field: field as PriceStockOrderField, desc };
  }

  const states = listOf(query.state);
  const unknownState = states?.find((state) => !(PRICE_STOCK_STATES as readonly string[]).includes(state));
  if (unknownState) {
    throw invalid(`state: значения «${unknownState}» нет. Есть: ${PRICE_STOCK_STATES.join(", ")}.`);
  }

  const overRaw = query.over_threshold === undefined || query.over_threshold === null ? "" : String(query.over_threshold);
  if (!["", "true", "false"].includes(overRaw)) {
    throw invalid(`over_threshold: ожидается true или false, пришло «${overRaw}».`);
  }

  const q = query.q === undefined || query.q === null ? "" : String(query.q).trim();

  return {
    limit: integer(query.limit, "limit", DEFAULT_PRICE_STOCK_LIMIT, 1, MAX_PRICE_STOCK_LIMIT),
    offset: integer(query.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    q: q || null,
    order,
    states: states as PriceStockState[] | null,
    over_threshold: overRaw === "true",
    thresholds: {
      price_pct: integer(query.price_pct, "price_pct", DEFAULT_PRICE_STOCK_THRESHOLDS.price_pct, 0, Number.MAX_SAFE_INTEGER),
      stock_abs: integer(query.stock_abs, "stock_abs", DEFAULT_PRICE_STOCK_THRESHOLDS.stock_abs, 0, Number.MAX_SAFE_INTEGER),
    },
  };
};
