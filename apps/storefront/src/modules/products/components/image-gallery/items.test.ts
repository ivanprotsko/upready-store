import { describe, expect, it } from "vitest"

import {
  buildItems,
  isSwipe,
  itemsSignature,
  neighbourIndexes,
  parseAspect,
  swipeDirection,
  wrapIndex,
} from "./items"

const image = (id: string, url?: string) =>
  ({ id, url: url === undefined ? `https://example.test/${id}.jpg` : url }) as never

describe("buildItems", () => {
  it("keeps the backend order and drops images with no URL", () => {
    expect(buildItems([image("a"), image("b", ""), image("c")])).toEqual([
      { id: "a", url: "https://example.test/a.jpg" },
      { id: "c", url: "https://example.test/c.jpg" },
    ])
  })

  it("keeps the first image first, so the white-background cover stays the cover", () => {
    const items = buildItems([image("cover"), image("b"), image("c")])
    expect(items[0].id).toBe("cover")
  })

  it("returns nothing for a product with no images", () => {
    expect(buildItems([])).toEqual([])
  })
})

describe("itemsSignature", () => {
  it("changes when the image list changes, so the active slide resets", () => {
    const a = itemsSignature(buildItems([image("a1"), image("a2")]))
    const b = itemsSignature(buildItems([image("b1"), image("b2")]))
    expect(a).not.toBe(b)
  })

  it("stays equal for the same list", () => {
    expect(itemsSignature(buildItems([image("a"), image("b")]))).toBe(
      itemsSignature(buildItems([image("a"), image("b")]))
    )
  })
})

describe("wrapIndex", () => {
  it("wraps forward past the last slide", () => {
    expect(wrapIndex(2, +1, 3)).toBe(0)
  })

  it("wraps backward past the first slide", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2)
  })

  it("moves one step inside the range", () => {
    expect(wrapIndex(0, +1, 3)).toBe(1)
    expect(wrapIndex(2, -1, 3)).toBe(1)
  })

  it("answers 0 for an empty gallery instead of a negative index", () => {
    expect(wrapIndex(0, -1, 0)).toBe(0)
  })
})

describe("swipeDirection", () => {
  it("ignores a drag shorter than the threshold", () => {
    expect(isSwipe(30)).toBe(false)
    expect(swipeDirection(30)).toBe(0)
    expect(swipeDirection(-30)).toBe(0)
  })

  it("reads a leftward drag as next and a rightward one as previous", () => {
    expect(swipeDirection(-60)).toBe(1)
    expect(swipeDirection(60)).toBe(-1)
  })

  it("takes the threshold from its argument", () => {
    expect(swipeDirection(30, 10)).toBe(-1)
  })
})

describe("parseAspect", () => {
  it("reads both the slash and the colon form", () => {
    expect(parseAspect("3/4")).toEqual({ w: 3, h: 4 })
    expect(parseAspect("16:9")).toEqual({ w: 16, h: 9 })
  })

  it("falls back to 3/4 when the value is absent or malformed", () => {
    expect(parseAspect(undefined)).toEqual({ w: 3, h: 4 })
    expect(parseAspect("square")).toEqual({ w: 3, h: 4 })
    expect(parseAspect("0/4")).toEqual({ w: 3, h: 4 })
  })
})

describe("neighbourIndexes", () => {
  it("names the next and the previous slide", () => {
    expect(neighbourIndexes(0, 5).sort()).toEqual([1, 4])
  })

  it("names one slide when both neighbours are the same", () => {
    expect(neighbourIndexes(0, 2)).toEqual([1])
  })

  it("names nothing for a single image", () => {
    expect(neighbourIndexes(0, 1)).toEqual([])
  })
})
