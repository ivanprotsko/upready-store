import type { OrderStatusKey } from "./order-status";
import { ORDER_STATUS_KEYS, ORDER_STATUS_LABELS, statusKeyOf } from "./order-status";

/**
 * One order feed over the shop and every marketplace (w15-mp-orders-desk).
 *
 * Rows 2, 6, 7 and 21 of the parity matrix, and the thing Oksana asked for in
 * her own words: «единая панель заказов WB + Ozon + магазин»
 * (`research/gap-matrix.md`, message #468851).
 *
 * READ-ONLY, BY CONSTRUCTION. Nothing in this file, and nothing in the three
 * routes that use it, can reach a marketplace: the rows come from `mp_order` /
 * `mp_order_line`, which the projector fills from mirrors that were imported
 * by a script. There is no adapter here, no `read`, no endpoint id, and the
 * suite `__tests__/order-feed-read-only.unit.spec.ts` fails the moment one
 * appears. Ivan's order of 2026-09-16 02:46 WITA: the screen SHOWS marketplace
 * orders and never changes them.
 *
 * THE PURE HALF IS HERE ON PURPOSE. Period resolution, filtering, the common
 * status key and the CSV are functions of their arguments, so they are tested
 * without a stand and the routes stay thin.
 */

/** The period the screen opens on, and the number it must SAY on the screen. */
export const DEFAULT_PERIOD_DAYS = 30;

/** Where one row of the feed came from. `shop` is this platform's own order. */
export type FeedSource = "shop" | "wb" | "ozon";

export type FeedRow = {
  /**
   * The id the order card is opened by. Prefixed with its table's own prefix
   * (`mporder_…`, `order_…`), so one route serves both halves and no separate
   * `source` parameter can go missing from a link.
   */
  id: string;
  source: FeedSource;
  /** «Магазин», «Wildberries», «Ozon» — what the column shows. */
  source_label: string;
  /** The number the owner knows the order by: WB/Ozon's own id, or `#12`. */
  number: string;
  /** `FBS | FBO | DBS | rFBS | …`, `null` for a shop order, which has no scheme. */
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

export type FeedFilters = {
  sources: FeedSource[];
  schemes: string[];
  statuses: OrderStatusKey[];
  from: Date;
  to: Date;
};

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  days: number;
  /** True when the caller named no period and got the default 30 days. */
  is_default: boolean;
};

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
 * The period the query asks for, or the last 30 days.
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

  return { from, to, days, is_default: !askedFrom && !askedTo };
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

export const FEED_SOURCES: FeedSource[] = ["shop", "wb", "ozon"];

export const SOURCE_LABELS: Record<FeedSource, string> = {
  shop: "Магазин",
  wb: "Wildberries",
  ozon: "Ozon",
};

/**
 * The filters, read from the query string.
 *
 * An unknown value is DROPPED rather than made to match nothing: a link with a
 * stale marketplace in it shows the other marketplaces instead of an empty
 * table the owner cannot explain. An empty list means "no filter on this
 * dimension", which is what the screen opens with.
 */
export const resolveFilters = (
  query: Record<string, unknown>,
  now: Date = new Date(),
): FeedFilters & { period: ResolvedPeriod } => {
  const period = resolvePeriod(query, now);

  const sources = asList(query.source).filter((one): one is FeedSource =>
    FEED_SOURCES.includes(one as FeedSource),
  );
  const statuses = asList(query.status).filter((one): one is OrderStatusKey =>
    ORDER_STATUS_KEYS.includes(one as OrderStatusKey),
  );
  /** Schemes are the marketplaces' own words, so they are matched case-insensitively. */
  const schemes = asList(query.scheme).map((one) => one.toUpperCase());

  return { sources, statuses, schemes, from: period.from, to: period.to, period };
};

/**
 * A row is in the period when its own date is, and a row WITHOUT a date is
 * out of every period.
 *
 * That is a decision, not an oversight: an order the marketplace never dated
 * cannot be claimed to fall inside «последние 30 дней», and dropping it into
 * the range anyway would make the count on the screen a number nobody can
 * reproduce. The list route reports how many such rows it set aside, so they
 * are visible rather than lost (rule 20a).
 */
export const inPeriod = (orderedAt: Date | string | null, from: Date, to: Date): boolean => {
  if (!orderedAt) {
    return false;
  }
  const at = orderedAt instanceof Date ? orderedAt : new Date(orderedAt);
  if (Number.isNaN(at.getTime())) {
    return false;
  }
  return at >= from && at <= to;
};

/** Everything but the period, which the loaders apply while reading. */
export const matchesFilters = (row: FeedRow, filters: FeedFilters): boolean => {
  if (filters.sources.length && !filters.sources.includes(row.source)) {
    return false;
  }
  if (filters.statuses.length && !filters.statuses.includes(row.status_key)) {
    return false;
  }
  if (filters.schemes.length) {
    const scheme = row.scheme ? row.scheme.toUpperCase() : null;
    if (!scheme || !filters.schemes.includes(scheme)) {
      return false;
    }
  }
  return true;
};

/** Newest first, and a row with no date last rather than first. */
export const byDateDesc = (left: FeedRow, right: FeedRow): number => {
  const a = left.ordered_at ? new Date(left.ordered_at).getTime() : Number.NEGATIVE_INFINITY;
  const b = right.ordered_at ? new Date(right.ordered_at).getTime() : Number.NEGATIVE_INFINITY;
  return b - a;
};

type MpOrderRow = {
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
 * feed would sort and sum as a free order (rule 20a).
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

type ShopOrderRow = {
  id: string;
  display_id?: number | null;
  status?: string | null;
  fulfillment_status?: string | null;
  created_at?: Date | string | null;
  currency_code?: string | null;
  total?: unknown;
  items?: unknown[] | null;
  shipping_address?: { province?: string | null; city?: string | null } | null;
};

/**
 * A shop order in the same shape as a marketplace one.
 *
 * `scheme` is `null` and stays `null`: a shop order is not fulfilled under a
 * marketplace scheme, and inventing a label «магазин» for that column would
 * put a value where the answer is «неприменимо» (rule 20a). The screen shows
 * an em dash there.
 */
export const shopOrderToRow = (row: ShopOrderRow): FeedRow => {
  const statusKey = statusKeyOf("shop", row.status ?? null, row.fulfillment_status ?? null);
  const address = row.shipping_address ?? null;

  return {
    id: row.id,
    source: "shop",
    source_label: SOURCE_LABELS.shop,
    number: row.display_id ? `#${row.display_id}` : row.id,
    scheme: null,
    status_raw: row.status ?? null,
    status_detail: row.fulfillment_status ?? null,
    status_key: statusKey,
    status_label: ORDER_STATUS_LABELS[statusKey],
    ordered_at: iso(row.created_at ?? null),
    buyer_region: address?.province || address?.city || null,
    warehouse_name: null,
    total: toAmount(row.total),
    currency: row.currency_code ? row.currency_code.toUpperCase() : null,
    is_cancelled: statusKey === "cancelled",
    lines_count: Array.isArray(row.items) ? row.items.length : 0,
  };
};

/** The columns of the export, in the order the owner reads them. */
export const CSV_COLUMNS = [
  "source",
  "number",
  "scheme",
  "status",
  "status_marketplace",
  "status_marketplace_detail",
  "ordered_at",
  "region",
  "warehouse",
  "total",
  "currency",
  "lines",
] as const;

/**
 * RFC 4180 quoting, with one addition this file is explicit about: a field
 * whose first character is `=`, `+`, `-` or `@` is prefixed with a single
 * quote, because Excel and LibreOffice treat such a cell as a FORMULA. WB's
 * own identifiers do not start that way today, but a CSV built from data a
 * marketplace supplies is exactly where that stops being true.
 */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/**
 * The export of EXACTLY the rows handed in, header first.
 *
 * `\r\n` and a UTF-8 BOM, because the owner opens this in Excel on Windows:
 * without the BOM every Cyrillic column heading arrives as mojibake, and that
 * is the whole difference between an export that works and one that gets
 * reported as broken.
 */
export const toCsv = (rows: FeedRow[]): string => {
  const lines = [CSV_COLUMNS.join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvCell(row.source_label),
        csvCell(row.number),
        csvCell(row.scheme),
        csvCell(row.status_label),
        csvCell(row.status_raw),
        csvCell(row.status_detail),
        csvCell(row.ordered_at),
        csvCell(row.buyer_region),
        csvCell(row.warehouse_name),
        csvCell(row.total),
        csvCell(row.currency),
        csvCell(row.lines_count),
      ].join(","),
    );
  }

  return `﻿${lines.join("\r\n")}\r\n`;
};

/** What the screen offers in each filter, counted over the rows of the period. */
export type FeedFacets = {
  sources: { value: string; label: string; count: number }[];
  schemes: { value: string; label: string; count: number }[];
  statuses: { value: string; label: string; count: number }[];
};

/**
 * The facets are counted over the rows of the PERIOD, before the other
 * filters are applied, so picking «Wildberries» does not make every other
 * marketplace disappear from its own filter.
 */
export const facetsOf = (rows: FeedRow[]): FeedFacets => {
  const count = <T extends string>(values: (T | null)[]) => {
    const tally = new Map<T, number>();
    for (const value of values) {
      if (value === null) {
        continue;
      }
      tally.set(value, (tally.get(value) ?? 0) + 1);
    }
    return tally;
  };

  const sources = count(rows.map((row) => row.source));
  const schemes = count(rows.map((row) => row.scheme));
  const statuses = count(rows.map((row) => row.status_key));

  return {
    sources: FEED_SOURCES.filter((one) => sources.has(one)).map((one) => ({
      value: one,
      label: SOURCE_LABELS[one],
      count: sources.get(one) ?? 0,
    })),
    schemes: [...schemes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, total]) => ({ value, label: value, count: total })),
    statuses: ORDER_STATUS_KEYS.filter((one) => statuses.has(one)).map((one) => ({
      value: one,
      label: ORDER_STATUS_LABELS[one],
      count: statuses.get(one) ?? 0,
    })),
  };
};
