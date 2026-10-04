import { MedusaError } from "@medusajs/framework/utils";
import type { OrderStatusKey } from "./order-status";
import { ORDER_STATUS_KEYS, ORDER_STATUS_LABELS, statusKeyOf } from "./order-status";

/**
 * The orders of ONE marketplace as the import stored them in `mp_order`
 * («Wildberries → Заказы», mp-section-design task-04; first built as the
 * single feed of w15-mp-orders-desk).
 *
 * What changed against w15: the shop's own orders are no longer mixed in
 * (they live under «Продажи → Заказы», decision 4.1 of the design round), the
 * list is ONE marketplace, and no period is applied unless the owner picks a
 * date: the screen lists every order the marketplace sent, the way `/orders`
 * lists every order of the shop.
 *
 * READ-ONLY, BY CONSTRUCTION. Nothing in this file, and nothing in the routes
 * that use it, can reach a marketplace: the rows come from `mp_order` /
 * `mp_order_line`, which the projector fills from mirrors that were imported
 * by a script. There is no adapter here, no `read`, no endpoint id, and the
 * suite `__tests__/order-feed-read-only.unit.spec.ts` fails the moment one
 * appears. Ivan's order of 2026-09-16 02:46 WITA: the screen SHOWS marketplace
 * orders and never changes them.
 *
 * THE PURE HALF IS HERE ON PURPOSE. Reading the query, filtering, sorting, the
 * facets and the CSV are functions of their arguments, so they are tested
 * without a stand and the routes stay thin.
 */

/** The period «Аналитика» opens on, and the number it must SAY on the screen. */
export const DEFAULT_PERIOD_DAYS = 30;

/** The marketplace a row came from. */
export type FeedSource = "wb" | "ozon";

export type FeedRow = {
  /** `mp_order.id` (`mporder_…`), what the order card is opened by. */
  id: string;
  source: FeedSource;
  /** «Wildberries», «Ozon». */
  source_label: string;
  /** The number the owner knows the order by: the marketplace's own id. */
  number: string;
  /** `FBS | FBO | DBS | rFBS | …`, `null` where the marketplace's method does not say. */
  scheme: string | null;
  /** The marketplace's own word, untouched. */
  status_raw: string | null;
  /** Its second word (WB `wbStatus`, Ozon `substatus`), untouched. */
  status_detail: string | null;
  /** The key the filter works on. */
  status_key: OrderStatusKey;
  /** What that key is called on the screen. */
  status_label: string;
  ordered_at: string | null;
  buyer_region: string | null;
  warehouse_name: string | null;
  total: number | null;
  currency: string | null;
  is_cancelled: boolean;
  lines_count: number;
};

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  /**
   * The two bounds as calendar days, `YYYY-MM-DD`.
   *
   * The screen prints the period, and printing it from the INSTANT is how a
   * label goes wrong by a day: `to` is 23:59:59.999Z, which in the shop's own
   * WITA (UTC+8) renders as the NEXT morning, so «последние 30 дней» read
   * «18 августа — 17 сентября» while the filter meant the 16th (measured on
   * the stand, 2026-09-16). These strings are the days the filter actually
   * used, and the screen formats them without a timezone in the way.
   */
  from_day: string;
  to_day: string;
  days: number;
  /** True when the caller named no period and got the default 30 days. */
  is_default: boolean;
};

/** `YYYY-MM-DD` of a UTC instant — the same calendar day the bounds are built on. */
const dayOf = (value: Date): string => value.toISOString().slice(0, 10);

const startOfDay = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));

const endOfDay = (value: Date): Date =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * The period the query asks for, or the last 30 days. «Аналитика» reads its
 * period through this; the order list does not apply one at all.
 *
 * `now` is an ARGUMENT, not `new Date()` inside: the tests pin it, and a
 * function that reads the clock itself cannot be measured (rule 17a).
 *
 * A half-open period is legal — «с 1 сентября» with no end, «по 10 сентября»
 * with no start — and only the missing end is filled from `now`. `is_default`
 * is true only when NEITHER end was named, because that is the case the screen
 * has to announce as its own choice rather than the owner's.
 */
export const resolvePeriod = (
  query: { from?: unknown; to?: unknown },
  now: Date = new Date(),
): ResolvedPeriod => {
  const askedFrom = parseDate(query.from);
  const askedTo = parseDate(query.to);

  const to = endOfDay(askedTo ?? now);
  const from = askedFrom
    ? startOfDay(askedFrom)
    : startOfDay(new Date(to.getTime() - (DEFAULT_PERIOD_DAYS - 1) * 24 * 60 * 60 * 1000));

  /** Inclusive: «с 1 по 30 сентября» is 30 days, not 29. */
  const days = Math.max(1, Math.round((endOfDay(to).getTime() - from.getTime()) / 86_400_000));

  return {
    from,
    to,
    from_day: dayOf(from),
    to_day: dayOf(to),
    days,
    is_default: !askedFrom && !askedTo,
  };
};

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => asList(entry));
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const SOURCE_LABELS: Record<FeedSource, string> = {
  wb: "Wildberries",
  ozon: "Ozon",
};

/* ----------------------------------------------------------------------------
 * The query of the list: `q`, `status`, `scheme`, `ordered_at`, `order`
 * ------------------------------------------------------------------------- */

/**
 * The value of the scheme filter that means «the marketplace did not say».
 * WB's statistics method carries no scheme at all (19 717 of 30 382 orders on
 * the stand, 2026-10-05), and a filter that could not pick those out would
 * leave the owner no way to see them apart.
 */
export const NO_SCHEME = "none";
export const NO_SCHEME_LABEL = "Без схемы";

export const MP_ORDER_SORT_FIELDS = ["ordered_at", "total", "number"] as const;
export type MpOrderSortField = (typeof MP_ORDER_SORT_FIELDS)[number];

/** Newest first, as `/orders` of the shop opens. */
export const DEFAULT_MP_ORDER_SORT: MpOrderSort = { field: "ordered_at", desc: true };

export type MpOrderSort = { field: MpOrderSortField; desc: boolean };

/** The bounds of the date filter, as the panel's date filter writes them. */
export type MpOrderDateRange = { $gte?: Date; $gt?: Date; $lte?: Date; $lt?: Date };

export type MpOrdersQuery = {
  /** Lower-cased, trimmed; `null` when there is nothing to search for. */
  q: string | null;
  statuses: OrderStatusKey[];
  /** Upper-cased marketplace words, and `none` for «без схемы». */
  schemes: string[];
  ordered_at: MpOrderDateRange | null;
  sort: MpOrderSort;
};

const DATE_OPERATORS = ["$gte", "$gt", "$lte", "$lt"] as const;

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * `ordered_at` arrives the way the panel's date filter writes it, a JSON
 * object `{"$gte":"…","$lte":"…"}` in one query parameter; a client that sends
 * `ordered_at[$gte]=…` gets the object already parsed. Anything else is a 400
 * rather than an ignored filter: a list the owner believes is narrowed to
 * «последние 7 дней» while it is not would be a wrong answer with no sign on it.
 */
const resolveDateRange = (value: unknown): MpOrderDateRange | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      throw invalid(`ordered_at: ожидается JSON вида {"$gte":"…"}, пришло ${value.slice(0, 80)}`);
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalid("ordered_at: ожидается объект с $gte, $gt, $lte или $lt");
  }
  const range: MpOrderDateRange = {};
  for (const [key, bound] of Object.entries(raw as Record<string, unknown>)) {
    if (!(DATE_OPERATORS as readonly string[]).includes(key)) {
      throw invalid(`ordered_at: неизвестный оператор ${key}`);
    }
    const at = parseDate(bound);
    if (!at) {
      throw invalid(`ordered_at.${key}: не дата`);
    }
    range[key as (typeof DATE_OPERATORS)[number]] = at;
  }
  return Object.keys(range).length ? range : null;
};

const resolveSort = (value: unknown): MpOrderSort => {
  const raw = typeof value === "string" ? value.trim() : "";
  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;
  if (!(MP_ORDER_SORT_FIELDS as readonly string[]).includes(field)) {
    return DEFAULT_MP_ORDER_SORT;
  }
  return { field: field as MpOrderSortField, desc };
};

/**
 * The query string of the list and of its CSV, read once.
 *
 * An unknown status or sort field is DROPPED rather than made to match
 * nothing: a link with a stale value in it shows the list instead of an empty
 * table the owner cannot explain. An empty list means «no filter on this
 * dimension». The tenant is NOT in here: it comes from the token
 * (`getTenantScope`), never from the query.
 */
export const resolveMpOrdersQuery = (query: Record<string, unknown>): MpOrdersQuery => {
  const statuses = asList(query.status).filter((one): one is OrderStatusKey =>
    ORDER_STATUS_KEYS.includes(one as OrderStatusKey),
  );
  /** Schemes are the marketplaces' own words, so they are matched case-insensitively. */
  const schemes = asList(query.scheme).map((one) =>
    one.toLowerCase() === NO_SCHEME ? NO_SCHEME : one.toUpperCase(),
  );
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim().toLowerCase() : null;

  return {
    q,
    statuses: [...new Set(statuses)],
    schemes: [...new Set(schemes)],
    ordered_at: resolveDateRange(query.ordered_at),
    sort: resolveSort(query.order),
  };
};

/** The page of the list: 20 by default, as the screen asks, and never more than 200. */
export const resolvePage = (query: Record<string, unknown>): { limit: number; offset: number } => {
  const limitRaw = Number(query.limit ?? 20);
  const offsetRaw = Number(query.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 200) : 20;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
};

const inRange = (orderedAt: string | null, range: MpOrderDateRange): boolean => {
  /**
   * An order the marketplace never dated is outside EVERY date range. Claiming
   * it falls inside «последние 7 дней» would make the count a number nobody can
   * reproduce in SQL; without a date filter it is in the list, last.
   */
  if (!orderedAt) {
    return false;
  }
  const at = new Date(orderedAt).getTime();
  if (Number.isNaN(at)) {
    return false;
  }
  if (range.$gte && at < range.$gte.getTime()) return false;
  if (range.$gt && at <= range.$gt.getTime()) return false;
  if (range.$lte && at > range.$lte.getTime()) return false;
  if (range.$lt && at >= range.$lt.getTime()) return false;
  return true;
};

/** `q` looks in the two fields the screen names: the number and the buyer's region. */
export const matchesMpOrdersQuery = (row: FeedRow, query: MpOrdersQuery): boolean => {
  if (query.statuses.length && !query.statuses.includes(row.status_key)) {
    return false;
  }
  if (query.schemes.length) {
    const scheme = row.scheme ? row.scheme.toUpperCase() : NO_SCHEME;
    if (!query.schemes.includes(scheme)) {
      return false;
    }
  }
  if (query.ordered_at && !inRange(row.ordered_at, query.ordered_at)) {
    return false;
  }
  if (query.q) {
    const inNumber = row.number.toLowerCase().includes(query.q);
    const inRegion = row.buyer_region ? row.buyer_region.toLowerCase().includes(query.q) : false;
    if (!inNumber && !inRegion) {
      return false;
    }
  }
  return true;
};

const sortValue = (row: FeedRow, field: MpOrderSortField): number | string | null => {
  switch (field) {
    case "ordered_at": {
      if (!row.ordered_at) return null;
      const at = new Date(row.ordered_at).getTime();
      return Number.isNaN(at) ? null : at;
    }
    case "total":
      return row.total;
    case "number":
      return row.number;
  }
};

const collator = new Intl.Collator("ru", { numeric: true });

/**
 * The comparator of the list.
 *
 * A row WITHOUT a value goes LAST in both directions: an undated order is not
 * «the oldest» and not «the newest», it is an order the marketplace did not
 * date, and putting it on top of «сначала новые» would push the first real
 * order off the first page. Ties are broken by id, so a page boundary never
 * shows one row twice or skips one.
 */
export const compareMpOrders =
  (sort: MpOrderSort) =>
  (left: FeedRow, right: FeedRow): number => {
    const a = sortValue(left, sort.field);
    const b = sortValue(right, sort.field);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    if (a !== null && b !== null && a !== b) {
      const order =
        typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
      if (order !== 0) {
        return sort.desc ? -order : order;
      }
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  };

/** What the screen offers in each filter, with how many orders each option holds. */
export type MpOrderFacets = {
  statuses: { value: string; label: string; count: number }[];
  schemes: { value: string; label: string; count: number }[];
};

/**
 * The facets are counted over ALL the orders of the marketplace, before any
 * filter, so picking «Отменён» does not make every other status disappear
 * from its own filter. Statuses go in the order of the common keys, schemes
 * alphabetically, «Без схемы» last.
 */
export const mpOrderFacets = (rows: FeedRow[]): MpOrderFacets => {
  const statuses = new Map<OrderStatusKey, number>();
  const schemes = new Map<string, number>();
  for (const row of rows) {
    statuses.set(row.status_key, (statuses.get(row.status_key) ?? 0) + 1);
    const scheme = row.scheme ?? NO_SCHEME;
    schemes.set(scheme, (schemes.get(scheme) ?? 0) + 1);
  }

  return {
    statuses: ORDER_STATUS_KEYS.filter((one) => statuses.has(one)).map((one) => ({
      value: one,
      label: ORDER_STATUS_LABELS[one],
      count: statuses.get(one) ?? 0,
    })),
    schemes: [...schemes.entries()]
      .sort(([a], [b]) => (a === NO_SCHEME ? 1 : b === NO_SCHEME ? -1 : a.localeCompare(b)))
      .map(([value, count]) => ({
        value,
        label: value === NO_SCHEME ? NO_SCHEME_LABEL : value,
        count,
      })),
  };
};

export type MpOrdersSelection = {
  /** The rows the query asks for, sorted, before paging. */
  rows: FeedRow[];
  /** Over every order of the marketplace, before the filters. */
  facets: MpOrderFacets;
  /** How many orders of the marketplace carry no date at all. */
  undated: number;
  /** How many orders of the marketplace there are at all. */
  total: number;
};

/** The one function the list and the CSV both call, so the file IS the table. */
export const selectMpOrders = (all: FeedRow[], query: MpOrdersQuery): MpOrdersSelection => ({
  rows: all.filter((row) => matchesMpOrdersQuery(row, query)).sort(compareMpOrders(query.sort)),
  facets: mpOrderFacets(all),
  undated: all.filter((row) => !row.ordered_at).length,
  total: all.length,
});

/* ----------------------------------------------------------------------------
 * One `mp_order` row in the shape of the list
 * ------------------------------------------------------------------------- */

export type MpOrderRow = {
  id: string;
  marketplace: string;
  external_id: string;
  scheme: string | null;
  status: string | null;
  status_detail: string | null;
  ordered_at: Date | string | null;
  buyer_region: string | null;
  warehouse_name: string | null;
  total: unknown;
  currency: string | null;
  is_cancelled: boolean;
};

/**
 * Medusa stores money in a `bigNumber` column, which comes back as a string,
 * as a number, or as `{ value }` depending on which loader read it. A value
 * that cannot be read as a number stays `null` instead of becoming a zero the
 * list would sort and sum as a free order (rule 20a).
 */
export const toAmount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const raw =
    typeof value === "object" && value !== null && "value" in (value as Record<string, unknown>)
      ? (value as { value: unknown }).value
      : value;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const iso = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

export const mpOrderToRow = (row: MpOrderRow, linesCount: number): FeedRow => {
  const source = row.marketplace as FeedSource;
  const statusKey = statusKeyOf(source, row.status, row.status_detail);

  return {
    id: row.id,
    source,
    source_label: SOURCE_LABELS[source] ?? row.marketplace,
    number: row.external_id,
    scheme: row.scheme,
    status_raw: row.status,
    status_detail: row.status_detail,
    status_key: statusKey,
    status_label: ORDER_STATUS_LABELS[statusKey],
    ordered_at: iso(row.ordered_at),
    buyer_region: row.buyer_region,
    warehouse_name: row.warehouse_name,
    total: toAmount(row.total),
    currency: row.currency,
    is_cancelled: Boolean(row.is_cancelled),
    lines_count: linesCount,
  };
};

/* ----------------------------------------------------------------------------
 * The CSV
 * ------------------------------------------------------------------------- */

/** The most rows one file carries; a larger set is cut and the screen says so. */
export const MP_ORDERS_EXPORT_LIMIT = 10_000;

/** The columns of the export, in the order the owner reads them, named as on the screen. */
export const MP_ORDERS_CSV_COLUMNS = [
  "Номер",
  "Дата заказа",
  "Статус",
  "Статус площадки",
  "Второй статус площадки",
  "Схема",
  "Регион",
  "Склад",
  "Итого по заказу",
  "Валюта",
  "Строк в заказе",
] as const;

const SEPARATOR = ";";

/**
 * RFC 4180 quoting over `;`, with one addition this file is explicit about: a
 * field whose first character is `=`, `+`, `-` or `@` is prefixed with a
 * single quote, because Excel and LibreOffice treat such a cell as a FORMULA.
 * WB's own identifiers do not start that way today, but a CSV built from data
 * a marketplace supplies is exactly where that stops being true.
 */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  /** The separator is `;`, so a comma inside a value (`1290,5`) needs no quotes. */
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/**
 * A sum as a Russian-locale spreadsheet reads it. `;` between the columns is
 * the list separator of the Russian Excel, and the same Excel reads `1290.5`
 * as text; with the comma it is a number the owner can add up.
 */
const csvAmount = (value: number | null): string | null =>
  value === null ? null : String(value).replace(".", ",");

/**
 * The export of EXACTLY the rows handed in, header first.
 *
 * `;`, `\r\n` and a UTF-8 BOM, because the owner opens this in Excel on
 * Windows: without the BOM every Cyrillic column heading arrives as mojibake,
 * and that is the whole difference between an export that works and one that
 * gets reported as broken.
 */
export const toMpOrdersCsv = (rows: FeedRow[]): string => {
  const lines = [MP_ORDERS_CSV_COLUMNS.map(csvCell).join(SEPARATOR)];

  for (const row of rows) {
    lines.push(
      [
        row.number,
        row.ordered_at,
        row.status_label,
        row.status_raw,
        row.status_detail,
        row.scheme,
        row.buyer_region,
        row.warehouse_name,
        csvAmount(row.total),
        row.currency,
        row.lines_count,
      ]
        .map(csvCell)
        .join(SEPARATOR),
    );
  }

  return `﻿${lines.join("\r\n")}\r\n`;
};

/* ----------------------------------------------------------------------------
 * What the owner must be told about the marketplace
 * ------------------------------------------------------------------------- */

/**
 * What the owner has to be TOLD about the marketplace before they read the
 * table (w15-mp-orders-desk).
 *
 * THE RULE THIS EXISTS FOR: «a failed run is a red row, not an empty table»
 * (rule 20a). An empty list has five different causes and the owner cannot
 * tell them apart by looking, so the screen names the cause. It is a pure
 * function, and its outcomes are covered by `__tests__/order-feed.unit.spec.ts`,
 * because a rule about what must never be silent has to be provable and not
 * promised.
 *
 *   missing       no key at all — nothing was ever imported.
 *   never_run     a key, but the order import has not run.
 *   failed        the last import broke. Red, with the marketplace's own text.
 *   rate_limited  the marketplace refused to answer right now. Neither our
 *                 defect nor an absence of orders — WB's own third outcome,
 *                 which the core models on purpose and which this screen must
 *                 not flatten into «failed» or into silence.
 *   fixture       the rows came from recorded answers, not from the
 *                 marketplace. Silence here would let a demo read as live data.
 *   null          connected, imported, nothing to say. A banner that is always
 *                 there stops being read.
 */
export type ConnectionNotice = "missing" | "never_run" | "failed" | "rate_limited" | "fixture";

export const connectionNotice = (connection: {
  connected: boolean;
  last_run: { status: string; is_fixture: boolean } | null;
}): ConnectionNotice | null => {
  if (!connection.connected) {
    return "missing";
  }
  if (!connection.last_run) {
    return "never_run";
  }
  if (connection.last_run.status === "failed") {
    return "failed";
  }
  if (connection.last_run.status === "rate_limited") {
    return "rate_limited";
  }
  if (connection.last_run.is_fixture) {
    return "fixture";
  }
  return null;
};
