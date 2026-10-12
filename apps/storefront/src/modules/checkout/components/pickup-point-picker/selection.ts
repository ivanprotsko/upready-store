/**
 * The selection of the pickup-point picker, the one state the Russian Post and the CDEK
 * pickers share (t-2026-10-12-03, Ivan's items 3.4 and 3.6, decisions D5, D6 and D9).
 *
 * A pure reducer, so the rules below are unit-tested without a renderer:
 *  - a tap on a row selects that point, and the row expands in place;
 *  - a tap on the map selects the point and asks the list to scroll to its row;
 *  - the xmark of the map card clears the selection, so no red pin is left behind;
 *  - switching tabs keeps the selection, and switching back to the list scrolls to it;
 *  - points that arrive while the cart already holds one of them select it, scrolled into view.
 */

export type PickerTab = "list" | "map"

/**
 * How the list brings the selected row into view: `start` puts it at the top (it was picked
 * somewhere else, the map or the cart), `nearest` moves only as far as the expanded row needs
 * (the buyer tapped it, so it is already under the finger).
 */
export type ScrollMode = "start" | "nearest"

export type PickerSelection = {
  /** The point the buyer tapped in the list or on the map, or the cart's own point. */
  selectedId: string | null
  /** The tab a narrow screen shows; from `small` up both panes stand side by side. */
  tab: PickerTab
  /**
   * Bumped whenever the list has to bring the selected row into view. The list reacts to
   * the change, so two taps on the same pin scroll twice and an unrelated render never does.
   */
  scrollRequest: number
  scrollMode: ScrollMode
}

export type PickerAction =
  | { type: "reset" }
  | { type: "loaded"; ids: string[]; chosenId: string | null }
  | { type: "row"; id: string }
  | { type: "map"; id: string }
  | { type: "clear" }
  | { type: "tab"; tab: PickerTab }

export const initialSelection: PickerSelection = {
  selectedId: null,
  tab: "list",
  scrollRequest: 0,
  scrollMode: "start",
}

const scrollTo = (state: PickerSelection, scrollMode: ScrollMode): PickerSelection => ({
  ...state,
  scrollRequest: state.scrollRequest + 1,
  scrollMode,
})

export function selectionReducer(state: PickerSelection, action: PickerAction): PickerSelection {
  switch (action.type) {
    case "reset":
      return { ...initialSelection, scrollRequest: state.scrollRequest }
    case "loaded": {
      // A new list (the city changed, or the picker opened): the cart's point is selected
      // when it is among the points, otherwise nothing is.
      const selectedId =
        action.chosenId && action.ids.includes(action.chosenId) ? action.chosenId : null
      const next = { ...state, selectedId }
      return selectedId ? scrollTo(next, "start") : next
    }
    case "row":
      return scrollTo({ ...state, selectedId: action.id }, "nearest")
    case "map":
      return scrollTo({ ...state, selectedId: action.id }, "start")
    case "clear":
      return state.selectedId === null ? state : { ...state, selectedId: null }
    case "tab": {
      if (state.tab === action.tab) return state
      const next = { ...state, tab: action.tab }
      return action.tab === "list" && state.selectedId ? scrollTo(next, "start") : next
    }
  }
}

/**
 * The list's `scrollTop` that brings a row into view. `offsetTop` is the row's distance from
 * the top of the list, which holds because the list is the rows' positioned ancestor.
 */
export function scrollTopFor(
  list: { scrollTop: number; clientHeight: number },
  row: { offsetTop: number; offsetHeight: number },
  mode: ScrollMode
): number {
  if (mode === "start") return row.offsetTop
  const top = row.offsetTop
  const bottom = row.offsetTop + row.offsetHeight
  if (top < list.scrollTop) return top
  if (bottom > list.scrollTop + list.clientHeight) {
    // A row taller than the list keeps its top in view rather than its bottom.
    return Math.min(top, bottom - list.clientHeight)
  }
  return list.scrollTop
}
