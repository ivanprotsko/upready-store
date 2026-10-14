import {
  DEFAULT_PRICE_STOCK_THRESHOLDS,
  type PriceStockImport,
  type PriceStockLine,
  type PriceStockThresholds,
  aggregateLines,
  freshnessOf,
  lastImportOf,
  round2,
} from "./freshness";
import { sortPriceStockRows } from "./filter-sort";

/**
 * The rows of «Цены и остатки» (task-03): one per card, plus the shop's own.
 *
 * `../price-stock.ts` re-exports what callers use from here (t-2026-10-14-55).
 */


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
