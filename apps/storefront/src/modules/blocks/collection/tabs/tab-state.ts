import type { ReactNode } from "react"

/**
 * The panel's state, apart from React so the suite can drive it without a DOM: which tab is
 * chosen, whose cards stand in the panel, and the cards loaded so far.
 */
export type TabState = {
  /** The tab chosen: `aria-selected`, the roving tab stop, the «see all» target. */
  selected: number
  /** The tab whose cards the panel shows; it lags `selected` while those load. */
  shown: number
  /** The cards of every tab loaded so far, by index. */
  panels: Record<number, ReactNode>
}

export const initialTabState = (first: ReactNode): TabState => ({ selected: 0, shown: 0, panels: { 0: first } })

/** Choose a tab: shown at once when its cards are here, else the panel keeps what it shows. */
export const chooseTab = (state: TabState, index: number): TabState => ({
  ...state,
  selected: index,
  shown: index in state.panels ? index : state.shown,
})

/**
 * A tab's cards came back. Kept for later; shown when the tab is still the chosen one. Nothing
 * came (an empty source now, a failed read): the chosen tab, if it is this one, gives its place
 * back to the tab the panel shows, so the label and the cards agree again.
 */
export const settleTab = (state: TabState, index: number, cards: ReactNode): TabState =>
  cards
    ? {
        ...state,
        panels: { ...state.panels, [index]: cards },
        shown: state.selected === index ? index : state.shown,
      }
    : { ...state, selected: state.selected === index ? state.shown : state.selected }

/**
 * The tab a key moves to from tab `from` of `count` (WAI-ARIA tab pattern): the arrows to the
 * next and the previous along the row, wrapping, Home and End to the first and the last. In a
 * right-to-left page the row runs the other way, and so do the arrows. Null for any other key.
 */
export function tabAfterKey(key: string, from: number, count: number, rtl: boolean): number | null {
  const forward = rtl ? "ArrowLeft" : "ArrowRight"
  const backward = rtl ? "ArrowRight" : "ArrowLeft"
  if (key === forward) return (from + 1) % count
  if (key === backward) return (from - 1 + count) % count
  if (key === "Home") return 0
  if (key === "End") return count - 1
  return null
}
