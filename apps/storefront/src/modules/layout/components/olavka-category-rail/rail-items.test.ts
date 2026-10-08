import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"

import { CATEGORY_TINTS, SEARCH_TINT, categoryTint } from "./palette"
import { activeItemId, railItems, railShownOn } from "./rail-items"

/**
 * t-2026-10-09-41 (Ivan, ask 4c05): the category row of the frame CatalogNav on the Olavka
 * shops. The brief: «Цвета кнопок категорий не зашивать списком имён: категории у владелицы
 * меняются». A colour follows the button's place in the row.
 */

const category = (
  id: string,
  name: string,
  handle: string,
  parent: string | null = null
): HttpTypes.StoreProductCategory =>
  ({ id, name, handle, parent_category_id: parent }) as HttpTypes.StoreProductCategory

// The nine top-level categories of olavka in the 02.10 copy, in the owner's rank order, plus a child.
const SHOP = [
  category("c1", "Мультиварки", "multivarki-cherkashino"),
  category("c2", "Стевия", "steviya-cherkashino"),
  category("c3", "АСД", "asd-cherkashino"),
  category("c4", "Стимуляторы", "stimulyatory-cherkashino"),
  category("c5", "Антисептики", "antiseptiki-cherkashino"),
  category("c6", "Фито-свечи", "fito-svechi-cherkashino"),
  category("c7", "Масла", "masla-cherkashino"),
  category("c8", "Мёд", "myod-cherkashino"),
  category("c9", "Добавки", "dobavki-cherkashino"),
  category("c10", "Капли АСД", "asd-kapli", "c3"),
]

describe("railItems: the row's buttons", () => {
  it("top-level categories only, in alphabetical order of the page's language", () => {
    expect(railItems(SHOP, "ru").map((item) => item.name)).toEqual([
      "Антисептики",
      "АСД",
      "Добавки",
      "Масла",
      "Мёд",
      "Мультиварки",
      "Стевия",
      "Стимуляторы",
      "Фито-свечи",
    ])
  })

  it("each button takes the tint of its place: the frame's sequence from the first", () => {
    const items = railItems(SHOP, "ru")
    items.forEach((item, position) => {
      const { fill, ink, shade } = CATEGORY_TINTS[position]
      expect(item.tint, item.name).toEqual({ fill, ink, shade })
    })
  })

  it("the first ten never share a colour, the eleventh starts the run again", () => {
    const many = Array.from({ length: 11 }, (_, i) => category(`x${i}`, `Категория ${String(i).padStart(2, "0")}`, `k-${i}`))
    const tints = railItems(many, "ru").map((item) => item.tint.fill)
    expect(new Set(tints.slice(0, 10)).size).toBe(10)
    expect(tints[10]).toBe(tints[0])
  })

  it("no name decides a colour: renamed categories keep the colours of their places", () => {
    const renamed = SHOP.map((c, i) => category(c.id, `Новое имя ${String.fromCharCode(1072 + i)}`, `new-${i}`, c.parent_category_id))
    const before = railItems(SHOP, "ru").map((item) => item.tint)
    const after = railItems(renamed, "ru").map((item) => item.tint)
    expect(after).toEqual(before)
  })

  it("a parent's button holds its children's handles", () => {
    const asd = railItems(SHOP, "ru").find((item) => item.id === "c3")
    expect(asd?.handles).toEqual(["asd-cherkashino", "asd-kapli"])
  })

  it("a shop with no category gets no row", () => {
    expect(railItems([], "ru")).toEqual([])
  })
})

describe("categoryTint", () => {
  it("wraps in both directions and never returns the search pair", () => {
    expect(categoryTint(CATEGORY_TINTS.length)).toEqual(categoryTint(0))
    expect(categoryTint(-1)).toEqual(categoryTint(CATEGORY_TINTS.length - 1))
    for (let i = 0; i < CATEGORY_TINTS.length; i++) expect(categoryTint(i).fill).not.toBe(SEARCH_TINT.fill)
  })
})

describe("railShownOn: the shopping pages", () => {
  it("home, store, a category, a product", () => {
    for (const path of ["/", "/store", "/categories/asd-cherkashino", "/products/asd-2"]) expect(railShownOn(path), path).toBe(true)
  })

  it("not on the account, the cart, an order or a content page", () => {
    for (const path of ["/account", "/account/wishlist", "/cart", "/order/1/confirmed", "/journal", "/privacy"]) expect(railShownOn(path), path).toBe(false)
  })
})

describe("activeItemId: the lit button", () => {
  const items = railItems(SHOP, "ru")

  it("the category's own page lights it", () => {
    expect(activeItemId("/categories/masla-cherkashino", items)).toBe("c7")
  })

  it("a child's page lights its parent", () => {
    expect(activeItemId("/categories/asd-kapli", items)).toBe("c3")
  })

  it("an encoded handle is read decoded", () => {
    const cyrillic = railItems([category("k", "Книги", "книги")], "ru")
    expect(activeItemId(`/categories/${encodeURIComponent("книги")}`, cyrillic)).toBe("k")
  })

  it("no button is lit off the category pages or on an unknown category", () => {
    expect(activeItemId("/store", items)).toBeNull()
    expect(activeItemId("/categories/none", items)).toBeNull()
  })
})

describe("the row belongs to the Olavka header only", () => {
  const variants = join(dirname(fileURLToPath(import.meta.url)), "../../templates/nav/variants")

  it("h7 renders it, no other header imports it", () => {
    const importers = readdirSync(variants)
      .filter((name) => /\.tsx$/.test(name))
      .filter((name) => readFileSync(join(variants, name), "utf8").includes("olavka-category-rail"))
    expect(importers).toEqual(["h7.tsx"])
  })

  it("the Olavka bar keeps no magnifier of its own: the frame moved search into the row", () => {
    const h7 = readFileSync(join(variants, "h7.tsx"), "utf8")
    expect(h7).not.toMatch(/<Search\b/)
    expect(h7).toMatch(/<OlavkaCategoryRail\s*\/>/)
  })
})
