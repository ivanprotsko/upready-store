import { MedusaError } from "@medusajs/framework/utils";
import {
  ARTICLE_STATUSES,
  type ArticleStatus,
  isArticleStatus,
  isValidArticleSlug,
} from "../../../modules/tenant/models/tenant-article";
// Locale parsing is not page-specific: the panel's strict `?locale=` and the
// visitor's own locale are resolved exactly the same way for a journal article
// as for a content page, so t10-blog reads those two helpers rather than
// copying them (rule 20 — one implementation, two call sites).
import {
  DEFAULT_PAGE_LOCALE,
  parsePageLocale,
  pickPageForLocale,
  requestedPageLocale,
} from "../pages/page-helpers";

/**
 * Shared shape and guards for the tenant journal (t10-blog). One row per
 * article per locale; `slug` names the article, `(slug, locale)` its text in
 * one language.
 */
export type TenantArticleDto = {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  body: string;
  status: ArticleStatus;
  /**
   * Whether the row is public AT THE MOMENT OF THE ANSWER — computed, never
   * stored (b18-blog-full). `status` is the owner's intent; this is what a
   * visitor would see, and a `scheduled` article flips it by itself when its
   * `published_at` passes, with no job having to have run.
   */
  published: boolean;
  published_at: string | null;
  category: string | null;
  author: string | null;
  tags: string[];
  /** Whole minutes, floor 1. Computed from the body so every screen agrees. */
  reading_minutes: number;
  seo_title: string | null;
  seo_description: string | null;
};

/** What the storefront feed needs: no body, so a 20-article page stays small. */
export type TenantArticleSummary = Omit<TenantArticleDto, "id" | "body" | "seo_title" | "seo_description">;

export const DEFAULT_ARTICLE_LOCALE = DEFAULT_PAGE_LOCALE;

export const parseArticleLocale = parsePageLocale;
export const requestedArticleLocale = requestedPageLocale;
export const pickArticleForLocale = pickPageForLocale;

/** Path segment guard. A malformed slug is a 404, never a 400: it names nothing. */
export const assertArticleSlug = (raw: string): string => {
  if (!isValidArticleSlug(raw)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Article with slug "${raw}" was not found`);
  }

  return raw;
};

type ArticleRow = {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  body: string;
  status: string;
  published_at: Date | string | null;
  category?: string | null;
  author?: string | null;
  tags: unknown;
  seo_title: string | null;
  seo_description: string | null;
};

/**
 * THE definition of «is this article public». Every read path — the owner's
 * list, the storefront feed, one article, the sitemap — asks this and nothing
 * else, so a scheduled article becomes visible at its own minute rather than
 * at the next run of some job (b18-blog-full; rule 20 — one implementation).
 */
export const isArticleVisible = (
  row: { status: string; published_at: Date | string | null },
  now: Date = new Date(),
): boolean => {
  if (row.status === "published") return true;
  if (row.status !== "scheduled") return false;
  if (!row.published_at) return false;
  const at = row.published_at instanceof Date ? row.published_at : new Date(row.published_at);
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
};

/** A row written before b18 has no status column value we can trust blindly. */
export const normaliseStatus = (raw: unknown): ArticleStatus =>
  isArticleStatus(raw) ? raw : "draft";

/** A rubric is one trimmed line or nothing. Never an empty string in the DB. */
export const normaliseCategory = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length ? value.slice(0, 120) : null;
};

/**
 * Reading time in whole minutes at 180 words per minute — the figure the
 * storefront shows under the title. Markdown syntax is stripped first, so a
 * table of links does not read as a novel; an empty body is still 1 minute,
 * because «0 мин чтения» is not a thing a reader understands.
 */
export const readingMinutes = (body: string): number => {
  const plain = (body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ");
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
};

/**
 * `tags` is a json column, so what comes back is whatever was written: an
 * array, `null`, or — for a row written by an older caller — something else
 * entirely. The DTO always answers an array of strings, so no consumer has to
 * re-check the shape (rule 20a — a substituted value must not impersonate a
 * real one, and `[]` here means «no tags», which is what every non-array
 * value in this column actually means).
 */
export const normaliseTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
};

/** ISO-8601, or null. Never «now» as a stand-in for an unset date (rule 20a). */
const isoOrNull = (value: Date | string | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const toArticleDto = (row: ArticleRow, now: Date = new Date()): TenantArticleDto => {
  const status = normaliseStatus(row.status);
  return {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    excerpt: row.excerpt ?? null,
    cover_url: row.cover_url ?? null,
    body: row.body ?? "",
    status,
    published: isArticleVisible({ status, published_at: row.published_at }, now),
    published_at: isoOrNull(row.published_at),
    category: normaliseCategory(row.category),
    author: typeof row.author === "string" && row.author.trim() ? row.author.trim() : null,
    tags: normaliseTags(row.tags),
    reading_minutes: readingMinutes(row.body ?? ""),
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
  };
};

export const toArticleSummary = (row: ArticleRow, now: Date = new Date()): TenantArticleSummary => {
  const dto = toArticleDto(row, now);
  return {
    slug: dto.slug,
    locale: dto.locale,
    title: dto.title,
    excerpt: dto.excerpt,
    cover_url: dto.cover_url,
    status: dto.status,
    published: dto.published,
    published_at: dto.published_at,
    category: dto.category,
    author: dto.author,
    tags: dto.tags,
    reading_minutes: dto.reading_minutes,
  };
};

export { ARTICLE_STATUSES };
export type { ArticleStatus };

/**
 * Newest first, and an article with no date sorts after every dated one rather
 * than at the top: `null` is «not dated», not «epoch» and not «today»
 * (rule 20a). Ties break on the slug so the order is stable across requests.
 */
export const byPublishedDesc = <T extends { published_at: string | null; slug: string }>(
  a: T,
  b: T,
): number => {
  const timeA = a.published_at ? Date.parse(a.published_at) : Number.NEGATIVE_INFINITY;
  const timeB = b.published_at ? Date.parse(b.published_at) : Number.NEGATIVE_INFINITY;
  if (timeA !== timeB) return timeB - timeA;
  return a.slug.localeCompare(b.slug);
};

/**
 * Groups locale rows by slug, keeps one row per slug for the visitor
 * (`pickArticleForLocale`) and returns them newest first. The storefront feed
 * shows one card per article, never the same article twice in two languages.
 */
export const oneRowPerSlug = <T extends { slug: string; locale: string }>(
  rows: T[],
  requested: string | null,
): T[] => {
  const bySlug = new Map<string, T[]>();
  for (const row of rows) {
    const group = bySlug.get(row.slug) ?? [];
    group.push(row);
    bySlug.set(row.slug, group);
  }

  return [...bySlug.values()]
    .map((group) => pickArticleForLocale(group, requested))
    .filter((row): row is T => row !== null);
};

/**
 * Turns what a caller SENT into the two columns that store publication state,
 * for both `POST` and `PUT` (rule 20 — one implementation, two call sites).
 *
 * The rules, and why:
 *
 * - an explicit `status` wins; the boolean `published` is the deprecated alias
 *   an older panel bundle still sends, and `undefined` on a PUT means «leave
 *   the state alone», which is what a save of a typo fix means;
 * - `published_at` sent explicitly is taken as sent, `null` included — that is
 *   «erase the date», a different intent from omitting the key;
 * - a first publish with no date sent is stamped NOW, so an owner who just
 *   flips the switch still gets a dated article; every later save keeps the
 *   article's own date rather than the date of the last typo fix;
 * - `scheduled` without a date is INVALID_DATA: a schedule with no instant is
 *   not a schedule, and silently treating it as a draft would hide the article
 *   from its author with no message (rule 20a).
 */
export const resolveArticlePublication = (
  sent: { status?: ArticleStatus; published?: boolean; published_at?: string | null },
  existing: { status?: string; published_at?: Date | string | null } | null,
  now: Date = new Date(),
): { status: ArticleStatus; published_at: Date | null } => {
  const previousStatus = normaliseStatus(existing?.status);
  const previousAt = existing?.published_at
    ? existing.published_at instanceof Date
      ? existing.published_at
      : new Date(existing.published_at)
    : null;

  const status: ArticleStatus =
    sent.status ??
    (sent.published === undefined ? previousStatus : sent.published ? "published" : "draft");

  let publishedAt: Date | null;
  if (sent.published_at !== undefined) {
    publishedAt = sent.published_at === null ? null : new Date(sent.published_at);
  } else if (status === "published" && !previousAt) {
    publishedAt = now;
  } else {
    publishedAt = previousAt;
  }

  if (status === "scheduled" && !publishedAt) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a scheduled article needs a publication date",
    );
  }

  return { status, published_at: publishedAt };
};

/**
 * The rubrics a shop actually uses, with how many articles carry each — the
 * vocabulary is discovered from the rows rather than kept in a table of its
 * own, so an owner never manages a list before writing a first article.
 * Sorted by count, then alphabetically, so the order does not jump around.
 */
export const collectCategories = (
  rows: Array<{ category?: string | null; slug: string }>,
): Array<{ category: string; count: number }> => {
  const bySlug = new Map<string, string>();
  for (const row of rows) {
    const category = normaliseCategory(row.category);
    if (category) bySlug.set(`${row.slug}::${category}`, category);
  }

  const counts = new Map<string, number>();
  for (const category of bySlug.values()) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.category.localeCompare(b.category)));
};
