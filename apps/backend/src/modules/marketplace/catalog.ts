/**
 * One catalog: the shop's products and the marketplace cards of the same
 * goods, side by side, keyed by the seller's own article
 * (w14-mp-catalog-link, spec 2.4 and row 3 of the parity matrix).
 *
 * THE ROW IS THE ARTICLE, not the card and not the product. A vendor code is
 * what the shop and the marketplace agree on (`vendorCode` on WB, `offer_id`
 * on Ozon, `product_variant.sku` here), so one row can carry the shop side,
 * the WB card and the Ozon card at once. Keying on the card instead would put
 * the same goods on three lines and make "how many of my goods are on the
 * marketplaces" unanswerable.
 *
 * FOUR STATES, AND THEY PARTITION THE ARTICLES. Every distinct vendor code of
 * the union (cards + shop SKUs) lands in exactly one of them, which is why the
 * four tab counts sum to the total and why `catalogCounts` returns that total
 * next to them instead of leaving the arithmetic to the screen.
 *
 *   linked                 a row in `mp_link` exists for one of the cards
 *   needs_choice           cards exist, no link, and the shop side does not
 *                          resolve on its own (see `NeedsChoiceReason`)
 *   not_found_in_shop      cards exist, no variant of the shop carries this article
 *   missing_on_marketplace the shop carries this article, no card does
 *
 * PURE. The rows come from the caller, the decisions come from here, and the
 * writing is the route's job — the same division `link.ts` already draws.
 */

import type { LinkReport } from "./link";

/** One marketplace listing, as much of it as the catalog screen needs. */
export type CatalogCard = {
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  title: string | null;
  /** How many photos the card carries, per `mp_product.photos`. */
  photos: number;
  mp_updated_at: string | null;
};

/** One price/stock line of a listing, per `mp_offer`. */
export type CatalogOffer = {
  marketplace: string;
  external_id: string;
  price: number | null;
  discount_price: number | null;
  currency: string | null;
  /** `null` means the marketplace said nothing, and is not `0` (rule 20a). */
  stock: number | null;
};

/**
 * One variant of the shop's catalog.
 *
 * `prices` is keyed by lower-case currency code because the comparison has to
 * happen INSIDE one currency: this catalog is seeded with 241 regions, so a
 * variant carries a price in dozens of currencies and picking "the" price
 * would be picking one at random.
 */
export type ShopVariant = {
  id: string;
  product_id: string;
  product_title: string | null;
  sku: string | null;
  prices: Record<string, number>;
  /** Sum of `inventory_level.stocked_quantity`; `null` when no inventory item. */
  stock: number | null;
  /** How many images the product carries. */
  photos: number;
};

/** One row of `mp_link`, as stored today. */
export type StoredLink = {
  id: string;
  marketplace: string;
  external_id: string;
  product_id: string;
  variant_id: string | null;
  matched_by: string;
  linked_at: string | null;
};

export type CatalogState =
  | "linked"
  | "needs_choice"
  | "not_found_in_shop"
  | "missing_on_marketplace";

/**
 * Why a row with cards is not linked.
 *
 * `ambiguous` is the matcher's third outcome: more than one variant carries
 * this article and nothing here may choose between them (spec 2.4).
 *
 * `not_linked_yet` is the other half of the same tab and a DIFFERENT fact: the
 * article resolves to exactly one variant, but no `mp_link` row exists,
 * because nobody has run the auto-link since the article appeared. Folding it
 * into `ambiguous` would ask the owner to choose where there is nothing to
 * choose, and folding it into `linked` would put a row on the screen as linked
 * while `mp_link` is empty — the very lie rule 20a is about. It is its own
 * reason, it says so on the row, and the «Связать всё по артикулу» button
 * clears it in one click.
 */
export type NeedsChoiceReason = "ambiguous" | "not_linked_yet";

/** One candidate variant of the shop for an article. */
export type CatalogCandidate = {
  variant_id: string;
  product_id: string;
  product_title: string | null;
  sku: string | null;
};

/** The marketplace half of one row, one entry per marketplace that has a card. */
export type CatalogCardSide = {
  marketplace: string;
  external_id: string;
  title: string | null;
  photos: number;
  /**
   * What a buyer pays on the marketplace: the lowest `discount_price` of the
   * card's offers, or the lowest `price` where no discount is given. A card
   * with sizes has one offer per size and they do not share a price, so a
   * single number is a choice and this is the choice made, named in
   * `price_basis` rather than left for the reader to guess.
   */
  price: number | null;
  price_basis: "discount_price" | "price" | null;
  currency: string | null;
  /** Sum of the offers that reported a stock; `null` when none did. */
  stock: number | null;
  offers: number;
  mp_updated_at: string | null;
  /** The stored link of THIS card, when there is one. */
  link: StoredLink | null;
};

/**
 * One comparison between the two catalogs.
 *
 * Rule 18e: a number on a screen carries its unit and a one-line hint of where
 * it came from, and `note` is that hint. `null` on either side is "nobody said",
 * never zero.
 */
export type CatalogDifference = {
  metric: "price" | "stock" | "photos";
  shop: number | null;
  marketplace: number | null;
  unit: string;
  abs: number | null;
  pct: number | null;
  highlighted: boolean;
  note: string;
};

export type CatalogRow = {
  vendor_code: string;
  state: CatalogState;
  reason: NeedsChoiceReason | null;
  shop: {
    variant_id: string;
    product_id: string;
    product_title: string | null;
    sku: string | null;
    price: number | null;
    currency: string | null;
    stock: number | null;
    photos: number;
  } | null;
  candidates: CatalogCandidate[];
  cards: CatalogCardSide[];
  differences: CatalogDifference[];
};

/**
 * What counts as a difference worth highlighting. Configurable because the
 * answer is the shop's, not ours: a 5 % gap is noise on a 100 ₽ item and a
 * problem on a 100 000 ₽ one.
 */
export type CatalogThresholds = {
  /** Price gap, percent of the marketplace price. */
  price_pct: number;
  /** Stock gap, whole units. */
  stock_abs: number;
  /** Photo count gap, whole photos. */
  photos_abs: number;
};

export const DEFAULT_THRESHOLDS: CatalogThresholds = {
  price_pct: 10,
  stock_abs: 1,
  photos_abs: 1,
};

/**
 * Articles are compared the way `link.ts` compares them and no other way:
 * trimmed and case-folded, nothing else. Two matchers with two normalisations
 * would put a card in «связано» on one screen and «не найдено» on the other.
 */
export const articleKey = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const groupBy = <T>(rows: readonly T[], keyOf: (row: T) => string | null): Map<string, T[]> => {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) {
      continue;
    }
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      index.set(key, [row]);
    }
  }
  return index;
};

const cardKey = (marketplace: string, externalId: string): string =>
  `${marketplace}|${externalId}`;

/** The lowest of the numbers given, ignoring what nobody reported. */
const lowest = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length ? Math.min(...known) : null;
};

/** The sum of the numbers given, or `null` when nobody reported one. */
const sum = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
};

const buildCardSide = (
  card: CatalogCard,
  offers: readonly CatalogOffer[],
  link: StoredLink | null,
): CatalogCardSide => {
  const discounted = lowest(offers.map((offer) => offer.discount_price));
  const listed = lowest(offers.map((offer) => offer.price));
  const price = discounted ?? listed;

  return {
    marketplace: card.marketplace,
    external_id: card.external_id,
    title: card.title,
    photos: card.photos,
    price,
    price_basis: price === null ? null : discounted !== null ? "discount_price" : "price",
    currency: offers.find((offer) => offer.currency)?.currency ?? null,
    stock: sum(offers.map((offer) => offer.stock)),
    offers: offers.length,
    mp_updated_at: card.mp_updated_at,
    link,
  };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const priceDifference = (
  shop: CatalogRow["shop"],
  side: CatalogCardSide,
  thresholds: CatalogThresholds,
): CatalogDifference => {
  const currency = side.currency;
  const shopPrice = shop?.price ?? null;
  const mpPrice = side.price;
  const abs = shopPrice !== null && mpPrice !== null ? round2(shopPrice - mpPrice) : null;
  const pct = abs !== null && mpPrice ? round2((abs / mpPrice) * 100) : null;

  const basis =
    side.price_basis === "discount_price"
      ? "наименьшая цена со скидкой"
      : side.price_basis === "price"
        ? "наименьшая цена без скидки"
        : "цены нет";

  const note =
    shopPrice === null && currency
      ? `магазин: цены в ${currency} нет (price.amount) · площадка: ${basis} по ${side.offers} строкам mp_offer`
      : `магазин: price.amount в ${currency ?? "валюте площадки"} · ` +
        `площадка: ${basis} по ${side.offers} строкам mp_offer`;

  return {
    metric: "price",
    shop: shopPrice,
    marketplace: mpPrice,
    unit: currency ?? "",
    abs,
    pct,
    highlighted: pct !== null && Math.abs(pct) >= thresholds.price_pct,
    note,
  };
};

const stockDifference = (
  shop: CatalogRow["shop"],
  side: CatalogCardSide,
  thresholds: CatalogThresholds,
): CatalogDifference => {
  const shopStock = shop?.stock ?? null;
  const abs = shopStock !== null && side.stock !== null ? shopStock - side.stock : null;
  const pct = abs !== null && side.stock ? round2((abs / side.stock) * 100) : null;

  return {
    metric: "stock",
    shop: shopStock,
    marketplace: side.stock,
    unit: "шт",
    abs,
    pct,
    highlighted: abs !== null && Math.abs(abs) >= thresholds.stock_abs,
    note:
      "магазин: сумма inventory_level.stocked_quantity · " +
      `площадка: сумма mp_offer.stock по ${side.offers} строкам` +
      (side.stock === null ? " (площадка остаток не назвала)" : ""),
  };
};

const photosDifference = (
  shop: CatalogRow["shop"],
  side: CatalogCardSide,
  thresholds: CatalogThresholds,
): CatalogDifference => {
  const shopPhotos = shop?.photos ?? null;
  const abs = shopPhotos !== null ? shopPhotos - side.photos : null;

  return {
    metric: "photos",
    shop: shopPhotos,
    marketplace: side.photos,
    unit: "фото",
    abs,
    pct: null,
    highlighted: abs !== null && Math.abs(abs) >= thresholds.photos_abs,
    note: "магазин: product.images · площадка: mp_product.photos",
  };
};

export type BuildCatalogInput = {
  cards: readonly CatalogCard[];
  offers: readonly CatalogOffer[];
  variants: readonly ShopVariant[];
  links: readonly StoredLink[];
  thresholds?: CatalogThresholds;
};

/**
 * The whole screen in one pass: one row per distinct article, sorted so the
 * rows that need a person come first.
 */
export const buildCatalogRows = (input: BuildCatalogInput): CatalogRow[] => {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;

  const cardsByArticle = groupBy(input.cards, (card) => articleKey(card.vendor_code));
  const variantsByArticle = groupBy(input.variants, (variant) => articleKey(variant.sku));

  const offersByCard = groupBy(input.offers, (offer) =>
    cardKey(offer.marketplace, offer.external_id),
  );
  const linkByCard = new Map(
    input.links.map((link) => [cardKey(link.marketplace, link.external_id), link]),
  );

  const articles = new Set<string>([...cardsByArticle.keys(), ...variantsByArticle.keys()]);
  const rows: CatalogRow[] = [];

  for (const article of articles) {
    const cards = cardsByArticle.get(article) ?? [];
    const variants = variantsByArticle.get(article) ?? [];

    const sides = cards.map((card) =>
      buildCardSide(
        card,
        offersByCard.get(cardKey(card.marketplace, card.external_id)) ?? [],
        linkByCard.get(cardKey(card.marketplace, card.external_id)) ?? null,
      ),
    );

    const candidates: CatalogCandidate[] = variants.map((variant) => ({
      variant_id: variant.id,
      product_id: variant.product_id,
      product_title: variant.product_title,
      sku: variant.sku,
    }));

    /**
     * The article as the owner typed it, not as it was folded for matching.
     * The card wins over the shop only because the card is the side she cannot
     * edit; where there is no card the shop's own spelling is the display name.
     */
    const display =
      cards.find((card) => card.vendor_code)?.vendor_code ??
      variants.find((variant) => variant.sku)?.sku ??
      article;

    const linkedSide = sides.find((side) => side.link) ?? null;

    /**
     * The shop half of the row. A link names the variant; with no link and one
     * candidate the candidate IS the shop half, which is what makes the
     * differences visible BEFORE the link is written.
     */
    const shopVariant = linkedSide?.link
      ? (variants.find((variant) => variant.id === linkedSide.link?.variant_id) ??
        variants.find((variant) => variant.product_id === linkedSide.link?.product_id) ??
        null)
      : variants.length === 1
        ? variants[0]
        : null;

    const currency = sides.find((side) => side.currency)?.currency ?? null;

    const shop: CatalogRow["shop"] = shopVariant
      ? {
          variant_id: shopVariant.id,
          product_id: shopVariant.product_id,
          product_title: shopVariant.product_title,
          sku: shopVariant.sku,
          price: currency ? (shopVariant.prices[currency.toLowerCase()] ?? null) : null,
          currency,
          stock: shopVariant.stock,
          photos: shopVariant.photos,
        }
      : null;

    let state: CatalogState;
    let reason: NeedsChoiceReason | null = null;

    if (linkedSide) {
      state = "linked";
    } else if (cards.length === 0) {
      state = "missing_on_marketplace";
    } else if (variants.length === 0) {
      state = "not_found_in_shop";
    } else {
      state = "needs_choice";
      reason = variants.length > 1 ? "ambiguous" : "not_linked_yet";
    }

    const differences =
      shop && sides.length
        ? sides.flatMap((side) => [
            priceDifference(shop, side, thresholds),
            stockDifference(shop, side, thresholds),
            photosDifference(shop, side, thresholds),
          ])
        : [];

    rows.push({
      vendor_code: display,
      state,
      reason,
      shop,
      candidates,
      cards: sides,
      differences,
    });
  }

  const order: Record<CatalogState, number> = {
    needs_choice: 0,
    not_found_in_shop: 1,
    missing_on_marketplace: 2,
    linked: 3,
  };

  return rows.sort(
    (left, right) =>
      order[left.state] - order[right.state] ||
      left.vendor_code.localeCompare(right.vendor_code, "ru"),
  );
};

export type CatalogCounts = {
  linked: number;
  needs_choice: number;
  not_found_in_shop: number;
  missing_on_marketplace: number;
  /** Distinct articles. The four counts above sum to exactly this. */
  total: number;
  /** The sum itself, so a caller can assert the arithmetic instead of trusting it. */
  accounted_for: number;
};

export const catalogCounts = (rows: readonly CatalogRow[]): CatalogCounts => {
  const counts = {
    linked: 0,
    needs_choice: 0,
    not_found_in_shop: 0,
    missing_on_marketplace: 0,
  };

  for (const row of rows) {
    counts[row.state] += 1;
  }

  return {
    ...counts,
    total: rows.length,
    accounted_for:
      counts.linked + counts.needs_choice + counts.not_found_in_shop + counts.missing_on_marketplace,
  };
};

/**
 * Where the numbers came from, named in absolute paths and table names.
 *
 * This exists for the zero. A screen that says «нет данных» over an empty list
 * teaches the owner nothing and hides a setup error — an unlinked demo
 * catalog, an import that never ran — behind a calm sentence (rule 20a). So
 * when the cards are there and the links are not, the screen says so and names
 * the file that decided it and the tables it read.
 */
export type CatalogSources = {
  matcher: string;
  cards: string;
  variants: string;
  links: string;
};

export const catalogSummary = (
  counts: CatalogCounts,
  report: Pick<LinkReport, "total">,
  sources: CatalogSources,
): string => {
  if (counts.total === 0) {
    return (
      "Артикулов нет: ни одной карточки площадки и ни одного SKU магазина. " +
      `Проверено: ${sources.cards}, ${sources.variants}.`
    );
  }

  if (report.total > 0 && counts.linked === 0) {
    return (
      `Сопоставление не сработало: 0 из ${report.total}. ` +
      `Проверено: карточки — ${sources.cards}; варианты магазина — ${sources.variants}; ` +
      `связи — ${sources.links}. Правило сопоставления: ${sources.matcher}.`
    );
  }

  return (
    `Связано ${counts.linked} из ${counts.total} артикулов. ` +
    `Требует выбора: ${counts.needs_choice}, нет в магазине: ${counts.not_found_in_shop}, ` +
    `нет на площадке: ${counts.missing_on_marketplace}.`
  );
};
