import { MedusaError } from "@medusajs/framework/utils";
import { DESK_KINDS, type DeskItem, type DeskKind } from "./desk";

/**
 * The reviews and questions of ONE marketplace in one list
 * («Wildberries → Отзывы», mp-section-design task-05; the contract is
 * `MpReviewsResponse` in the panel's `hooks/api/marketplace-section.tsx`).
 *
 * What changed against the w18 desk: one table instead of two tabs, a row
 * carries its `kind`, the filters are the shop's filter row (Тип, Ответ,
 * Оценка, Дата) and the period chips became a date range.
 *
 * READ-ONLY, BY CONSTRUCTION. Everything here is a function of rows already
 * in `mp_review` / `mp_question`; there is no adapter, no endpoint id and no
 * request in this file, and `reviews-desk-read-only.unit.spec.ts` fails the
 * moment one appears (Ivan, 2026-09-16 02:46 WITA).
 *
 * THE PURE HALF IS HERE ON PURPOSE. Reading the query, filtering, sorting and
 * the counts are tested without a stand, and the route stays thin.
 */

export const REVIEW_SORT_FIELDS = ["created_at", "rating"] as const;
export type ReviewSortField = (typeof REVIEW_SORT_FIELDS)[number];
export type ReviewSort = { field: ReviewSortField; desc: boolean };

/** Newest first, as «Отзывы» of the shop opens. */
export const DEFAULT_REVIEW_SORT: ReviewSort = { field: "created_at", desc: true };

/** The bounds of the date filter, as the panel's date filter writes them. */
export type ReviewDateRange = { $gte?: Date; $gt?: Date; $lte?: Date; $lt?: Date };

export type MpReviewsQuery = {
  /** Lower-cased, trimmed; `null` when there is nothing to search for. */
  q: string | null;
  /** The kinds the owner picked; empty means both. */
  kinds: DeskKind[];
  /** 1..5; empty means any. */
  ratings: number[];
  /** `null` means «answered or not». */
  answered: boolean | null;
  created_at: ReviewDateRange | null;
  sort: ReviewSort;
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

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

const DATE_OPERATORS = ["$gte", "$gt", "$lte", "$lt"] as const;

/**
 * `created_at` arrives the way the panel's date filter writes it, a JSON
 * object `{"$gte":"…","$lte":"…"}` in one parameter; a client that sends
 * `created_at[$gte]=…` gets the object already parsed. Anything else is a 400
 * rather than an ignored filter: a list the owner believes is narrowed to
 * «последние 7 дней» while it is not would be a wrong answer with no sign on it.
 */
const resolveDateRange = (value: unknown): ReviewDateRange | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      throw invalid(`created_at: ожидается JSON вида {"$gte":"…"}, пришло ${value.slice(0, 80)}`);
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalid("created_at: ожидается объект с $gte, $gt, $lte или $lt");
  }
  const range: ReviewDateRange = {};
  for (const [key, bound] of Object.entries(raw as Record<string, unknown>)) {
    if (!(DATE_OPERATORS as readonly string[]).includes(key)) {
      throw invalid(`created_at: неизвестный оператор ${key}`);
    }
    const at = parseDate(bound);
    if (!at) {
      throw invalid(`created_at.${key}: не дата`);
    }
    range[key as (typeof DATE_OPERATORS)[number]] = at;
  }
  return Object.keys(range).length ? range : null;
};

const resolveSort = (value: unknown): ReviewSort => {
  const raw = typeof value === "string" ? value.trim() : "";
  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;
  if (!(REVIEW_SORT_FIELDS as readonly string[]).includes(field)) {
    return DEFAULT_REVIEW_SORT;
  }
  return { field: field as ReviewSortField, desc };
};

/**
 * The query string of the list, read once.
 *
 * An unknown kind, a rating outside 1..5 or an unknown sort field is DROPPED
 * rather than made to match nothing: a link with a stale value in it shows the
 * list instead of an empty table the owner cannot explain. `answered=yes,no`
 * is the same as no filter. The tenant is NOT in here: it comes from the token
 * (`getTenantScope`), never from the query.
 */
export const resolveMpReviewsQuery = (query: Record<string, unknown>): MpReviewsQuery => {
  const kinds = asList(query.kind).filter((one): one is DeskKind =>
    (DESK_KINDS as readonly string[]).includes(one),
  );
  const ratings = asList(query.rating)
    .map((one) => Number(one))
    .filter((one) => Number.isInteger(one) && one >= 1 && one <= 5);
  const answeredValues = new Set(asList(query.answered).filter((one) => one === "yes" || one === "no"));
  const answered = answeredValues.size === 1 ? answeredValues.has("yes") : null;
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim().toLowerCase() : null;

  return {
    q,
    kinds: [...new Set(kinds)],
    ratings: [...new Set(ratings)].sort(),
    answered,
    created_at: resolveDateRange(query.created_at),
    sort: resolveSort(query.order),
  };
};

const inRange = (createdAt: string | null, range: ReviewDateRange): boolean => {
  /**
   * A row the marketplace never dated is outside EVERY date range: "we do not
   * know when" is not "inside the last 7 days" (rule 20a). Without a date
   * filter it is in the list, last when sorted by date.
   */
  if (!createdAt) {
    return false;
  }
  const at = new Date(createdAt).getTime();
  if (Number.isNaN(at)) {
    return false;
  }
  if (range.$gte && at < range.$gte.getTime()) return false;
  if (range.$gt && at <= range.$gt.getTime()) return false;
  if (range.$lte && at > range.$lte.getTime()) return false;
  if (range.$lt && at >= range.$lt.getTime()) return false;
  return true;
};

const contains = (value: string | null | undefined, q: string): boolean =>
  Boolean(value) && String(value).toLowerCase().includes(q);

/**
 * One row against the query.
 *
 * THE RATING FILTER DOES NOT APPLY TO QUESTIONS. A question carries no rating,
 * so «Оценка = 1–2» means «the bad reviews» and keeps no question, unless the
 * owner ALSO picked «Тип = Вопросы»: then she asked for the questions in so
 * many words, and a rating, which a question cannot have, does not take them
 * away. Emptying a list with a control that cannot apply to it is the failure
 * the w18 desk recorded and this keeps out.
 *
 * `q` looks where the row's own words are: the text (with a review's pros and
 * cons, which WB keeps apart from it), the buyer's name, and the product as
 * the list names it: the card's title on the marketplace and the shop's own
 * product title when the card is linked.
 */
export const matchesMpReviewsQuery = (item: DeskItem, query: MpReviewsQuery): boolean => {
  if (query.kinds.length && !query.kinds.includes(item.kind)) {
    return false;
  }
  if (query.ratings.length) {
    if (item.kind === "reviews") {
      if (item.rating === null || !query.ratings.includes(item.rating)) {
        return false;
      }
    } else if (!query.kinds.includes("questions")) {
      return false;
    }
  }
  if (query.answered !== null && item.is_answered !== query.answered) {
    return false;
  }
  if (query.created_at && !inRange(item.created_at, query.created_at)) {
    return false;
  }
  if (query.q) {
    const q = query.q;
    const found =
      contains(item.text, q) ||
      contains(item.pros, q) ||
      contains(item.cons, q) ||
      contains(item.author, q) ||
      contains(item.product.mp_title, q) ||
      contains(item.product.product_title, q);
    if (!found) {
      return false;
    }
  }
  return true;
};

const timeOf = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
};

/** `a` against `b` with a missing value LAST in both directions. */
const compareNullable = (a: number | null, b: number | null, desc: boolean): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return desc ? b - a : a - b;
};

/**
 * The comparator of the list.
 *
 * A row WITHOUT the value goes LAST in both directions: a question has no
 * rating, and putting the questions on top of «сначала худшие» would push the
 * first real one-star review off the first page. Equal ratings go newest
 * first, then by id, so a page boundary never shows one row twice or skips one.
 */
export const compareMpReviews =
  (sort: ReviewSort) =>
  (left: DeskItem, right: DeskItem): number => {
    if (sort.field === "rating") {
      const byRating = compareNullable(left.rating, right.rating, sort.desc);
      if (byRating !== 0) {
        return byRating;
      }
      const byDate = compareNullable(timeOf(left.created_at), timeOf(right.created_at), true);
      if (byDate !== 0) {
        return byDate;
      }
    } else {
      const byDate = compareNullable(timeOf(left.created_at), timeOf(right.created_at), sort.desc);
      if (byDate !== 0) {
        return byDate;
      }
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  };

export type KindCounts = { total: number; unanswered: number };

export type MpReviewsCounts = Record<DeskKind, KindCounts>;

/**
 * Counted over EVERY row of the marketplace, before the filters: the subtitle
 * says how many reviews the shop has and how many wait for an answer, and a
 * number that shrank with the filter would be a different statement under
 * the same words. `unanswered` is the marketplace's own flag, never «no draft».
 */
export const countMpReviews = (all: DeskItem[]): MpReviewsCounts => {
  const counts: MpReviewsCounts = {
    reviews: { total: 0, unanswered: 0 },
    questions: { total: 0, unanswered: 0 },
  };
  for (const item of all) {
    counts[item.kind].total += 1;
    if (!item.is_answered) {
      counts[item.kind].unanswered += 1;
    }
  }
  return counts;
};

export type MpReviewsSelection = {
  /** The rows the query asks for, sorted, before paging. */
  rows: DeskItem[];
  /** Over every row of the marketplace, before the filters. */
  counts: MpReviewsCounts;
};

/** Reviews and questions in one list, filtered and sorted: the one call the route makes. */
export const selectMpReviews = (all: DeskItem[], query: MpReviewsQuery): MpReviewsSelection => ({
  rows: all.filter((item) => matchesMpReviewsQuery(item, query)).sort(compareMpReviews(query.sort)),
  counts: countMpReviews(all),
});
