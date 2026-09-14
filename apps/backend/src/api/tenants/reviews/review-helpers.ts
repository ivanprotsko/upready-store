import { MedusaError } from "@medusajs/framework/utils";
import {
  MAX_RATING,
  MIN_RATING,
  type ReviewSource,
  type ReviewStatus,
} from "../../../modules/product-review/models/product-review";

/**
 * Shared shape and arithmetic for product reviews (t09-reviews). Both the
 * tenant side (`/tenants/reviews/**`) and the storefront side
 * (`/store/tenant/reviews`) answer rows of this shape; the storefront one
 * simply never carries a `pending` or `hidden` row.
 */
export type ReviewRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  language: string;
  status: ReviewStatus;
  source: ReviewSource;
  customer_id: string | null;
  order_id: string | null;
  reply: string | null;
  replied_at: Date | string | null;
  review_date: Date | string | null;
  source_key: string | null;
  created_at: Date | string;
};

export type ReviewDto = {
  id: string;
  product_id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  language: string;
  status: ReviewStatus;
  source: ReviewSource;
  reply: string | null;
  replied_at: string | null;
  /** When the review was written: the old shop's date for an imported one. */
  written_at: string;
  created_at: string;
};

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const toReviewDto = (row: ReviewRow): ReviewDto => ({
  id: row.id,
  product_id: row.product_id,
  author_name: row.author_name,
  rating: row.rating,
  title: row.title,
  body: row.body,
  language: row.language,
  status: row.status,
  source: row.source,
  reply: row.reply,
  replied_at: iso(row.replied_at),
  written_at: iso(row.review_date) ?? iso(row.created_at)!,
  created_at: iso(row.created_at)!,
});

/**
 * The key a review is counted by. An imported review translated into two
 * languages is two rows with one `source_key`; a review left on the storefront
 * exists once and is its own key. Grouping by this is what keeps a translated
 * review from being counted twice in the average.
 */
export const reviewGroupKey = (row: { id: string; source_key: string | null }): string =>
  row.source_key ?? row.id;

const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** A language tag off a public request, or null for «no preference». */
export const requestedReviewLocale = (req: {
  locale?: string;
  headers: Record<string, unknown>;
}): string | null => {
  const raw = req.locale ?? req.headers["x-medusa-locale"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return LANGUAGE_TAG.test(trimmed) ? trimmed : null;
};

/**
 * One row per review for a visitor: their language first, then its language
 * part (`pt-BR` → `pt`), then whatever language the review exists in, taken in
 * a stable order so two visitors of the same locale see the same text. There is
 * no fallback to `en` in the middle of that chain the way content pages have
 * one: a shop whose own language is Russian has reviews written in Russian, and
 * an English row exists only where somebody translated one.
 */
export const pickReviewsForLocale = <T extends ReviewRow>(
  rows: T[],
  requested: string | null,
): T[] => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = reviewGroupKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const candidates = [requested, requested?.split("-")[0]].filter(
    (value): value is string => Boolean(value),
  );

  const picked: T[] = [];
  for (const group of groups.values()) {
    let hit: T | undefined;
    for (const language of candidates) {
      hit = group.find((row) => row.language === language);
      if (hit) break;
    }
    picked.push(hit ?? [...group].sort((a, b) => a.language.localeCompare(b.language))[0]);
  }

  return picked;
};

/**
 * Newest first, by the date the review was WRITTEN (an imported review keeps
 * the old shop's date), and by id where two share a date so the order does not
 * wander between two requests for the same page.
 */
export const sortReviewsNewestFirst = <T extends ReviewRow>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const dateA = new Date(a.review_date ?? a.created_at).getTime();
    const dateB = new Date(b.review_date ?? b.created_at).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return a.id.localeCompare(b.id);
  });

export type ReviewSummary = {
  count: number;
  /** Mean rating rounded to one decimal, or null when there is nothing to average. */
  average: number | null;
};

/**
 * The count and the average of a set of reviews, one row per review (call
 * `pickReviewsForLocale` first). A product with no reviews gets
 * `{ count: 0, average: null }` — never `0` and never `5`, because an average
 * of nothing is not a number a shopper may be shown (rule 20a: a value
 * substituted for an absence is worse than the absence).
 */
export const summarizeReviews = (rows: { rating: number }[]): ReviewSummary => {
  if (!rows.length) {
    return { count: 0, average: null };
  }
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  return { count: rows.length, average: Math.round((total / rows.length) * 10) / 10 };
};

/** `?product_id=` and friends: one id, a list of them, or nothing at all. */
export const parseIdFilter = (raw: unknown): string[] | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  const values = (Array.isArray(raw) ? raw : [raw]).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return values.length ? values : [];
};

export const assertRating = (rating: number): number => {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: 'rating' must be a whole number between ${MIN_RATING} and ${MAX_RATING}`,
    );
  }
  return rating;
};
