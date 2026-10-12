import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import { pickText, type TextBarProps } from "./props"

/**
 * `announcement/text-bar` (t-2026-10-12-33): one line of the shop's own news across the
 * page, optionally a link. The first block written to `docs/templates/BLOCK-CONTRACT.md`,
 * kept trivial on purpose: it proves the path from a template's `props` to the page.
 *
 * Colours are the theme's own `--primary` pair, its height follows the template's density
 * layer (`--layer-density`, 1 when no template sets it). With no text in the visitor's
 * language, nor in English, nor in any other, it draws nothing: an empty bar is not news.
 */
export default async function TextBar({ text, href }: TextBarProps) {
  const locale = await getLocale()
  const line = pickText(text, locale)

  if (!line) {
    return null
  }

  const className =
    "underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-foreground)]"

  return (
    <div
      data-block="announcement/text-bar"
      className="flex min-h-11 w-full items-center justify-center bg-[var(--primary)] px-4 py-[calc(0.5rem*var(--layer-density,1))] text-sm text-[var(--primary-foreground)]"
    >
      <p className="max-w-3xl text-balance">
        {href ? (
          href.startsWith("/") ? (
            <Link href={href} className={className}>
              {line}
            </Link>
          ) : (
            <a href={href} className={className}>
              {line}
            </a>
          )
        ) : (
          line
        )}
      </p>
    </div>
  )
}
