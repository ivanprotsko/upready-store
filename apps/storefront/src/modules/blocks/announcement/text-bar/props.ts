import { locales } from "@i18n/config"

import type { PropsResult } from "../../types"

/** The shop's words per language, `{ "ru": "…", "en": "…" }`; any language code of `i18n/config.ts`. */
export type LocalizedText = Record<string, string>

export type TextBarProps = {
  text: LocalizedText
  /** A path inside the shop (`/store`, the locale is added) or an `https://` address. */
  href?: string | null
}

const LOCALE_CODES = new Set<string>(locales)

/** The visitor's language, else English, else the first one given; null when there is none. */
export function pickText(text: LocalizedText, locale: string): string | null {
  const line = text[locale] || text.en || Object.values(text).find(Boolean)
  return line?.trim() ? line.trim() : null
}

export function parseTextBarProps(input: unknown): PropsResult<TextBarProps> {
  const errors: string[] = []
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["props must be an object { text, href? }"] }
  }
  const { text, href, ...rest } = input as Record<string, unknown>

  if (typeof text !== "object" || text === null || Array.isArray(text)) {
    errors.push("text must be an object of language code to string")
  } else {
    for (const [code, value] of Object.entries(text)) {
      if (!LOCALE_CODES.has(code)) errors.push(`text.${code}: not a language of i18n/config.ts`)
      if (typeof value !== "string") errors.push(`text.${code} must be a string`)
      else if (value.length > 140) errors.push(`text.${code} is ${value.length} characters, at most 140`)
    }
  }
  if (href !== undefined && href !== null) {
    if (typeof href !== "string" || !(href.startsWith("/") || href.startsWith("https://"))) {
      errors.push("href must start with / or https://")
    }
  }
  for (const key of Object.keys(rest)) errors.push(`${key}: not a prop of announcement/text-bar`)

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { text: text as LocalizedText, href: (href as string | null | undefined) ?? null } }
}
