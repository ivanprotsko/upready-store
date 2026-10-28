"use client"

import { clx } from "@medusajs/ui"

import type { TocItem } from "@lib/util/markdown-toc"
import { EYEBROW } from "@modules/journal/typography"

import { useActiveHeading } from "./use-active-heading"

/**
 * The table of contents beside an article (t-2026-10-05-03), after the chrxnasdmds «В этой
 * статье» rail: a small-caps label over a list on a hairline, a sub-section indented, the
 * section in view marked with the theme's link colour. The page holds it in a sticky
 * column from 720 px; a phone gets `ArticleTocFab` instead.
 *
 * Each entry is a real `#anchor` link, so it works before hydration and with no script;
 * once hydrated a click scrolls smoothly instead of jumping.
 */
export default function ArticleToc({ items, label }: { items: TocItem[]; label: string }) {
  const { active, go } = useActiveHeading(items)

  if (items.length === 0) return null

  return (
    <nav aria-label={label} className="flex flex-col gap-3 text-base leading-snug" data-testid="article-toc">
      <span className={`${EYEBROW} text-ui-fg-muted`}>{label}</span>
      <ul className="flex flex-col gap-0.5 border-s border-ui-border-base">
        {items.map((item) => {
          const current = item.id === active
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  go(item.id)
                }}
                aria-current={current ? "location" : undefined}
                className={clx(
                  "-ms-px block rounded-e-rounded border-s py-2 pe-2 transition-colors",
                  item.level === 3 ? "ps-7" : "ps-4",
                  current
                    ? "border-ui-fg-interactive bg-[color-mix(in_srgb,var(--fg-interactive)_10%,transparent)] text-ui-fg-base"
                    : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
                )}
                data-testid="article-toc-link"
              >
                {item.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
