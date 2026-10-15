import type { ArticleStatus, TenantArticle } from "../../hooks/api/articles"

// t10-blog: the languages the journal screen offers.
//
// The backend accepts ANY BCP-47 tag — an article is a row per locale and the
// storefront serves 36 languages — but a shop owner picks from a short list,
// and this shop writes in two (`research/chrxnasdmds-digest.md`: 9 ru + 9 en).
// The list is what the panel SHOWS; it never narrows what the API accepts, so
// an article imported in a language missing here still renders and still
// edits.
//
// t-2026-10-14-01 (panel redesign, G4): free of words. A language is named in
// itself («Русский», «English») by `Intl.DisplayNames`, the statuses' words
// are catalogue keys `journal.status.*`, and dates go through `getFullDate`.

export const DEFAULT_ARTICLE_LOCALE = "en"

export const ARTICLE_LOCALES = ["ru", "en", "de", "es", "fr", "uk"]

/** The language in its own words, capitalised: «Русский», «English», «Українська». */
export const localeLabel = (locale: string): string => {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale)
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : locale
  } catch {
    return locale
  }
}

/** The short tag of a language in the list's «Языки» column: `RU`, `EN`. */
export const localeTag = (locale: string): string => locale.split("-")[0].toUpperCase()

/**
 * The three publication states. `scheduled` is offered last because it is the
 * rarest and it is the only one that needs a second field (the date) to mean
 * anything.
 */
export const ARTICLE_STATUSES: ArticleStatus[] = ["draft", "published", "scheduled"]

export const STATUS_COLOR: Record<ArticleStatus, "green" | "orange" | "blue"> = {
  draft: "orange",
  published: "green",
  scheduled: "blue",
}

/**
 * The state an owner reads in the row. A scheduled article whose time has
 * already passed IS on the site — the backend says so in `published`, computed
 * there rather than recomputed here — so it reads «Опубликована», not a
 * promise of a future (rule 20a: a stale label is a substituted value).
 */
export const shownStatus = (
  article: Pick<TenantArticle, "status" | "published">
): ArticleStatus => (article.status === "scheduled" && article.published ? "published" : article.status)

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
