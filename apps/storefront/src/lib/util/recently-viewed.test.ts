import { describe, expect, it } from "vitest"

import {
  RECENTLY_VIEWED_LIMIT,
  readRecentlyViewed,
  rememberViewed,
} from "./recently-viewed"

const memory = (initial?: string) => {
  let value: string | null = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    dump: () => value,
  }
}

describe("recently viewed handles", () => {
  it("reads nothing from an empty, missing or broken store", () => {
    expect(readRecentlyViewed(memory())).toEqual([])
    expect(readRecentlyViewed(null)).toEqual([])
    expect(readRecentlyViewed(memory("not json"))).toEqual([])
    expect(readRecentlyViewed(memory('{"a":1}'))).toEqual([])
  })

  it("keeps only handle-shaped strings, once each", () => {
    expect(
      readRecentlyViewed(
        memory('[1, "ok", "has space", "", "ok", "x-y_z.1", null]')
      )
    ).toEqual(["ok", "x-y_z.1"])
  })

  it("remembers newest first without duplicates and returns what stood before", () => {
    const store = memory()
    expect(rememberViewed(store, "a")).toEqual([])
    expect(rememberViewed(store, "b")).toEqual(["a"])
    expect(rememberViewed(store, "a")).toEqual(["b"])
    expect(JSON.parse(store.dump() as string)).toEqual(["a", "b"])
  })

  it("keeps at most the limit, dropping the oldest", () => {
    const store = memory()
    for (let index = 0; index < RECENTLY_VIEWED_LIMIT + 3; index += 1) {
      rememberViewed(store, `p${index}`)
    }
    const kept = readRecentlyViewed(store)
    expect(kept).toHaveLength(RECENTLY_VIEWED_LIMIT)
    expect(kept[0]).toBe(`p${RECENTLY_VIEWED_LIMIT + 2}`)
    expect(kept).not.toContain("p0")
  })

  it("does not write a handle that is not one", () => {
    const store = memory('["a"]')
    expect(rememberViewed(store, "no spaces here")).toEqual(["a"])
    expect(JSON.parse(store.dump() as string)).toEqual(["a"])
  })

  it("survives a storage that throws on read and on write", () => {
    const broken = {
      getItem: () => {
        throw new Error("private mode")
      },
      setItem: () => {
        throw new Error("quota")
      },
    }
    expect(readRecentlyViewed(broken)).toEqual([])
    expect(rememberViewed(broken, "a")).toEqual([])
  })
})
