/**
 * ONE TABLE OF PRICES AND STOCKS: the shop and every marketplace on one screen
 * (w17-mp-price-stock-table, row 4 of the parity matrix in
 * `research/marketplace-spec.md`).
 *
 * InSales Combo advertises «цены и остатки всех площадок правятся в одной
 * таблице». In our READ-ONLY frame this is the same table minus the editing:
 * the shop's numbers stand next to each marketplace's numbers, the gaps are
 * pointed at, and NOTHING here writes anywhere. Ivan's standing invariant of
 * 2026-09-16 02:46 WITA — no inline edit, no bulk action, no «отправить на
 * площадку» — is proved by `__tests__/price-stock-read-only.unit.spec.ts` and
 * not by this sentence.
 *
 * THE ROW IS THE ARTICLE, exactly as in `catalog.ts`, and for the same reason:
 * a vendor code is the one string the shop and both marketplaces agree on, so
 * one line can carry the shop, the WB card and the Ozon card at once. The
 * normalisation of that key is `articleKey` from `catalog.ts` and not a second
 * copy of it — two matchers would put an article in «везде есть» on one screen
 * and «нет в магазине» on the other.
 *
 * THE NUMBER ON THE COLLAPSED ROW IS THE SUM OF THE EXPANDED ONES, by
 * construction: `aggregateLines` is the only place a column's price and stock
 * are decided, and both the collapsed row and the expanded lines of the detail
 * route go through it. `__tests__/price-stock.unit.spec.ts` asserts the
 * identity on generated data, and the PR quotes it on a concrete article.
 *
 * FRESHNESS IS PART OF THE NUMBER (deliverable 4). A number whose age is
 * hidden is a number that lies, so every column carries the age of what it
 * shows and says «протухло» past the kind's interval times three. The age is
 * taken from the OLDER of two facts, never the newer one:
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

import { articleKey } from "./catalog";
import { MP_KIND_FAMILY, MP_SYNC_INTERVAL_MS } from "./schedule";

/** The two families this screen is about. The intervals are `schedule.ts`'s. */
export type PriceStockFamily = "prices" | "stocks";

/**
 * How many intervals a number may age before the screen calls it stale.
 *
 * THREE, from the task: «older than the kind's interval times three». One
 * interval would paint every column red the minute before the next run — the
 * scheduler wakes every five minutes and a stocks import is due every fifteen,
 * so a normal Tuesday would look like an outage.
 */
export const STALE_FACTOR = 3;

export const staleAfterMs = (family: PriceStockFamily): number =>
  MP_SYNC_INTERVAL_MS[family] * STALE_FACTOR;

/** One marketplace listing, as much of it as this screen needs (`mp_product`). */
export type PriceStockCard = {
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  title: string | null;
};

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
  /**
   * `mp_offer.vendor_code`. The CARD is the authority on the article, and this
   * is the fallback for a line whose card has not been imported yet: an offer
   * without a card still belongs to an article, and dropping it would hide
   * stock the marketplace did report (rule 20a).
   */
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

/**
 * One variant of the shop's catalog.
 *
 * `prices` is keyed by lower-case currency, like `catalog.ts`: this catalog is
 * seeded with 241 regions, so «the» price of a variant does not exist and the
 * comparison happens inside the currency the marketplace named.
 */
export type PriceStockVariant = {
  id: string;
  product_id: string;
  product_title: string | null;
  sku: string | null;
  prices: Record<string, number>;
  /** Sum of `inventory_level.stocked_quantity`; `null` where no inventory item. */
  stock: number | null;
};

/** One row of `mp_sync_run`, as much of it as freshness needs. */
export type PriceStockImport = {
  marketplace: string;
  kind: string;
  status: string;
  finished_at: string | null;
};

/**
 * What counts as a difference worth highlighting, and shown ON the screen
 * rather than kept in code: the answer is the shop's, and a threshold nobody
 * can see is a highlight nobody can explain.
 */
export type PriceStockThresholds = {
  /** Price gap, percent of the marketplace price. */
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
   * A column with no number at all is not stale, it is empty, and the screen
   * says «нет данных» rather than painting an absence red.
   */
  stale: boolean;
  /** One line naming both sources and the window (rule 18e). */
  note: string;
};

/** The marketplace half of one row, one entry per marketplace with a card. */
export type PriceStockColumn = {
  marketplace: string;
  /** Every card of this article on that marketplace. Usually one. */
  external_ids: string[];
  /** The listed price, lowest across the lines. */
  price: number | null;
  /** What a buyer actually pays: the lowest discounted price, where there is one. */
  discount_price: number | null;
  /** The number the comparison uses: `discount_price ?? price`. */
  effective_price: number | null;
  effective_basis: "discount_price" | "price" | null;
  currency: string | null;
  /** Sum of the lines that reported a stock; `null` when none did. */
  stock: number | null;
  reserved: number | null;
  /** How many `mp_offer` lines stand behind this column. */
  lines: number;
  /** How many of them reported a stock. The sum above is over exactly these. */
  stock_lines: number;
  warehouses: number;
  sizes: number;
  price_freshness: Freshness;
  stock_freshness: Freshness;
};

export type PriceStockShop = {
  variant_id: string;
  product_id: string;
  product_title: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  stock: number | null;
};

/**
 * One comparison, shop against one marketplace.
 *
 * `marketplace_value` and not `marketplace`, because the column beside it is
 * already the marketplace's id and two fields of one name on one object is how
 * a screen prints an id where a number belongs.
 */
export type PriceStockDifference = {
  marketplace: string;
  metric: "price" | "stock";
  shop: number | null;
  marketplace_value: number | null;
  unit: string;
  abs: number | null;
  pct: number | null;
  highlighted: boolean;
  note: string;
};

/**
 * THE THREE GROUPS THAT PARTITION THE ARTICLES.
 *
 * Every distinct vendor code lands in exactly one of them, which is why their
 * counts sum to the total and why `priceStockCounts` returns that sum next to
 * the total instead of leaving the arithmetic to the screen.
 *
 * «Расхождение выше порога» is the fourth TAB and deliberately NOT a fourth
 * group: a difference needs both sides, so every such row is already in
 * `both`. Making it a fourth member of the partition would double-count those
 * rows and break the very arithmetic the tabs exist to show.
 */
export type PriceStockGroup = "both" | "shop_only" | "marketplace_only";

export type PriceStockRow = {
  vendor_code: string;
  group: PriceStockGroup;
  /** `true` when any difference of this row is past its threshold. */
  over_threshold: boolean;
  shop: PriceStockShop | null;
  /** How many variants of the shop carry this article. */
  shop_variants: number;
  /**
   * `true` when MORE THAN ONE variant carries it, which is why `shop` is
   * `null` on a row that does belong to the shop. Without this flag an empty
   * shop cell would read as «нет данных», and the owner would go looking for
   * an import instead of for the duplicate article (rule 20a). The choice
   * itself is made on the «Каталог» screen, which owns it.
   */
  shop_ambiguous: boolean;
  columns: PriceStockColumn[];
  differences: PriceStockDifference[];
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
 * The age of one number of one column.
 *
 * `hasValue` decides whether staleness is even a question: an empty column is
 * empty, not stale, and painting «нет данных» red would send the owner looking
 * for an import that has nothing to bring.
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
 * THE ONE PLACE A COLUMN'S NUMBERS ARE DECIDED.
 *
 * The collapsed row and the expanded lines both come through here, which is
 * what makes «свёрнутый остаток = сумма развёрнутых» true by construction
 * rather than by two functions agreeing today.
 *
 * The price is the LOWEST across the lines, not the first and not an average.
 * A card with sizes has one line per size and they do not share a price, so a
 * single number is a choice; this is the choice made, and `effective_basis`
 * names it on the row instead of leaving the reader to guess.
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
    effective_price: effective,
    effective_basis: (effective === null
      ? null
      : discount !== null
        ? "discount_price"
        : "price") as PriceStockColumn["effective_basis"],
    currency: lines.find((line) => line.currency)?.currency ?? null,
    stock: total(stocked.map((line) => line.stock)),
    reserved: total(lines.map((line) => line.reserved)),
    lines: lines.length,
    stock_lines: stocked.length,
    priced_lines: priced.length,
    warehouses: new Set(lines.map((line) => line.warehouse_id).filter(Boolean)).size,
    sizes: new Set(lines.map((line) => line.size_external).filter(Boolean)).size,
    /** The OLDEST measurement behind each number: a column is as fresh as its stalest line. */
    stock_measured_at: oldest(stocked.map((line) => line.measured_at)),
    price_measured_at: oldest(priced.map((line) => line.measured_at)),
  };
};

const priceDifference = (
  marketplace: string,
  shop: PriceStockShop | null,
  column: PriceStockColumn,
  thresholds: PriceStockThresholds,
): PriceStockDifference => {
  const shopPrice = shop?.price ?? null;
  const mpPrice = column.effective_price;
  const abs = shopPrice !== null && mpPrice !== null ? round2(shopPrice - mpPrice) : null;
  const pct = abs !== null && mpPrice ? round2((abs / mpPrice) * 100) : null;

  const basis =
    column.effective_basis === "discount_price"
      ? "наименьшая цена со скидкой"
      : column.effective_basis === "price"
        ? "наименьшая цена без скидки"
        : "цены нет";

  return {
    marketplace,
    metric: "price",
    shop: shopPrice,
    marketplace_value: mpPrice,
    unit: column.currency ?? shop?.currency ?? "",
    abs,
    pct,
    highlighted: pct !== null && Math.abs(pct) >= thresholds.price_pct,
    note:
      `магазин: price.amount в ${column.currency ?? "валюте площадки"} · ` +
      `площадка: ${basis} по ${column.lines} строкам mp_offer`,
  };
};

const stockDifference = (
  marketplace: string,
  shop: PriceStockShop | null,
  column: PriceStockColumn,
  thresholds: PriceStockThresholds,
): PriceStockDifference => {
  const shopStock = shop?.stock ?? null;
  const abs = shopStock !== null && column.stock !== null ? shopStock - column.stock : null;
  const pct = abs !== null && column.stock ? round2((abs / column.stock) * 100) : null;

  return {
    marketplace,
    metric: "stock",
    shop: shopStock,
    marketplace_value: column.stock,
    unit: "шт",
    abs,
    pct,
    highlighted: abs !== null && Math.abs(abs) >= thresholds.stock_abs,
    note:
      "магазин: сумма inventory_level.stocked_quantity · " +
      `площадка: сумма mp_offer.stock по ${column.stock_lines} строкам из ${column.lines}` +
      (column.stock === null ? " (площадка остаток не назвала)" : ""),
  };
};

export type BuildPriceStockInput = {
  cards: readonly PriceStockCard[];
  lines: readonly PriceStockLine[];
  variants: readonly PriceStockVariant[];
  imports: readonly PriceStockImport[];
  /** Column order, from the adapter registry. */
  marketplaces: readonly string[];
  thresholds?: PriceStockThresholds;
  /** Injected, never read from the clock in here (rule 17a). */
  now: Date;
};

const cardKey = (marketplace: string, externalId: string): string => `${marketplace}|${externalId}`;

/** The whole table in one pass: one row per distinct article. */
export const buildPriceStockRows = (input: BuildPriceStockInput): PriceStockRow[] => {
  const thresholds = input.thresholds ?? DEFAULT_PRICE_STOCK_THRESHOLDS;

  /** `mp_offer` carries its own `vendor_code`, but the CARD is the authority on it. */
  const articleOfCard = new Map<string, string | null>(
    input.cards.map((card) => [cardKey(card.marketplace, card.external_id), articleKey(card.vendor_code)]),
  );

  const cardsByArticle = new Map<string, PriceStockCard[]>();
  for (const card of input.cards) {
    const key = articleKey(card.vendor_code);
    if (key === null) {
      continue;
    }
    const bucket = cardsByArticle.get(key);
    if (bucket) {
      bucket.push(card);
    } else {
      cardsByArticle.set(key, [card]);
    }
  }

  const variantsByArticle = new Map<string, PriceStockVariant[]>();
  for (const variant of input.variants) {
    const key = articleKey(variant.sku);
    if (key === null) {
      continue;
    }
    const bucket = variantsByArticle.get(key);
    if (bucket) {
      bucket.push(variant);
    } else {
      variantsByArticle.set(key, [variant]);
    }
  }

  /** article -> marketplace -> lines. */
  const linesByArticle = new Map<string, Map<string, PriceStockLine[]>>();
  for (const line of input.lines) {
    const key =
      articleOfCard.get(cardKey(line.marketplace, line.external_id)) ?? articleKey(line.vendor_code);
    if (!key) {
      continue;
    }
    let byMarketplace = linesByArticle.get(key);
    if (!byMarketplace) {
      byMarketplace = new Map();
      linesByArticle.set(key, byMarketplace);
    }
    const bucket = byMarketplace.get(line.marketplace);
    if (bucket) {
      bucket.push(line);
    } else {
      byMarketplace.set(line.marketplace, [line]);
    }
  }

  const importAt = new Map<string, string | null>();
  const importFor = (marketplace: string, family: PriceStockFamily): string | null => {
    const key = `${marketplace}|${family}`;
    if (!importAt.has(key)) {
      importAt.set(key, lastImportOf(input.imports, marketplace, family));
    }
    return importAt.get(key) ?? null;
  };

  /**
   * THE UNION OF THREE SOURCES, not two. An article known only from an
   * `mp_offer` line — a price and a stock whose card has not been imported yet
   * — is a number the marketplace did report, and leaving it out of the set
   * would drop it from the one table that exists to show it, silently.
   */
  const articles = new Set<string>([
    ...cardsByArticle.keys(),
    ...variantsByArticle.keys(),
    ...linesByArticle.keys(),
  ]);
  const rows: PriceStockRow[] = [];

  for (const article of articles) {
    const cards = cardsByArticle.get(article) ?? [];
    const variants = variantsByArticle.get(article) ?? [];
    const linesOfArticle = linesByArticle.get(article) ?? new Map<string, PriceStockLine[]>();

    const columns: PriceStockColumn[] = [];
    for (const marketplace of input.marketplaces) {
      const marketplaceCards = cards.filter((card) => card.marketplace === marketplace);
      const lines = linesOfArticle.get(marketplace) ?? [];
      /**
       * A column stands where there are CARDS or LINES. Requiring a card would
       * drop the price and stock of an offer whose card has not been imported
       * yet — a number the marketplace did report, silently missing from the
       * one table that exists to show it.
       */
      if (!marketplaceCards.length && !lines.length) {
        continue;
      }

      const aggregate = aggregateLines(lines);

      columns.push({
        marketplace,
        external_ids: [
          ...new Set([
            ...marketplaceCards.map((card) => card.external_id),
            ...lines.map((line) => line.external_id),
          ]),
        ],
        price: aggregate.price,
        discount_price: aggregate.discount_price,
        effective_price: aggregate.effective_price,
        effective_basis: aggregate.effective_basis,
        currency: aggregate.currency,
        stock: aggregate.stock,
        reserved: aggregate.reserved,
        lines: aggregate.lines,
        stock_lines: aggregate.stock_lines,
        warehouses: aggregate.warehouses,
        sizes: aggregate.sizes,
        price_freshness: freshnessOf({
          family: "prices",
          hasValue: aggregate.effective_price !== null,
          measuredAt: aggregate.price_measured_at,
          importedAt: importFor(marketplace, "prices"),
          now: input.now,
          marketplace,
          lines: aggregate.priced_lines,
        }),
        stock_freshness: freshnessOf({
          family: "stocks",
          hasValue: aggregate.stock !== null,
          measuredAt: aggregate.stock_measured_at,
          importedAt: importFor(marketplace, "stocks"),
          now: input.now,
          marketplace,
          lines: aggregate.stock_lines,
        }),
      });
    }

    /**
     * The article as somebody typed it, not as it was folded for matching. The
     * card wins over the shop because the card is the side the owner cannot
     * edit; with no card the shop's own spelling is the display name.
     */
    const display =
      cards.find((card) => card.vendor_code)?.vendor_code ??
      variants.find((variant) => variant.sku)?.sku ??
      article;

    const currency = columns.find((column) => column.currency)?.currency ?? null;

    /**
     * ONE variant is the shop half. More than one variant on one article is
     * the ambiguity `catalog.ts` refuses to resolve, and this screen refuses
     * it the same way: showing the first of several as «цена магазина» would
     * be a number invented for a row (rule 20a). The article still counts as
     * present in the shop — the group below is decided on the VARIANTS, not on
     * this field.
     */
    const variant = variants.length === 1 ? variants[0] : null;

    const shop: PriceStockShop | null = variant
      ? {
          variant_id: variant.id,
          product_id: variant.product_id,
          product_title: variant.product_title,
          sku: variant.sku,
          price: currency ? (variant.prices[currency.toLowerCase()] ?? null) : null,
          currency,
          stock: variant.stock,
        }
      : null;

    const group: PriceStockGroup = variants.length
      ? columns.length
        ? "both"
        : "shop_only"
      : "marketplace_only";

    const differences = columns.flatMap((column) => [
      priceDifference(column.marketplace, shop, column, thresholds),
      stockDifference(column.marketplace, shop, column, thresholds),
    ]);

    rows.push({
      vendor_code: display,
      group,
      over_threshold: differences.some((difference) => difference.highlighted),
      shop,
      shop_variants: variants.length,
      shop_ambiguous: variants.length > 1,
      columns,
      differences,
    });
  }

  const order: Record<PriceStockGroup, number> = {
    both: 0,
    marketplace_only: 1,
    shop_only: 2,
  };

  return rows.sort(
    (left, right) =>
      Number(right.over_threshold) - Number(left.over_threshold) ||
      order[left.group] - order[right.group] ||
      left.vendor_code.localeCompare(right.vendor_code, "ru"),
  );
};

export type PriceStockCounts = {
  both: number;
  shop_only: number;
  marketplace_only: number;
  /** Distinct articles. The three counts above sum to exactly this. */
  total: number;
  /** The sum itself, so a caller can assert the arithmetic instead of trusting it. */
  accounted_for: number;
  /**
   * The fourth TAB, and an OVERLAY on the three groups above: every row here
   * is already counted in `both`. It is listed apart from the partition on
   * purpose — see `PriceStockGroup`.
   */
  over_threshold: number;
  /** How many columns of the whole table show a number older than its window. */
  stale_columns: number;
};

export const priceStockCounts = (rows: readonly PriceStockRow[]): PriceStockCounts => {
  const counts = { both: 0, shop_only: 0, marketplace_only: 0 };
  let overThreshold = 0;
  let stale = 0;

  for (const row of rows) {
    counts[row.group] += 1;
    if (row.over_threshold) {
      overThreshold += 1;
    }
    for (const column of row.columns) {
      if (column.price_freshness.stale) {
        stale += 1;
      }
      if (column.stock_freshness.stale) {
        stale += 1;
      }
    }
  }

  return {
    ...counts,
    total: rows.length,
    accounted_for: counts.both + counts.shop_only + counts.marketplace_only,
    over_threshold: overThreshold,
    stale_columns: stale,
  };
};

/** The tabs of the screen. Three groups plus the overlay, in screen order. */
export type PriceStockTab = PriceStockGroup | "over_threshold";

export const filterByTab = (
  rows: readonly PriceStockRow[],
  tab: PriceStockTab,
): PriceStockRow[] =>
  tab === "over_threshold"
    ? rows.filter((row) => row.over_threshold)
    : rows.filter((row) => row.group === tab);

/**
 * Where the numbers came from, printed by the screen when a count is zero.
 *
 * This exists for the zero (rule 20a). «Нет данных» over an empty table hides
 * a setup error — an import that never ran, a tenant with no cards — behind a
 * calm sentence, so the screen names the tables it read instead.
 */
export type PriceStockSources = {
  cards: string;
  lines: string;
  variants: string;
  imports: string;
};

export const priceStockSummary = (
  counts: PriceStockCounts,
  stored: { cards: number; lines: number; variants: number },
  sources: PriceStockSources,
): string => {
  if (counts.total === 0) {
    return (
      "Артикулов нет: ни одной карточки площадки и ни одного SKU магазина. " +
      `Прочитано: ${sources.cards}, ${sources.variants}.`
    );
  }

  if (stored.cards > 0 && stored.lines === 0) {
    return (
      `Карточек ${stored.cards}, а строк цен и остатков ноль — импорт цен и остатков не приносил данных. ` +
      `Прочитано: ${sources.cards}, ${sources.lines}, ${sources.imports}.`
    );
  }

  return (
    `Везде есть: ${counts.both}, есть в магазине и нет на площадке: ${counts.shop_only}, ` +
    `есть на площадке и нет в магазине: ${counts.marketplace_only} — ` +
    `всего ${counts.total} артикулов. Расхождение выше порога: ${counts.over_threshold}. ` +
    `Колонок с протухшими числами: ${counts.stale_columns}.`
  );
};

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const GROUP_LABEL: Record<PriceStockGroup, string> = {
  both: "везде есть",
  shop_only: "есть в магазине, нет на площадке",
  marketplace_only: "есть на площадке, нет в магазине",
};

/**
 * The CSV of EXACTLY the rows given, one line per article.
 *
 * The columns are built from the marketplace list, so a third adapter widens
 * the file by being registered. Every money and count column says its unit in
 * the header (rule 18e), and the freshness of each marketplace travels with
 * its numbers — a spreadsheet that drops the age is the same lie as a screen
 * that drops it.
 *
 * `wc -l` of the result is the number of rows plus one header line, and the PR
 * quotes both that and the count the screen shows.
 */
export const toPriceStockCsv = (
  rows: readonly PriceStockRow[],
  marketplaces: readonly string[],
  /**
   * How each marketplace is CALLED in the header. The screen says
   * «Wildberries» and the file must say the same word: a spreadsheet headed
   * «wb» asks its reader to know our internal ids. Absent, the id stands in —
   * an unlabelled column is better than a blank one (rule 20a).
   */
  labels: Record<string, string> = {},
): string => {
  const head = [
    "Артикул",
    "Группа",
    "Товар магазина",
    "Цена в магазине, ₽",
    "Остаток в магазине, шт",
  ];

  for (const marketplace of marketplaces) {
    const label = labels[marketplace] ?? marketplace;
    head.push(
      `Цена на ${label}, ₽ без скидки`,
      `Цена на ${label}, ₽ с учётом скидки`,
      `Остаток на ${label}, шт`,
      `Строк mp_offer на ${label}`,
      `Замер цены на ${label}`,
      `Замер остатка на ${label}`,
      `Данные ${label} протухли`,
      `Расхождение цены с ${label}, ₽`,
      `Расхождение цены с ${label}, %`,
      `Расхождение остатка с ${label}, шт`,
    );
  }

  head.push("Выше порога");

  const lines = [head.map(csvCell).join(",")];

  for (const row of rows) {
    const cells: unknown[] = [
      row.vendor_code,
      GROUP_LABEL[row.group],
      row.shop?.product_title ?? null,
      row.shop?.price ?? null,
      row.shop?.stock ?? null,
    ];

    for (const marketplace of marketplaces) {
      const column = row.columns.find((entry) => entry.marketplace === marketplace) ?? null;
      const price = row.differences.find(
        (difference) => difference.marketplace === marketplace && difference.metric === "price",
      );
      const stock = row.differences.find(
        (difference) => difference.marketplace === marketplace && difference.metric === "stock",
      );

      cells.push(
        column?.price ?? null,
        column?.discount_price ?? null,
        column?.stock ?? null,
        column?.lines ?? null,
        column?.price_freshness.as_of ?? null,
        column?.stock_freshness.as_of ?? null,
        column
          ? column.price_freshness.stale || column.stock_freshness.stale
            ? "да"
            : "нет"
          : null,
        price?.abs ?? null,
        price?.pct ?? null,
        stock?.abs ?? null,
      );
    }

    cells.push(row.over_threshold ? "да" : "нет");
    lines.push(cells.map(csvCell).join(","));
  }

  /** BOM + CRLF, the same shape `order-feed.ts` writes: Excel opens it as UTF-8. */
  return `﻿${lines.join("\r\n")}\r\n`;
};
