"use client"

import { clx } from "@medusajs/ui"
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { Link } from "@i18n/navigation"

import { SECTION_TYPE } from "../../shared/section-type"
import { loadTabCards } from "./load"
import type { TabRequest } from "./props"
import { chooseTab, initialTabState, settleTab, tabAfterKey } from "./tab-state"

/** One tab as the panel gets it: the label in the visitor's language, its source's page, its request. */
export type TabView = { label: string; href: string; request: TabRequest }

/** A tab: at least 44 px high (QR-HIT), the chosen one underlined in the text colour, the others subtle. */
const TRIGGER_CLASS =
  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-base font-medium transition-colors duration-200 motion-reduce:transition-none small:text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/** The shell's «see all», as `BlockSection` draws it: the type of `SECTION_TYPE.seeAll`, a 44 px target, no corner. */
const SEE_ALL_CLASS = clx(
  "inline-flex min-h-11 shrink-0 items-center text-ui-fg-interactive underline-offset-4 hover:text-ui-fg-interactive-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive",
  SECTION_TYPE.seeAll
)

/**
 * The tabs of `collection/tabs` (WAI-ARIA tab pattern, automatic activation): a row of tabs
 * with one tab stop, arrows, Home and End to move along it, and «see all» to the chosen tab's
 * source at its end. A row too wide for the screen wraps, tabs and link alike, and never
 * scrolls, so no tab is cut at an edge. Under them one panel, labelled by the chosen tab.
 *
 * The server draws the first tab's cards (`first`). Another tab's come once, through
 * `loadTabCards`, when it is chosen or the pointer rests on it, and are kept. Until they come,
 * the panel holds the cards it showed, dimmed and `aria-busy`, so the section keeps its
 * height. A tab that loads nothing gives its place back to the tab the panel shows.
 */
export default function CollectionTabsPanel({
  tabs,
  first,
  label,
  seeAllLabel,
}: {
  tabs: TabView[]
  first: ReactNode
  /** The section's heading, the list's name for a screen reader. */
  label: string | null
  seeAllLabel: string
}) {
  const id = useId()
  const [state, setState] = useState(() => initialTabState(first))
  const loading = useRef(new Set<number>())
  const triggers = useRef<(HTMLButtonElement | null)[]>([])

  const load = (index: number) => {
    if (index in state.panels || loading.current.has(index)) return
    loading.current.add(index)
    const settle = (cards: ReactNode) => {
      loading.current.delete(index)
      setState((now) => settleTab(now, index, cards))
    }
    loadTabCards(tabs[index].request).then(settle, () => settle(null))
  }

  const select = (index: number) => {
    setState((now) => chooseTab(now, index))
    load(index)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = triggers.current.findIndex((trigger) => trigger === document.activeElement)
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const to = tabAfterKey(event.key, focused >= 0 ? focused : state.selected, tabs.length, rtl)
    if (to === null) return
    event.preventDefault()
    triggers.current[to]?.focus()
    select(to)
  }

  const busy = state.selected !== state.shown

  return (
    <div>
      <div className="mb-[var(--layer-space-6,1.5rem)] flex flex-wrap items-center justify-between gap-x-[var(--layer-space-6,1.5rem)]">
        <div
          role="tablist"
          aria-label={label ?? undefined}
          onKeyDown={onKeyDown}
          data-role="tab-list"
          className="flex flex-wrap gap-x-[var(--layer-space-6,1.5rem)]"
        >
          {tabs.map((tab, index) => {
            const chosen = index === state.selected
            return (
              <button
                key={index}
                ref={(element) => {
                  triggers.current[index] = element
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${index}`}
                aria-selected={chosen}
                aria-controls={`${id}-panel`}
                tabIndex={chosen ? 0 : -1}
                data-role="tab-trigger"
                onClick={() => select(index)}
                onPointerEnter={() => load(index)}
                className={clx(
                  TRIGGER_CLASS,
                  chosen ? "border-ui-fg-base text-ui-fg-base" : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        {seeAllLabel ? (
          <Link data-role="cta-secondary" href={tabs[state.selected].href} className={SEE_ALL_CLASS}>
            {seeAllLabel}
          </Link>
        ) : null}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${state.selected}`}
        aria-busy={busy || undefined}
        data-role="tab-content"
        className={clx("transition-opacity duration-200 motion-reduce:transition-none", busy && "opacity-50")}
      >
        {/* A fresh carousel per tab: its row starts at the first card, its arrows at the start. */}
        <div key={state.shown}>{state.panels[state.shown]}</div>
      </div>
    </div>
  )
}
