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
