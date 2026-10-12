import { describe, expect, it } from "vitest"

import {
  initialSelection,
  scrollTopFor,
  selectionReducer,
  type PickerAction,
  type PickerSelection,
} from "./selection"

/**
 * t-2026-10-12-03: the selection both pickers share, Ivan's items 3.4, 3.6, 3.6.1 and 3.6.2
 * of 12.10 and the lead's decisions D5, D6 and D9.
 */

const run = (...actions: PickerAction[]): PickerSelection =>
  actions.reduce(selectionReducer, initialSelection)

const loaded = (chosenId: string | null = null): PickerAction => ({
  type: "loaded",
  ids: ["A", "B", "C"],
  chosenId,
})

describe("pickup picker selection", () => {
  it("3.4: a tap on a row selects it, so that row expands in place", () => {
    const state = run(loaded(), { type: "row", id: "B" })
    expect(state.selectedId).toBe("B")
    expect(state.scrollMode).toBe("nearest")
  })

  it("selects one point at a time: a second row collapses the first", () => {
    const state = run(loaded(), { type: "row", id: "A" }, { type: "row", id: "C" })
    expect(state.selectedId).toBe("C")
  })

  it("3.6, 3.6.2: a tap on the map selects the point and asks the list to scroll to its row", () => {
    const before = run(loaded())
    const after = selectionReducer(before, { type: "map", id: "C" })
    expect(after.selectedId).toBe("C")
    expect(after.scrollRequest).toBe(before.scrollRequest + 1)
    expect(after.scrollMode).toBe("start")
  })

  it("asks again when the same pin is tapped twice: the list may have moved in between", () => {
    const once = run(loaded(), { type: "map", id: "C" })
    const twice = selectionReducer(once, { type: "map", id: "C" })
    expect(twice.scrollRequest).toBe(once.scrollRequest + 1)
  })

  it("3.6: the xmark clears the selection, so no red pin is left", () => {
    const state = run(loaded(), { type: "tab", tab: "map" }, { type: "map", id: "B" }, { type: "clear" })
    expect(state.selectedId).toBeNull()
    expect(state.tab).toBe("map")
  })

  it("3.6.1: switching to «Список» keeps the selection and scrolls the list to it", () => {
    const onMap = run(loaded(), { type: "tab", tab: "map" }, { type: "map", id: "B" })
    const onList = selectionReducer(onMap, { type: "tab", tab: "list" })
    expect(onList.tab).toBe("list")
    expect(onList.selectedId).toBe("B")
    expect(onList.scrollRequest).toBe(onMap.scrollRequest + 1)
    expect(onList.scrollMode).toBe("start")
  })

  it("switching to «Карта» keeps the selection, so the map card shows the same point", () => {
    const state = run(loaded(), { type: "row", id: "A" }, { type: "tab", tab: "map" })
    expect(state.tab).toBe("map")
    expect(state.selectedId).toBe("A")
  })

  it("does not scroll on a tab switch with nothing selected", () => {
    const onMap = run(loaded(), { type: "tab", tab: "map" })
    const onList = selectionReducer(onMap, { type: "tab", tab: "list" })
    expect(onList.scrollRequest).toBe(onMap.scrollRequest)
  })

  it("D9: points that hold the cart's point select it and scroll to it", () => {
    const state = run(loaded("C"))
    expect(state.selectedId).toBe("C")
    expect(state.scrollRequest).toBe(1)
    expect(state.scrollMode).toBe("start")
  })

  it("D9: the cart's point from another city selects nothing", () => {
    const state = run({ type: "loaded", ids: ["X", "Y"], chosenId: "C" })
    expect(state.selectedId).toBeNull()
    expect(state.scrollRequest).toBe(0)
  })

  it("a new list (another city) drops a selection that is not in it", () => {
    const state = run(loaded(), { type: "row", id: "B" }, { type: "loaded", ids: ["X"], chosenId: null })
    expect(state.selectedId).toBeNull()
  })

  it("closing resets the selection and the tab", () => {
    const state = run(loaded(), { type: "tab", tab: "map" }, { type: "map", id: "A" }, { type: "reset" })
    expect(state.selectedId).toBeNull()
    expect(state.tab).toBe("list")
  })
})

describe("scrollTopFor", () => {
  const list = { scrollTop: 300, clientHeight: 400 }

  it("puts a row picked elsewhere at the top of the list", () => {
    expect(scrollTopFor(list, { offsetTop: 1200, offsetHeight: 180 }, "start")).toBe(1200)
    expect(scrollTopFor(list, { offsetTop: 40, offsetHeight: 180 }, "start")).toBe(40)
  })

  it("leaves a tapped row that is fully in view where it is", () => {
    expect(scrollTopFor(list, { offsetTop: 350, offsetHeight: 200 }, "nearest")).toBe(300)
  })

  it("moves only as far as the expanded row needs to show its button", () => {
    expect(scrollTopFor(list, { offsetTop: 600, offsetHeight: 200 }, "nearest")).toBe(400)
  })

  it("keeps the top of a row taller than the list in view", () => {
    expect(scrollTopFor(list, { offsetTop: 500, offsetHeight: 600 }, "nearest")).toBe(500)
  })

  it("scrolls up to a row above the visible part", () => {
    expect(scrollTopFor(list, { offsetTop: 100, offsetHeight: 150 }, "nearest")).toBe(100)
  })
})
