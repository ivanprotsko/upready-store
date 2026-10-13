import { locales } from "@i18n/config"

/**
 * The shop's words per language, `{ "ru": "…", "en": "…" }`, keyed by the codes of
 * `i18n/config.ts` (BLOCK-CONTRACT.md §2). Every visible string of a `lab` block arrives this
 * way, its own chrome included, with Russian and English defaults in the block's `props.ts`.
 */
export type LocalizedText = Record<string, string>

export const LOCALE_CODES: ReadonlySet<string> = new Set<string>(locales)

/** The visitor's language, else English, else the first one given; null when there is none. */
export function pickText(text: LocalizedText | null | undefined, locale: string): string | null {
  if (!text) return null
  const line = text[locale] || text.en || Object.values(text).find(Boolean)
  return line?.trim() ? line.trim() : null
}
