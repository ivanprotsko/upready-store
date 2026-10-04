/**
 * PRICES AND STOCKS OF ONE MARKETPLACE NEXT TO THE SHOP'S
 * («Wildberries → Цены и остатки», mp-section-design task-03; the freshness
 * and aggregation rules below are w17-mp-price-stock-table's).
 *
 * READ-ONLY. The shop's numbers stand next to the marketplace's, the gaps are
 * pointed at, and NOTHING here writes anywhere. Ivan's standing invariant of
 * 2026-09-16 02:46 WITA — no inline edit, no bulk action, no «отправить на
 * площадку» — is proved by `__tests__/price-stock-read-only.unit.spec.ts` and
 * not by this sentence.
 *
 * THE ROW IS THE CARD. One row per `mp_product` of the marketplace, and one
 * row per shop variant that no card of this marketplace is linked to. The tie
 * between the two is `mp_link`, the same table «Товары» reads and writes
 * (w14): the projector writes it by the article after every import and the
 * owner writes it by hand, so a card linked on «Товары» is «Есть везде» here
 * on the next request, and the two screens cannot disagree about it. The w17
 * screen matched by the article on its own instead, and a hand-made link never
 * reached it.
 *
 * THE NUMBER ON THE ROW IS THE SUM OF THE LINES IN ITS DRAWER, by
 * construction: `aggregateLines` is the only place a card's price and stock
 * are decided, and both the row and the drawer's lines come from the same
 * `mp_offer` rows. `__tests__/price-stock.unit.spec.ts` asserts the identity.
 *
 * FRESHNESS IS PART OF THE NUMBER. A number whose age is hidden is a number
 * that lies, so every card carries the age of what it shows and is called
 * «Устарело» past the kind's interval times three. The age is taken from the
 * OLDER of two facts, never the newer one:
 *
 *   - `mp_offer.measured_at` — when the marketplace measured the line. It is
 *     honest for the stock, and OPTIMISTIC for the price of the same line: the
 *     WB and Ozon normalisers write the STOCK fetch time onto a row that
 *     carries both numbers (`modules/wb/normalize.ts`, `modules/ozon/normalize.ts`),
 *     because the price came from a different request whose own time the row
 *     does not keep;
 *   - the last SUCCEEDED `mp_sync_run` of that family for that marketplace —
 *     when we last imported prices, or stocks, at all.
 *
 * A number cannot be fresher than the import that brought it, so the age is
 * measured from the older of the two and the screen never claims a price is
 * current because a stock was fetched an hour later.
 *
 * PURE. The rows come from the caller, the decisions come from here, `now` is
 * an argument and not a `Date.now()` inside (a staleness that reads the clock
 * where it is used cannot be tested).
 */

import { MedusaError } from "@medusajs/framework/utils";
import { MP_KIND_FAMILY, MP_SYNC_INTERVAL_MS } from "./schedule";

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

const round2 = (value: number): number => Math.round(value * 100) / 100;

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
const earlier = (left: string | null, right: string | null): string | null => {
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

/* ----------------------------------------------------------------------------
 * The rows of «Цены и остатки» (task-03): one per card, plus the shop's own
 * ------------------------------------------------------------------------- */

/**
 * Where an item is. The three partition the rows: every card is `both` or
 * `marketplace_only`, every row of the shop is `shop_only`, so the three counts
 * sum to the table. «Выше порога» is NOT a fourth state: a difference needs
 * both sides, so every such row is already `both`.
 */
export const PRICE_STOCK_STATES = ["both", "shop_only", "marketplace_only"] as const;
export type PriceStockState = (typeof PRICE_STOCK_STATES)[number];

/** One card of the marketplace (`mp_product`), as much of it as the row needs. */
export type PriceStockCard = {
  id: string;
  external_id: string;
  vendor_code: string | null;
  title: string | null;
  thumbnail: string | null;
};

/** One live `mp_link` of this marketplace. */
export type PriceStockLink = {
  external_id: string;
  product_id: string;
  variant_id: string | null;
};

/**
 * One variant of the shop's catalog with its numbers.
 *
 * `prices` is keyed by lower-case currency, like `catalog.ts`: this catalog is
 * seeded with 241 regions, so «the» price of a variant does not exist and the
 * comparison happens inside the currency the marketplace named.
 */
export type PriceStockVariant = {
  id: string;
  product_id: string;
  product_title: string | null;
  thumbnail: string | null;
  sku: string | null;
  prices: Record<string, number>;
  /** Sum of `inventory_level.stocked_quantity`; `null` where no inventory item. */
  stock: number | null;
};

/** The contract of the panel's `MpPriceStockRow` (`hooks/api/marketplace-section.tsx`). */
export type PriceStockRow = {
  /** `mp_product.id` for a card, `variant_id` for a row of the shop only. */
  id: string;
  /** `mp_product.id`; `null` on a row of the shop only. */
  card_id: string | null;
  external_id: string | null;
  vendor_code: string | null;
  title: string | null;
  thumbnail: string | null;
  state: PriceStockState;
  shop: {
    product_id: string;
    variant_id: string;
    title: string | null;
    price: number | null;
    stock: number | null;
  } | null;
  mp: {
    price: number | null;
    discount_price: number | null;
    stock: number | null;
    reserved: number | null;
    lines: number;
    warehouses: number;
    sizes: number;
    /** The moment each age is counted from: the older of the oldest line and the last import; `null` with no number. */
    price_measured_at: string | null;
    stock_measured_at: string | null;
    price_stale: boolean;
    stock_stale: boolean;
  } | null;
  diff: {
    /** Marketplace minus shop, in the row's currency: «+96 ₽» means the marketplace is dearer. */
    price_abs: number | null;
    /** The same gap in percent of the SHOP's price. */
    price_pct: number | null;
    /** Marketplace minus shop, in units. */
    stock_abs: number | null;
    /** Over the thresholds the query carried. */
    highlighted: boolean;
  };
  currency: string | null;
};

export type BuildPriceStockInput = {
  marketplace: string;
  cards: readonly PriceStockCard[];
  /** The lines of THIS marketplace. A line whose card is not stored makes no row (see `offersWithoutCard`). */
  lines: readonly PriceStockLine[];
  links: readonly PriceStockLink[];
  variants: readonly PriceStockVariant[];
  imports: readonly PriceStockImport[];
  thresholds?: PriceStockThresholds;
  /**
   * The currency of the marketplace's price list, for a row with no line of its
   * own to name one (a card without lines, a row of the shop only). `null`
   * leaves the shop's price out rather than guessing a currency for it.
   */
  currency: string | null;
  /** Injected, never read from the clock in here (rule 17a). */
  now: Date;
};

/**
 * Whether a gap is past its threshold. A zero gap is never highlighted, so a
 * threshold of 0 means «any difference», not «every row».
 */
const over = (gap: number | null, threshold: number): boolean =>
  gap !== null && gap !== 0 && Math.abs(gap) >= threshold;

export const highlightOf = (
  diff: Pick<PriceStockRow["diff"], "price_pct" | "stock_abs">,
  thresholds: PriceStockThresholds,
): boolean => over(diff.price_pct, thresholds.price_pct) || over(diff.stock_abs, thresholds.stock_abs);

/**
 * The shop's half of a card's row, through its live link.
 *
 * A link names a variant, or (an older manual link) a product only; then the
 * product's one variant stands in, and a product of several variants gives no
 * number rather than the first variant's (rule 20a). A link whose product or
 * variant has left the shop is not a link any more: the card is
 * `marketplace_only`, which is what the shop now is.
 */
const linkedVariant = (
  link: PriceStockLink | undefined,
  variantsById: ReadonlyMap<string, PriceStockVariant>,
  variantsByProduct: ReadonlyMap<string, PriceStockVariant[]>,
): PriceStockVariant | null => {
  if (!link) {
    return null;
  }
  if (link.variant_id) {
    const variant = variantsById.get(link.variant_id);
    return variant && variant.product_id === link.product_id ? variant : null;
  }
  const ofProduct = variantsByProduct.get(link.product_id) ?? [];
  return ofProduct.length === 1 ? ofProduct[0] : null;
};

const shopPrice = (variant: PriceStockVariant, currency: string | null): number | null =>
  currency ? (variant.prices[currency.toLowerCase()] ?? null) : null;

/** The whole table of one marketplace in one pass, in the default order. */
export const buildPriceStockRows = (input: BuildPriceStockInput): PriceStockRow[] => {
  const thresholds = input.thresholds ?? DEFAULT_PRICE_STOCK_THRESHOLDS;

  const linesByCard = new Map<string, PriceStockLine[]>();
  for (const line of input.lines) {
    const bucket = linesByCard.get(line.external_id);
    if (bucket) {
      bucket.push(line);
    } else {
      linesByCard.set(line.external_id, [line]);
    }
  }

  const linkByCard = new Map(input.links.map((link) => [link.external_id, link]));
  const variantsById = new Map(input.variants.map((variant) => [variant.id, variant]));
  const variantsByProduct = new Map<string, PriceStockVariant[]>();
  for (const variant of input.variants) {
    const bucket = variantsByProduct.get(variant.product_id);
    if (bucket) {
      bucket.push(variant);
    } else {
      variantsByProduct.set(variant.product_id, [variant]);
    }
  }

  const pricesImportedAt = lastImportOf(input.imports, input.marketplace, "prices");
  const stocksImportedAt = lastImportOf(input.imports, input.marketplace, "stocks");

  const linkedVariants = new Set<string>();
  const rows: PriceStockRow[] = [];

  for (const card of input.cards) {
    const lines = linesByCard.get(card.external_id) ?? [];
    const aggregate = aggregateLines(lines);
    const variant = linkedVariant(linkByCard.get(card.external_id), variantsById, variantsByProduct);
    if (variant) {
      linkedVariants.add(variant.id);
    }

    const currency = aggregate.currency ?? input.currency;
    const priceFreshness = freshnessOf({
      family: "prices",
      hasValue: aggregate.effective_price !== null,
      measuredAt: aggregate.price_measured_at,
      importedAt: pricesImportedAt,
      now: input.now,
      marketplace: input.marketplace,
      lines: aggregate.priced_lines,
    });
    const stockFreshness = freshnessOf({
      family: "stocks",
      hasValue: aggregate.stock !== null,
      measuredAt: aggregate.stock_measured_at,
      importedAt: stocksImportedAt,
      now: input.now,
      marketplace: input.marketplace,
      lines: aggregate.stock_lines,
    });

    const shop = variant
      ? {
          product_id: variant.product_id,
          variant_id: variant.id,
          title: variant.product_title,
          price: shopPrice(variant, currency),
          stock: variant.stock,
        }
      : null;

    const ourPrice = shop?.price ?? null;
    const ourStock = shop?.stock ?? null;
    const priceAbs =
      ourPrice !== null && aggregate.effective_price !== null ? round2(aggregate.effective_price - ourPrice) : null;
    /** A shop price of 0 has no percent: «+∞ %» would highlight a data entry slip as a pricing problem. */
    const pricePct = priceAbs !== null && ourPrice ? round2((priceAbs / ourPrice) * 100) : null;
    const stockAbs = ourStock !== null && aggregate.stock !== null ? aggregate.stock - ourStock : null;

    rows.push({
      id: card.id,
      card_id: card.id,
      external_id: card.external_id,
      vendor_code: card.vendor_code,
      title: card.title,
      thumbnail: card.thumbnail,
      state: variant ? "both" : "marketplace_only",
      shop,
      mp: {
        price: aggregate.price,
        discount_price: aggregate.discount_price,
        stock: aggregate.stock,
        reserved: aggregate.reserved,
        lines: aggregate.lines,
        warehouses: aggregate.warehouses,
        sizes: aggregate.sizes,
        /**
         * Only where there IS a number: a card whose lines named no stock has
         * no stock measurement, and showing the stocks import's time as its
         * «Обновлено» would date a number nobody measured.
         */
        price_measured_at: aggregate.effective_price !== null ? priceFreshness.as_of : null,
        stock_measured_at: aggregate.stock !== null ? stockFreshness.as_of : null,
        price_stale: priceFreshness.stale,
        stock_stale: stockFreshness.stale,
      },
      diff: {
        price_abs: priceAbs,
        price_pct: pricePct,
        stock_abs: stockAbs,
        highlighted: highlightOf({ price_pct: pricePct, stock_abs: stockAbs }, thresholds),
      },
      currency,
    });
  }

  /**
   * Every variant of the shop no card of this marketplace is linked to,
   * whether or not it carries an article: a product without a SKU is still a
   * product the shop sells and the marketplace does not, and «Товары» can link
   * it by hand.
   */
  for (const variant of input.variants) {
    if (linkedVariants.has(variant.id)) {
      continue;
    }
    rows.push({
      id: variant.id,
      card_id: null,
      external_id: null,
      vendor_code: variant.sku,
      title: variant.product_title,
      thumbnail: variant.thumbnail,
      state: "shop_only",
      shop: {
        product_id: variant.product_id,
        variant_id: variant.id,
        title: variant.product_title,
        price: shopPrice(variant, input.currency),
        stock: variant.stock,
      },
      mp: null,
      diff: { price_abs: null, price_pct: null, stock_abs: null, highlighted: false },
      currency: input.currency,
    });
  }

  return sortPriceStockRows(rows, null);
};

/**
 * The `mp_offer` cards no `mp_product` stands for: the marketplace reported a
 * price or a stock for them, and the card import did not bring the card (on WB
 * a card in the bin or the archive). They make no row — the row is the card —
 * and are COUNTED, so the absence is a number in the answer and not a silence.
 */
export const offersWithoutCard = (
  cards: readonly Pick<PriceStockCard, "external_id">[],
  lines: readonly Pick<PriceStockLine, "external_id">[],
): number => {
  const stored = new Set(cards.map((card) => card.external_id));
  return new Set(lines.map((line) => line.external_id).filter((id) => !stored.has(id))).size;
};

/* ----------------------------------------------------------------------------
 * The query string
 * ------------------------------------------------------------------------- */

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

/* ----------------------------------------------------------------------------
 * Filter, order, page
 * ------------------------------------------------------------------------- */

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** `q` looks in the two fields the screen shows on the row: the title and the article. */
export const filterPriceStockRows = (
  rows: readonly PriceStockRow[],
  query: Pick<PriceStockQuery, "q" | "states" | "over_threshold">,
): PriceStockRow[] => {
  const needle = query.q?.toLocaleLowerCase("ru") ?? null;
  return rows.filter(
    (row) =>
      (!query.states || query.states.includes(row.state)) &&
      (!query.over_threshold || row.diff.highlighted) &&
      (!needle ||
        (row.title ?? "").toLocaleLowerCase("ru").includes(needle) ||
        (row.vendor_code ?? "").toLocaleLowerCase("ru").includes(needle)),
  );
};

const STATE_ORDER: Record<PriceStockState, number> = { both: 0, marketplace_only: 1, shop_only: 2 };

const sortValue = (row: PriceStockRow, field: PriceStockOrderField): string | number | null => {
  switch (field) {
    case "title":
      return row.title;
    case "vendor_code":
      return row.vendor_code;
    /** «По расхождению» is by its SIZE: −30 % is as far off as +30 %. */
    case "price_pct":
      return row.diff.price_pct === null ? null : Math.abs(row.diff.price_pct);
    case "stock_abs":
      return row.diff.stock_abs === null ? null : Math.abs(row.diff.stock_abs);
  }
};

/** By title, a row without one LAST: a nameless card on top of the first page reads as a broken table. */
const byTitle = (left: PriceStockRow, right: PriceStockRow): number =>
  Number(!left.title) - Number(!right.title) ||
  collator.compare(left.title ?? "", right.title ?? "") ||
  collator.compare(left.id, right.id);

/**
 * The order of the table. A row with nothing to sort by (no gap, no title) is
 * LAST in both directions: a row without a price gap is not «the smallest
 * gap», and putting it first on ascending would bury the real ones.
 *
 * Without `order`: the highlighted rows first, then «Есть везде», «Только на
 * площадке», «Только в магазине», each by title — the rows that need a look
 * before the rows that cannot have a gap at all.
 */
export const sortPriceStockRows = (
  rows: readonly PriceStockRow[],
  order: PriceStockQuery["order"],
): PriceStockRow[] => {
  if (!order) {
    return [...rows].sort(
      (left, right) =>
        Number(right.diff.highlighted) - Number(left.diff.highlighted) ||
        STATE_ORDER[left.state] - STATE_ORDER[right.state] ||
        byTitle(left, right),
    );
  }
  return [...rows].sort((left, right) => {
    const a = sortValue(left, order.field);
    const b = sortValue(right, order.field);
    if (a === null || a === "" || b === null || b === "") {
      const aEmpty = a === null || a === "";
      const bEmpty = b === null || b === "";
      return aEmpty === bEmpty ? byTitle(left, right) : aEmpty ? 1 : -1;
    }
    const compared = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
    return (order.desc ? -compared : compared) || byTitle(left, right);
  });
};

export type PriceStockCounts = Record<PriceStockState | "over_threshold", number>;

/** Counted over the WHOLE table of the marketplace, before any filter, so a filter does not change its own labels. */
export const priceStockCounts = (rows: readonly PriceStockRow[]): PriceStockCounts => {
  const counts: PriceStockCounts = { both: 0, shop_only: 0, marketplace_only: 0, over_threshold: 0 };
  for (const row of rows) {
    counts[row.state] += 1;
    if (row.diff.highlighted) {
      counts.over_threshold += 1;
    }
  }
  return counts;
};

/**
 * «Цены Wildberries на …, остатки на …» of the subtitle: the NEWEST
 * measurement in the table, never later than the last import of that family
 * that succeeded (a number cannot be fresher than the import that brought it).
 */
export const measuredOf = (
  lines: readonly PriceStockLine[],
  imports: readonly PriceStockImport[],
  marketplace: string,
): { prices_at: string | null; stocks_at: string | null } => {
  const aggregate = aggregateLines(lines);
  const cap = (measured: string | null, imported: string | null) => (measured && imported ? earlier(measured, imported) : measured);
  return {
    prices_at: cap(aggregate.price_newest_at, lastImportOf(imports, marketplace, "prices")),
    stocks_at: cap(aggregate.stock_newest_at, lastImportOf(imports, marketplace, "stocks")),
  };
};

/* ----------------------------------------------------------------------------
 * The export
 * ------------------------------------------------------------------------- */

/**
 * The columns of the file, IN THE ORDER OF THE TABLE: product, the shop's
 * price, the marketplace's price with its gap, the shop's stock, the
 * marketplace's stock with its gap, where, updated. What the table shows in a
 * tooltip or not at all (the marketplace's id of the card, the reserve, the
 * line count) follows at the end, so a reader comparing the file with the
 * screen reads the same columns left to right.
 */
export const priceStockCsvColumns = (label: string): string[] => [
  "Продукт",
  "Артикул",
  "Цена в магазине",
  `Цена на ${label}`,
  `Цена на ${label} без скидки`,
  "Расхождение цены",
  "Расхождение цены, %",
  "Валюта",
  "Остаток в магазине, шт",
  `Остаток на ${label}, шт`,
  "Расхождение остатка, шт",
  "Где есть",
  "Обновлено",
  "Устарело",
  "Выше порога",
  `Карточка на ${label}`,
  `В резерве на ${label}, шт`,
  "Строк по складам и размерам",
];

const STATE_LABEL: Record<PriceStockState, (label: string) => string> = {
  both: () => "Есть везде",
  shop_only: () => "Только в магазине",
  marketplace_only: (label) => `Только на ${label}`,
};

const SEPARATOR = ";";

/**
 * RFC 4180 quoting over `;`. A TEXT whose first character is `=`, `+`, `-` or
 * `@` is prefixed with a single quote, because Excel and LibreOffice treat such
 * a cell as a formula, and a marketplace's title is text somebody else typed.
 * A NUMBER is not: «-117» is a price gap, and quoting it would turn it into
 * text nobody can add up.
 */
const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    /** The Russian Excel reads `1290.5` as text and `1290,5` as a number. */
    return String(value).replace(".", ",");
  }
  let text = value;
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The values of one row, in `priceStockCsvColumns` order. */
export const priceStockCsvCells = (row: PriceStockRow, label: string): (string | number | null)[] => {
  const mp = row.mp;
  return [
    row.title,
    row.vendor_code,
    row.shop?.price ?? null,
    mp ? (mp.discount_price ?? mp.price) : null,
    mp && mp.discount_price !== null ? mp.price : null,
    row.diff.price_abs,
    row.diff.price_pct,
    row.currency,
    row.shop?.stock ?? null,
    mp?.stock ?? null,
    row.diff.stock_abs,
    STATE_LABEL[row.state](label),
    mp ? (mp.stock_measured_at ?? mp.price_measured_at) : null,
    mp ? (mp.price_stale || mp.stock_stale ? "да" : "нет") : null,
    row.diff.highlighted ? "да" : "нет",
    row.external_id,
    mp?.reserved ?? null,
    mp?.lines ?? null,
  ];
};

/**
 * The export of EXACTLY the rows handed in, header first: `;`, `\r\n` and a
 * UTF-8 BOM, the shape `order-feed.ts` writes, because the owner opens it in a
 * Russian Excel. Lines of the file = rows + 1.
 */
export const toPriceStockCsv = (rows: readonly PriceStockRow[], label: string): string => {
  const lines = [priceStockCsvColumns(label).map(csvCell).join(SEPARATOR)];
  for (const row of rows) {
    lines.push(priceStockCsvCells(row, label).map(csvCell).join(SEPARATOR));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};
