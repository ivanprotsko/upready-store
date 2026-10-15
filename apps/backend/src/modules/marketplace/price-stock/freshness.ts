import { MP_KIND_FAMILY, MP_SYNC_INTERVAL_MS } from "../schedule";

/**
 * The age of a number, and the one place a card's numbers are decided.
 *
 * `../price-stock.ts` holds the screen's rules and re-exports what callers use
 * from here (t-2026-10-14-55). `round2` and `earlier` are exported for the
 * sibling files only.
 */

/** The two families this screen is about. The intervals are `schedule.ts`'s. */
export type PriceStockFamily = "prices" | "stocks";

/**
 * How many intervals a number may age before the screen calls it stale.
 *
 * THREE, from the task: «older than the kind's interval times three». One
 * interval would paint every row orange the minute before the next run — the
 * scheduler wakes every five minutes and a stocks import is due every fifteen,
 * so a normal Tuesday would look like an outage.
 */
export const STALE_FACTOR = 3;

export const staleAfterMs = (family: PriceStockFamily): number =>
  MP_SYNC_INTERVAL_MS[family] * STALE_FACTOR;

/**
 * One line of `mp_offer` — one price and one stock of one listing, per
 * warehouse and per size.
 *
 * `stock = null` means the marketplace said nothing about this line, and is
 * NOT `0` (rule 20a, and the model's own head comment).
 */
export type PriceStockLine = {
  marketplace: string;
  external_id: string;
  offer_key: string;
  vendor_code: string | null;
  size_external: string | null;
  sku_external: string | null;
  storage_type: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  price: number | null;
  discount_price: number | null;
  currency: string | null;
  stock: number | null;
  reserved: number | null;
  measured_at: string | null;
};

/** One row of `mp_sync_run`, as much of it as freshness needs. */
export type PriceStockImport = {
  marketplace: string;
  kind: string;
  status: string;
  finished_at: string | null;
};

/**
 * What counts as a difference worth highlighting. The owner picks it in the
 * screen's filters and the screen prints it in its subtitle: a threshold
 * nobody can see is a highlight nobody can explain.
 */
export type PriceStockThresholds = {
  /** Price gap, percent of the SHOP's price. */
  price_pct: number;
  /** Stock gap, whole units. */
  stock_abs: number;
};

export const DEFAULT_PRICE_STOCK_THRESHOLDS: PriceStockThresholds = {
  price_pct: 10,
  stock_abs: 1,
};

/** The age of one number, and whether it has aged out. */
export type Freshness = {
  family: PriceStockFamily;
  /** The oldest line measurement behind this number (`mp_offer.measured_at`). */
  measured_at: string | null;
  /** The last succeeded import of this family for this marketplace. */
  imported_at: string | null;
  /** The older of the two — the moment the age is counted from. */
  as_of: string | null;
  age_ms: number | null;
  interval_ms: number;
  stale_after_ms: number;
  /**
   * `true` when there IS a number and its age is past the window, or unknown.
   * A card with no number at all is not stale, it is empty, and the screen
   * says «-» rather than painting an absence orange.
   */
  stale: boolean;
  /** One line naming both sources and the window (rule 18e). */
  note: string;
};

export const round2 = (value: number): number => Math.round(value * 100) / 100;

const known = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null && Number.isFinite(value));

const lowest = (values: readonly (number | null)[]): number | null => {
  const numbers = known(values);
  return numbers.length ? Math.min(...numbers) : null;
};

const total = (values: readonly (number | null)[]): number | null => {
  const numbers = known(values);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
};

const asTime = (iso: string | null): number | null => {
  if (!iso) {
    return null;
  }
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
};

/** The earlier of two moments, ignoring what nobody reported. */
export const earlier = (left: string | null, right: string | null): string | null => {
  const leftTime = asTime(left);
  const rightTime = asTime(right);
  if (leftTime === null) {
    return rightTime === null ? null : right;
  }
  if (rightTime === null) {
    return left;
  }
  return leftTime <= rightTime ? left : right;
};

const oldest = (values: readonly (string | null)[]): string | null =>
  values.reduce<string | null>((carry, value) => earlier(carry, value), null);

const newest = (values: readonly (string | null)[]): string | null =>
  values.reduce<string | null>((carry, value) => {
    const carryTime = asTime(carry);
    const valueTime = asTime(value);
    if (valueTime === null) {
      return carry;
    }
    return carryTime === null || valueTime > carryTime ? value : carry;
  }, null);

/**
 * When this marketplace last IMPORTED this family successfully.
 *
 * The kinds are taken from `MP_KIND_FAMILY`, so «prices» on WB and «prices» on
 * Ozon are found by the family they belong to rather than by a list of kind
 * names copied into this file. A third adapter is covered by being registered
 * (rule 20).
 */
export const lastImportOf = (
  imports: readonly PriceStockImport[],
  marketplace: string,
  family: PriceStockFamily,
): string | null =>
  newest(
    imports
      .filter(
        (entry) =>
          entry.marketplace === marketplace &&
          entry.status === "succeeded" &&
          MP_KIND_FAMILY[entry.kind] === family,
      )
      .map((entry) => entry.finished_at),
  );

const FAMILY_LABEL: Record<PriceStockFamily, string> = {
  prices: "цены",
  stocks: "остатки",
};

const humanWindow = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60 ? `${round2(minutes / 60)} ч` : `${minutes} мин`;
};

/**
 * The age of one number of one card.
 *
 * `hasValue` decides whether staleness is even a question: an empty number is
 * empty, not stale, and painting «нет данных» orange would send the owner
 * looking for an import that has nothing to bring.
 */
export const freshnessOf = (input: {
  family: PriceStockFamily;
  hasValue: boolean;
  measuredAt: string | null;
  importedAt: string | null;
  now: Date;
  marketplace: string;
  lines: number;
}): Freshness => {
  const interval = MP_SYNC_INTERVAL_MS[input.family];
  const window = staleAfterMs(input.family);
  const asOf = earlier(input.measuredAt, input.importedAt);
  const asOfTime = asTime(asOf);
  const age = asOfTime === null ? null : input.now.getTime() - asOfTime;

  const stale = input.hasValue && (age === null || age > window);

  const source =
    `${FAMILY_LABEL[input.family]} ${input.marketplace}: ` +
    `${input.lines} ${input.lines === 1 ? "строка" : "строк"} mp_offer` +
    (input.measuredAt ? `, замер площадки ${input.measuredAt}` : ", замера площадки нет") +
    (input.importedAt ? `, импорт ${input.importedAt}` : ", успешного импорта нет");

  const verdict = !input.hasValue
    ? "числа нет"
    : age === null
      ? "возраст неизвестен — считаем протухшим"
      : `возраст ${humanWindow(age)} при пороге ${humanWindow(window)}`;

  return {
    family: input.family,
    measured_at: input.measuredAt,
    imported_at: input.importedAt,
    as_of: asOf,
    age_ms: age,
    interval_ms: interval,
    stale_after_ms: window,
    stale,
    note: `${source}; ${verdict}`,
  };
};

/**
 * THE ONE PLACE A CARD'S NUMBERS ARE DECIDED.
 *
 * The row and the drawer's lines both come from here, which is what makes
 * «остаток в строке = сумма строк по складам» true by construction rather than
 * by two functions agreeing today.
 *
 * The price is the LOWEST across the lines, not the first and not an average.
 * A card with sizes has one line per size and they do not share a price, so a
 * single number is a choice; this is the choice made, and «Товары» makes the
 * same one (`aggregateOfferLines`).
 */
export const aggregateLines = (lines: readonly PriceStockLine[]) => {
  const stocked = lines.filter((line) => line.stock !== null);
  const priced = lines.filter((line) => line.discount_price !== null || line.price !== null);

  const price = lowest(lines.map((line) => line.price));
  const discount = lowest(lines.map((line) => line.discount_price));
  const effective = discount ?? price;

  return {
    price,
    discount_price: discount,
    /** The number the comparison uses: what a buyer pays, `discount_price ?? price`. */
    effective_price: effective,
    effective_basis: (effective === null ? null : discount !== null ? "discount_price" : "price") as
      | "discount_price"
      | "price"
      | null,
    currency: lines.find((line) => line.currency)?.currency ?? null,
    stock: total(stocked.map((line) => line.stock)),
    reserved: total(lines.map((line) => line.reserved)),
    lines: lines.length,
    stock_lines: stocked.length,
    priced_lines: priced.length,
    warehouses: new Set(lines.map((line) => line.warehouse_id).filter(Boolean)).size,
    sizes: new Set(lines.map((line) => line.size_external).filter(Boolean)).size,
    /** The OLDEST measurement behind each number: a card is as fresh as its stalest line. */
    stock_measured_at: oldest(stocked.map((line) => line.measured_at)),
    price_measured_at: oldest(priced.map((line) => line.measured_at)),
    /** The NEWEST measurement, for the screen's «цены на …, остатки на …». */
    stock_newest_at: newest(stocked.map((line) => line.measured_at)),
    price_newest_at: newest(priced.map((line) => line.measured_at)),
  };
};
