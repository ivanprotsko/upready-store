import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"

import { SEARCH_TINT, categoryTint } from "./palette"
import { activeItemId, hasRailItems, railItems, railShownOn } from "./rail-items"

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

  it("every button takes the one neutral pair (t-2026-10-20-61 D2)", () => {
    const items = railItems(SHOP, "ru")
    items.forEach((item) => {
      expect(item.tint, item.name).toEqual(SEARCH_TINT)
    })
  })

  it("a long row never repeats a colour because there is only one", () => {
    const many = Array.from({ length: 11 }, (_, i) => category(`x${i}`, `Категория ${String(i).padStart(2, "0")}`, `k-${i}`))
    const tints = railItems(many, "ru").map((item) => item.tint.fill)
    expect(new Set(tints).size).toBe(1)
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
  it("is the same neutral pair for any position", () => {
    expect(categoryTint(5)).toEqual(categoryTint(0))
    expect(categoryTint(-1)).toEqual(categoryTint(0))
    expect(categoryTint(0).fill).toBe("var(--muted)")
  })
})

// t-2026-10-09-75, Ivan, 09.10 (75.png): «вот эту навигацию оставляем только на главной странице».
describe("railShownOn: the home page only", () => {
  it("the home page has the row", () => {
    expect(railShownOn("/")).toBe(true)
  })

  it("the catalog, a category and a product page no longer have it, nor any other page", () => {
    for (const path of ["/store", "/categories/asd-cherkashino", "/categories/asd/kapli", "/products/asd-2", "/collections/hits", "/brands", "/account", "/account/wishlist", "/cart", "/order/1/confirmed", "/journal", "/privacy"]) {
      expect(railShownOn(path), path).toBe(false)
    }
  })
})

describe("hasRailItems: whether the row has a button at all", () => {
  it("a top-level category with a handle is a button; a child or a shop without categories is none", () => {
    expect(hasRailItems(SHOP)).toBe(true)
    expect(hasRailItems([category("c10", "Капли АСД", "asd-kapli", "c3")])).toBe(false)
    expect(hasRailItems([])).toBe(false)
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

  // t-2026-10-09-75: the row's magnifier was the bar's search; off the home page the bar carries
  // it again (`HeaderSearch`), and on the home page the row's own stays the only one.
  it("the Olavka bar draws the row and, off the home page, its own magnifier through HeaderSearch", () => {
    const h7 = readFileSync(join(variants, "h7.tsx"), "utf8")
    expect(h7).not.toMatch(/<Search\b/)
    expect(h7).toMatch(/<OlavkaCategoryRail\s*\/>/)
    expect(h7).toMatch(/<HeaderSearch className=\{styles\.iconButton\} railDrawn=\{hasRailItems\(categories\)\} \/>/)
  })
})
