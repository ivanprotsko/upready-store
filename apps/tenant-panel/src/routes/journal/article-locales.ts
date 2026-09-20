// t10-blog: the languages the journal screen offers, in plain language.
//
// The backend accepts ANY BCP-47 tag — an article is a row per locale and the
// storefront serves 36 languages — but a shop owner picks from a short list,
// and this shop writes in two (`research/chrxnasdmds-digest.md`: 9 ru + 9 en).
// The list is what the panel SHOWS; it never narrows what the API accepts, so
// an article imported in a language missing here still renders and still
// edits.

export const DEFAULT_ARTICLE_LOCALE = "en"

export type ArticleLocaleOption = { value: string; label: string }

export const ARTICLE_LOCALES: ArticleLocaleOption[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "uk", label: "Українська" },
]

export const localeLabel = (locale: string): string =>
  ARTICLE_LOCALES.find((option) => option.value === locale)?.label ?? locale

/**
 * The publication date as an owner reads it. An article with no date shows an
 * empty string, never «today»: a substituted value would sort and read as a
 * real one (rule 20a).
 */
export const formatArticleDate = (iso: string | null): string => {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

/** `2026-06-14T00:00:00.000Z` → `2026-06-14`, for an `<input type="date">`. */
export const toDateInput = (iso: string | null): string => {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

/**
 * `2026-06-14` → an ISO instant at midnight UTC. An empty field means «no
 * date», which is `null` and not «now».
 */
export const fromDateInput = (value: string): string | null => {
  if (!value.trim()) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// ---- b18-blog-full ----

import type { ArticleStatus, TenantArticle } from "../../hooks/api/articles"

export type ArticleStatusOption = { value: ArticleStatus; label: string; hint: string }

/**
 * The three publication states in the owner's words. `scheduled` is offered
 * last because it is the rarest and it is the only one that needs a second
 * field (the date) to mean anything.
 */
export const ARTICLE_STATUSES: ArticleStatusOption[] = [
  {
    value: "draft",
    label: "Черновик",
    hint: "Видите только вы. На сайте статьи нет.",
  },
  {
    value: "published",
    label: "Опубликована",
    hint: "Открыта покупателям и попадает в карту сайта.",
  },
  {
    value: "scheduled",
    label: "По расписанию",
    hint: "Появится на сайте сама в указанные дату и время.",
  },
]

export const statusLabel = (status: ArticleStatus): string =>
  ARTICLE_STATUSES.find((option) => option.value === status)?.label ?? status

/**
 * What the row's badge says, and in what colour. A scheduled article whose
 * time has already passed IS on the site — the backend says so in `published`,
 * computed there rather than recomputed here — so the badge must not keep
 * promising a future (rule 20a: a stale label is a substituted value).
 */
export const statusBadge = (
  article: Pick<TenantArticle, "status" | "published" | "published_at">
): { label: string; color: "green" | "orange" | "blue" | "grey" } => {
  if (article.status === "draft") return { label: "Черновик", color: "grey" }
  if (article.status === "published") return { label: "Опубликована", color: "green" }
  return article.published
    ? { label: "Опубликована по расписанию", color: "green" }
    : { label: `Выйдет ${formatArticleDateTime(article.published_at)}`, color: "blue" }
}

/** Date AND time, which is what a schedule is. Empty stays empty (rule 20a). */
export const formatArticleDateTime = (iso: string | null): string => {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/**
 * `2026-06-14T09:30:00.000Z` → `2026-06-14T16:30` for an
 * `<input type="datetime-local">`, in the BROWSER's zone — the owner schedules
 * in the time she reads on her own clock, not in UTC.
 */
export const toDateTimeInput = (iso: string | null): string => {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** The same conversion back. An empty field is «no date», which is `null`. */
export const fromDateTimeInput = (value: string): string | null => {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
