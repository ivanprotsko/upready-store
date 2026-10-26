"use client"

import { useEffect, useState } from "react"

import { Link } from "@i18n/navigation"
import { DISPLAY_3 } from "@modules/journal/typography"

/**
 * «Читать далее» beside an article's title (t-2026-10-05-03), after the chrxnasdmds journal:
 * the next article's title in the second column of the header, on the baseline of the
 * title's last line, from 1024 px.
 *
 * The next title is held to as many lines as the article's own title takes, so the two
 * columns end together; the count is the `h1`'s height over its line height, measured again
 * when the `h1` changes size. Before hydration the title shows whole.
 */
export default function NextArticleLink({
  href,
  title,
  label,
  titleId,
}: {
  href: string
  title: string
  label: string
  /** The id of the article's own `h1`. */
  titleId: string
}) {
  const [lines, setLines] = useState<number | null>(null)

  useEffect(() => {
    const h1 = document.getElementById(titleId)
    if (!h1) return
    const measure = () => {
      const lineHeight = parseFloat(window.getComputedStyle(h1).lineHeight)
      if (!lineHeight) return
      setLines(Math.max(1, Math.round(h1.getBoundingClientRect().height / lineHeight)))
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    const observer = new ResizeObserver(measure)
    observer.observe(h1)
    return () => observer.disconnect()
  }, [titleId])

  return (
    <Link
      href={href}
      className="group hidden flex-col gap-2 rounded-rounded small:flex"
      data-testid="next-article-link"
    >
      <span className="text-xs uppercase tracking-wide text-ui-fg-muted">{label}</span>
      <span
        className={`${DISPLAY_3} text-balance text-ui-fg-subtle transition-colors group-hover:text-ui-fg-base`}
        style={
          lines
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {title}
      </span>
    </Link>
  )
}
