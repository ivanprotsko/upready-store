import { MedusaError } from "@medusajs/framework/utils";
import {
  MAX_RATING,
  MIN_RATING,
  REVIEW_SOURCES,
} from "../../../modules/product-review/models/product-review";
import { parseIdFilter } from "./review-helpers";

/**
 * The narrowing `GET /tenants/reviews` takes on top of `status` and
 * `product_id` (t-2026-10-14-01, panel redesign G5): the panel's list keeps
 * «Оценка», «Источник», «Ответ», the search and the sort in its address, the
 * way the Wildberries reviews table does, and every one of them has to narrow
 * the page and the count on the server — filtered on the client, a 310-review
 * shop would count 20.
 *
 * Every parser answers `null` for «not asked» and throws `INVALID_DATA` worded
 * like the route's other refusals for a value it cannot read, never widening a
 * bad value into «everything».
 */

const invalid = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid request: ${message}`);

/** `?rating=5&rating=4`: whole stars from 1 to 5. */
export const parseRatingFilter = (raw: unknown): number[] | null => {
  const values = parseIdFilter(raw);
  if (values === null) return null;
  return values.map((value) => {
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
      throw invalid(`'rating' must be a whole number between ${MIN_RATING} and ${MAX_RATING}`);
    }
    return rating;
  });
};

/** `?source=shop`: where the review came from. */
export const parseSourceFilter = (raw: unknown): string[] | null => {
  const values = parseIdFilter(raw);
  if (values === null) return null;
  const unknown = values.find(
    (value) => !(REVIEW_SOURCES as readonly string[]).includes(value),
  );
  if (unknown) {
    throw invalid(`'source' must be one of ${REVIEW_SOURCES.join(", ")}`);
  }
  return values;
};

/**
 * `?answered=yes|no`: whether the owner has answered. Both at once is no
 * narrowing at all, the same as neither.
 */
export const parseAnsweredFilter = (raw: unknown): boolean | null => {
  const values = parseIdFilter(raw);
  if (values === null) return null;
  if (values.some((value) => value !== "yes" && value !== "no")) {
    throw invalid("'answered' must be yes or no");
  }
  const wanted = new Set(values);
  if (wanted.size !== 1) return null;
  return wanted.has("yes");
};

const MAX_SEARCH = 200;

/**
 * `?q=` — the words the owner typed, trimmed. `%`, `_` and `\` are escaped so
 * they match themselves under ILIKE instead of acting as wildcards.
 */
export const parseSearch = (raw: unknown): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_SEARCH) {
    throw invalid(`'q' must be at most ${MAX_SEARCH} characters`);
  }
  return trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
};

/**
 * The columns the list may be sorted by, under the names the panel uses: the
 * DTO calls the date `written_at`, the table stores it as `review_date`.
 */
const ORDER_FIELDS: Record<string, string> = {
  written_at: "review_date",
  rating: "rating",
};

export type ReviewOrder = Record<string, "ASC" | "DESC">;

/**
 * `?order=rating` / `?order=-written_at`, the `_DataTable` convention: a
 * leading `-` is descending. The id always breaks ties so a page does not
 * wander between two requests. No order is today's: newest written first.
 */
export const parseReviewOrder = (raw: unknown): ReviewOrder => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null || value === "") {
    return { review_date: "DESC", id: "DESC" };
  }
  if (typeof value !== "string") {
    throw invalid(`'order' must be one of ${Object.keys(ORDER_FIELDS).join(", ")}`);
  }
  const descending = value.startsWith("-");
  const column = ORDER_FIELDS[descending ? value.slice(1) : value];
  if (!column) {
    throw invalid(`'order' must be one of ${Object.keys(ORDER_FIELDS).join(", ")}`);
  }
  const direction = descending ? "DESC" : "ASC";
  return { [column]: direction, id: direction };
};

/**
 * The filter object the narrowing above adds to the module's list call. Kept
 * apart from the route so its shape is asserted without a database.
 */
export const reviewListWhere = (filters: {
  ratings: number[] | null;
  sources: string[] | null;
  answered: boolean | null;
  search: string | null;
}): Record<string, unknown> => ({
  ...(filters.ratings ? { rating: filters.ratings } : {}),
  ...(filters.sources ? { source: filters.sources } : {}),
  ...(filters.answered === null
    ? {}
    : filters.answered
      ? { reply: { $ne: null } }
      : { reply: null }),
  ...(filters.search
    ? {
        $or: [
          { body: { $ilike: `%${filters.search}%` } },
          { title: { $ilike: `%${filters.search}%` } },
          { author_name: { $ilike: `%${filters.search}%` } },
        ],
      }
    : {}),
});
