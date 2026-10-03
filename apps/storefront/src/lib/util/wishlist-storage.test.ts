import { describe, expect, it } from "vitest"

import {
  WISHLIST_STORAGE_LIMIT,
  addToWishlistStorage,
  clearWishlistStorage,
  readWishlistStorage,
  removeFromWishlistStorage,
} from "./wishlist-storage"

const memory = (initial?: string) => {
  let value: string | null = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    removeItem: () => {
      value = null
    },
    dump: () => value,
  }
}

describe("wishlist storage", () => {
  it("reads nothing from an empty, missing or broken store", () => {
    expect(readWishlistStorage(memory())).toEqual([])
    expect(readWishlistStorage(null)).toEqual([])
    expect(readWishlistStorage(memory("not json"))).toEqual([])
    expect(readWishlistStorage(memory('{"a":1}'))).toEqual([])
  })

  it("keeps only id-shaped strings, once each", () => {
    expect(
      readWishlistStorage(
        memory('[1, "prod_1", "has space", "", "prod_1", "prod_2", null]')
      )
    ).toEqual(["prod_1", "prod_2"])
  })

  it("adds a product to the front and returns the list after", () => {
    const store = memory()
    expect(addToWishlistStorage(store, "prod_1")).toEqual(["prod_1"])
    expect(addToWishlistStorage(store, "prod_2")).toEqual(["prod_2", "prod_1"])
    expect(JSON.parse(store.dump() as string)).toEqual(["prod_2", "prod_1"])
  })

  it("does not add the same product twice", () => {
    const store = memory()
    addToWishlistStorage(store, "prod_1")
    expect(addToWishlistStorage(store, "prod_1")).toEqual(["prod_1"])
  })

  it("does not add an id that is not one", () => {
    const store = memory('["prod_1"]')
    expect(addToWishlistStorage(store, "not an id")).toEqual(["prod_1"])
    expect(JSON.parse(store.dump() as string)).toEqual(["prod_1"])
  })

  it("removes a product and returns the list after", () => {
    const store = memory('["prod_1","prod_2"]')
    expect(removeFromWishlistStorage(store, "prod_1")).toEqual(["prod_2"])
    expect(JSON.parse(store.dump() as string)).toEqual(["prod_2"])
  })

  it("removing a product never saved is a no-op", () => {
    const store = memory('["prod_1"]')
    expect(removeFromWishlistStorage(store, "prod_9")).toEqual(["prod_1"])
  })

  it("keeps at most the limit, dropping the oldest", () => {
    const store = memory()
    for (let index = 0; index < WISHLIST_STORAGE_LIMIT + 3; index += 1) {
      addToWishlistStorage(store, `prod_${index}`)
    }
    const kept = readWishlistStorage(store)
    expect(kept).toHaveLength(WISHLIST_STORAGE_LIMIT)
    expect(kept[0]).toBe(`prod_${WISHLIST_STORAGE_LIMIT + 2}`)
    expect(kept).not.toContain("prod_0")
  })

  it("clears the stored list", () => {
    const store = memory('["prod_1"]')
    clearWishlistStorage(store)
    expect(readWishlistStorage(store)).toEqual([])
  })

  it("survives a storage that throws on read, write and remove", () => {
    const broken = {
      getItem: () => {
        throw new Error("private mode")
      },
      setItem: () => {
        throw new Error("quota")
      },
      removeItem: () => {
        throw new Error("quota")
      },
    }
    expect(readWishlistStorage(broken)).toEqual([])
    expect(addToWishlistStorage(broken, "prod_1")).toEqual([])
    expect(removeFromWishlistStorage(broken, "prod_1")).toEqual([])
    expect(() => clearWishlistStorage(broken)).not.toThrow()
  })
})
