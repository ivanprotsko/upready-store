import * as zod from "zod"

import type { TenantArticle } from "../../../hooks/api/articles"
import { fromDateTimeInput, toDateTimeInput } from "../article-locales.ts"

/**
 * The article form shared by «Новая статья» and the edit screen (b18-blog-full,
 * rule 20 — one implementation): the schema, the values of an article, the
 * body of the save, and which tab holds which field.
 *
 * t-2026-10-14-01 (panel redesign, G4, prototype states `journal-edit` and
 * `journal-edit-publish`): the fields that stood in one column are three tabs,
 * «Текст», «Карточка и публикация», «Для поиска». A save that fails on a field
 * of another tab opens that tab (`TAB_OF_FIELD`). The messages are catalogue
 * keys, passed in as `t`.
 */

/** Lowercase latin letters, digits and single hyphens — the backend's own rule. */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The panel's own child route under `/journal`; see `app.tsx`. */
export const RESERVED_SLUG = "new"

export const ARTICLE_TABS = ["text", "card", "search"] as const
export type ArticleTab = (typeof ARTICLE_TABS)[number]

export const TAB_OF_FIELD: Record<string, ArticleTab> = {
  title: "text",
  body: "text",
  status: "card",
  published_at: "card",
  excerpt: "card",
  cover_url: "card",
  category: "card",
  author: "card",
  tags: "card",
  slug: "search",
  seo_title: "search",
  seo_description: "search",
}

export const articleSchema = (t: (key: string) => string) =>
  zod
    .object({
      title: zod.string().max(300),
      slug: zod
        .string()
        .min(2, t("journal.validation.slugMin"))
        .max(96)
        .regex(ARTICLE_SLUG_PATTERN, t("journal.validation.slugPattern")),
      excerpt: zod.string().max(1_000),
      cover_url: zod.string().max(2_000),
      body: zod.string().max(200_000),
      category: zod.string().max(120),
      author: zod.string().max(160),
      tags: zod.string().max(1_000),
      status: zod.enum(["draft", "published", "scheduled"]),
      published_at: zod.string(),
      seo_title: zod.string().max(300),
      seo_description: zod.string().max(1_000),
    })
    .refine((values) => values.slug !== RESERVED_SLUG, {
      // `/journal/new` is the create screen's own address; an article living
      // there would be unreachable in the panel forever.
      message: t("journal.validation.slugReserved"),
      path: ["slug"],
    })
    .refine((values) => values.status === "draft" || values.title.trim().length > 0, {
      // The backend answers `invalid_data` for the same case; saying it here
      // means the owner reads it next to the field instead of in a toast.
      message: t("journal.validation.publishedTitle"),
      path: ["title"],
    })
    .refine((values) => values.status !== "scheduled" || values.published_at.trim().length > 0, {
      message: t("journal.validation.scheduledDate"),
      path: ["published_at"],
    })

export type ArticleFormValues = zod.infer<ReturnType<typeof articleSchema>>

export const EMPTY_ARTICLE: ArticleFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  cover_url: "",
  body: "",
  category: "",
  author: "",
  tags: "",
  status: "draft",
  published_at: "",
  seo_title: "",
  seo_description: "",
}

export const articleValues = (article: TenantArticle): ArticleFormValues => ({
  title: article.title,
  slug: article.slug,
  excerpt: article.excerpt ?? "",
  cover_url: article.cover_url ?? "",
  body: article.body,
  category: article.category ?? "",
  author: article.author ?? "",
  tags: article.tags.join(", "),
  status: article.status,
  published_at: toDateTimeInput(article.published_at),
  seo_title: article.seo_title ?? "",
  seo_description: article.seo_description ?? "",
})

/** What both saves send besides the address and the language. */
export const articleBody = (values: ArticleFormValues) => ({
  body: values.body,
  status: values.status,
  excerpt: values.excerpt.trim() || null,
  cover_url: values.cover_url.trim() || null,
  // An empty field means "not stamped yet", not "clear the date": the route
  // stamps it on first publish only when the key is OMITTED, and reads an
  // explicit `null` as "erase the date" (t10-blog, accept round 1) — a blank
  // input owner never asked to erase anything.
  published_at: fromDateTimeInput(values.published_at) ?? undefined,
  category: values.category.trim() || null,
  author: values.author.trim() || null,
  tags: values.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  seo_title: values.seo_title.trim() || null,
  seo_description: values.seo_description.trim() || null,
})
