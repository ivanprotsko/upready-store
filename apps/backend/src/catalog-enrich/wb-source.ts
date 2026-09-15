import { readCharacteristics, type RawCharacteristic } from "../product-attributes-fill/parse-characteristics";

/**
 * What one Wildberries card says, in the shapes the enrichment writes
 * (w07-tenant-catalog-enrich).
 *
 * Everything here reads the MIRROR (`wb_product`, `wb_price`, `wb_feedback`),
 * never Wildberries: this file runs on the live host too, where there is no WB
 * key and the mirror arrives as an exported dataset.
 */

/** The mirror rows this module reads, narrowed to the columns it uses. */
export type MirrorProductRow = {
  nm_id: string;
  vendor_code: string | null;
  title: string | null;
  brand: string | null;
  photos: unknown;
  raw: unknown;
};

export type MirrorPriceRow = {
  nm_id: string;
  currency_iso: string | null;
  discount: number | null;
  sizes: unknown;
  raw: unknown;
};

export type MirrorFeedbackRow = {
  feedback_id: string;
  nm_id: string | null;
  product_valuation: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  user_name: string | null;
  created_date: Date | string | null;
  raw: unknown;
};

/**
 * Characteristics WB requires of a seller and a shopper never reads: the VAT
 * rate, the customs code and the paperwork of the conformity declaration. They
 * are in every card, they would be the three longest rows of the «Характеристики»
 * block, and none of them describes the product. Matched on the normalised
 * name, so a card spelling one of them with different capitalisation is caught
 * too.
 */
export const REGULATORY_CHARACTERISTICS = new Set([
  "ставка ндс",
  "тнвэд",
  "номер декларации соответствия",
  "дата регистрации сертификата/декларации",
  "дата окончания действия сертификата/декларации",
]);

const collapse = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * The card's characteristics as name/value pairs.
 *
 * `POST /content/v2/get/cards/list` answers `{ id, name, value: [...] }` — the
 * value is an ARRAY even when it holds one item. `readCharacteristics` is the
 * catalog's own reader for this bag (b04) and now understands that shape too,
 * so both paths produce the same rows from the same card.
 */
export const cardCharacteristics = (raw: unknown): RawCharacteristic[] => {
  const bag = (raw as Record<string, unknown> | null)?.characteristics;
  return readCharacteristics(bag).filter(
    (entry) =>
      !REGULATORY_CHARACTERISTICS.has(
        entry.name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim(),
      ),
  );
};

/**
 * The price a Wildberries BUYER sees, in whole units of `currency_iso`.
 *
 * `GET /api/v2/list/goods/filter` gives three numbers per size: `price` (the
 * seller's own, before the discount), `discountedPrice` (what the card shows
 * after the seller's discount) and `clubDiscountedPrice` (lower again, and
 * only for a WB Club subscriber). The shop's own price is what any buyer pays,
 * so it is `discountedPrice`: the club price would undercut the shop for
 * everyone, and `price` is a number the WB shopper never sees. Measured on the
 * mirror 2026-09-16: nmID 94372564 is `price` 1980, `discount` 50,
 * `discountedPrice` 990.
 *
 * A card priced per size gives several numbers; the LOWEST is taken, because
 * that is the one the WB listing shows as «от».
 */
export const buyerPrice = (row: MirrorPriceRow | null | undefined): number | null => {
  const sizes = Array.isArray(row?.sizes) ? (row?.sizes as Record<string, unknown>[]) : [];
  const amounts = sizes
    .map((size) => Number(size?.discountedPrice))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  if (!amounts.length) {
    return null;
  }
  return Math.min(...amounts);
};

/** WB reports amounts in the currency named by `currencyIsoCode4217`; the mirror keeps it verbatim. */
export const priceCurrency = (row: MirrorPriceRow | null | undefined): string | null => {
  const iso = collapse(row?.currency_iso).toLowerCase();
  return iso || null;
};

export type CardPhoto = { index: number; url: string };

/**
 * The card's photos at the largest size WB serves.
 *
 * `photos[]` carries one object per photo with the sizes as keys. `big` is the
 * largest that actually answers: measured 2026-09-16 on nmID 94372564,
 * `big` is 101 528 bytes and 200, `c516x688` is 60 992 bytes, and the `hq` key
 * some cards carry answers 404. The URL is taken from the mirror and never
 * built from the item number: the basket host is part of what WB returns
 * (`basket-05`, `basket-15`, …) and a constructed one 404s.
 */
export const cardPhotos = (photos: unknown): CardPhoto[] => {
  if (!Array.isArray(photos)) {
    return [];
  }
  const out: CardPhoto[] = [];
  photos.forEach((photo, index) => {
    const record = photo as Record<string, unknown> | null;
    const url = collapse(record?.big) || collapse(record?.c516x688);
    if (url.startsWith("https://")) {
      out.push({ index: index + 1, url });
    }
  });
  return out;
};

export type CardReview = {
  /** WB's own feedback id — what makes the import idempotent. */
  source_key: string;
  author_name: string;
  rating: number;
  body: string;
  review_date: string | null;
  reply: string | null;
};

/** WB shows a nameless review as «Покупатель»; the storefront needs a non-empty author. */
const ANONYMOUS_AUTHOR = "Покупатель Wildberries";

/** Why a mirrored feedback cannot become a review of the shop. */
export type ReviewSkipReason = "no_text" | "no_rating";

/**
 * The body of a review, out of the three fields WB keeps apart.
 *
 * Empty when the buyer rated without writing anything: 44 of the 123 mirrored
 * feedbacks are exactly that (measured 2026-09-16). `product_review.body` is
 * NOT NULL and the storefront renders it, so a bodiless row would be an empty
 * card under the product.
 */
export const reviewBody = (row: MirrorFeedbackRow): string => {
  const text = collapse(row.text);
  const pros = collapse(row.pros);
  const cons = collapse(row.cons);

  const parts: string[] = [];
  if (text) {
    parts.push(text);
  }
  if (pros) {
    parts.push(`Достоинства: ${pros}`);
  }
  if (cons) {
    parts.push(`Недостатки: ${cons}`);
  }

  return parts.join("\n\n");
};

/**
 * The star rating, or `null` when the mirror has none.
 *
 * `null` is NOT turned into a star. `Number(null)` is 0 and `Number.isFinite(0)`
 * is true, so a naive clamp files a review with no rating as ONE star — the
 * worst value of the scale, invented by the code and then counted into the
 * product's average forever (rule 20a: a value substituted for an absence is
 * worse than an absence found; caught by this module's own unit test before the
 * first run). A value OUTSIDE 1..5 is a different case and is clamped: WB's own
 * scale is 1..5 and a stray 9 would fail the review module's validation deep
 * inside a batch and take the whole import with it.
 */
export const reviewRating = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const rating = Number(value);
  if (!Number.isFinite(rating)) {
    return null;
  }
  return Math.min(5, Math.max(1, Math.round(rating)));
};

/**
 * Why this feedback is not imported, or `null` when it is.
 *
 * Exported so the run can report the two reasons apart: «rated without writing»
 * is the normal WB shape, «no rating at all» would be a mirror the import
 * should not have trusted.
 */
export const reviewSkipReason = (row: MirrorFeedbackRow): ReviewSkipReason | null => {
  if (!reviewBody(row)) {
    return "no_text";
  }
  if (reviewRating(row.product_valuation) === null) {
    return "no_rating";
  }
  return null;
};

/**
 * One review of the shop, out of one mirrored WB feedback, or `null` when
 * `reviewSkipReason` names a reason it cannot be one.
 */
export const reviewFromFeedback = (row: MirrorFeedbackRow): CardReview | null => {
  if (reviewSkipReason(row)) {
    return null;
  }

  const body = reviewBody(row);
  const rating = reviewRating(row.product_valuation) as number;
  const answer = (row.raw as Record<string, unknown> | null)?.answer as
    | Record<string, unknown>
    | null
    | undefined;
  const reply = collapse(answer?.text) || null;

  const date = row.created_date ? new Date(row.created_date) : null;

  return {
    source_key: String(row.feedback_id),
    author_name: collapse(row.user_name) || ANONYMOUS_AUTHOR,
    rating,
    body,
    review_date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    reply,
  };
};
