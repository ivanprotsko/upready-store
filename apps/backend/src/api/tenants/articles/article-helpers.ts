import { MedusaError } from "@medusajs/framework/utils";
import { isValidArticleSlug } from "../../../modules/tenant/models/tenant-article";
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
  published: boolean;
  published_at: string | null;
  tags: string[];
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
  published: boolean;
  published_at: Date | string | null;
  tags: unknown;
  seo_title: string | null;
  seo_description: string | null;
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

export const toArticleDto = (row: ArticleRow): TenantArticleDto => ({
  id: row.id,
  slug: row.slug,
  locale: row.locale,
  title: row.title,
  excerpt: row.excerpt ?? null,
  cover_url: row.cover_url ?? null,
  body: row.body ?? "",
  published: row.published,
  published_at: isoOrNull(row.published_at),
  tags: normaliseTags(row.tags),
  seo_title: row.seo_title ?? null,
  seo_description: row.seo_description ?? null,
});

export const toArticleSummary = (row: ArticleRow): TenantArticleSummary => {
  const dto = toArticleDto(row);
  return {
    slug: dto.slug,
    locale: dto.locale,
    title: dto.title,
    excerpt: dto.excerpt,
    cover_url: dto.cover_url,
    published: dto.published,
    published_at: dto.published_at,
    tags: dto.tags,
  };
};

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
