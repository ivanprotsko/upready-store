"use client"

import { ListBullet, XMark } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"

import type { TocItem } from "@lib/util/markdown-toc"
import { useActiveHeading } from "@modules/journal/components/article-toc/use-active-heading"
import { EYEBROW } from "@modules/journal/typography"

/**
 * The table of contents on a phone (t-2026-10-05-03), after the chrxnasdmds journal: below
 * 720 px the rail beside the text has no room, so a pill in the bottom corner opens a bottom
 * sheet with the same entries. An entry scrolls to its section and closes the sheet; so do
 * the backdrop, the cross and Escape. From 720 px the pill is hidden and the rail takes over.
 * The store's bottom bar (4rem, shown below 1024 px) is always under the pill, so the pill
 * floats 1rem above it.
 */
export default function ArticleTocFab({
  items,
  labels,
}: {
  items: TocItem[]
  labels: { toc: string; close: string }
}) {
  const [open, setOpen] = useState(false)
  const { active, go } = useActiveHeading(items)
  const pill = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (items.length === 0) return null

  const close = () => {
    setOpen(false)
    pill.current?.focus()
  }

  return (
    <div className="min-[720px]:hidden" data-testid="article-toc-fab">
      <button
        ref={pill}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed end-4 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-ui-fg-base pe-5 ps-4 text-sm font-medium text-ui-bg-base shadow-lg transition-transform active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
        data-testid="article-toc-fab-button"
      >
        <ListBullet aria-hidden />
        {labels.toc}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--fg-base)_40%,transparent)]"
            onClick={close}
            aria-hidden
            data-testid="article-toc-fab-backdrop"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={labels.toc}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-ui-border-base bg-ui-bg-base shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            data-testid="article-toc-sheet"
          >
            <div className="flex items-center justify-between border-b border-ui-border-base px-5 pb-3 pt-4">
              <span className={`${EYEBROW} text-ui-fg-muted`}>{labels.toc}</span>
              <button
                ref={closeButton}
                type="button"
                aria-label={labels.close}
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ui-fg-subtle hover:bg-ui-bg-subtle"
              >
                <XMark aria-hidden />
              </button>
            </div>
            <ul className="flex flex-col gap-0.5 overflow-y-auto overscroll-contain px-3 py-3">
              {items.map((item) => {
                const current = item.id === active
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        go(item.id)
                      }}
                      aria-current={current ? "location" : undefined}
                      className={clx(
                        "block w-full rounded-rounded border-s-2 py-2.5 pe-3 text-start text-base leading-snug transition-colors",
                        item.level === 3 ? "ps-7" : "ps-4",
                        current
                          ? "border-ui-fg-interactive bg-[color-mix(in_srgb,var(--fg-interactive)_10%,transparent)] text-ui-fg-base"
                          : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
                      )}
                      data-testid="article-toc-sheet-link"
                    >
                      {item.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}
