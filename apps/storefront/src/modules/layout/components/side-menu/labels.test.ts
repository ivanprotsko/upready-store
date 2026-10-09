import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * t-2026-10-09-75. Ivan, 09.10 (76.png, the menu «Главная, Магазин, Профиль, Корзина»):
 * «"Главная" переименовываем в "Витрина", а "Магазин" в "Каталог"». Wherever the two items of
 * the navigation are named: the burger menu (the phone's and the desktop's), the root of the
 * breadcrumbs, the catalog page's own title. The header and the footer of the shop carry no
 * such item (their store link is the logo).
 */
const MESSAGES = join(__dirname, "../../../../../messages")
const LOCALES = readdirSync(MESSAGES).filter((name) => name.endsWith(".json"))
type Catalogue = {
  Breadcrumb: { home: string; store: string }
  SideMenu: { items: Record<string, string> }
  Metadata: { store: { title: string } }
}
const catalogue = (file: string): Catalogue => JSON.parse(readFileSync(join(MESSAGES, file), "utf8"))

const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : []

describe("the menu and the breadcrumbs say «Витрина» and «Каталог»", () => {
  const ru = catalogue("ru.json")

  it("the burger menu, in Ivan's words", () => {
    expect(ru.SideMenu.items.home).toBe("Витрина")
    expect(ru.SideMenu.items.store).toBe("Каталог")
  })

  it("the root of the breadcrumbs and the catalog page's title", () => {
    expect(ru.Breadcrumb.home).toBe("Витрина")
    expect(ru.Breadcrumb.store).toBe("Каталог")
    expect(ru.Metadata.store.title).toBe("Каталог")
  })

  it("no Russian string of the storefront is «Главная» or «Магазин» any more", () => {
    expect(strings(ru).filter((value) => value === "Главная" || value === "Магазин")).toEqual([])
  })

  it("the menu keeps its order: Витрина, Каталог, Профиль, Корзина", () => {
    const menu = readFileSync(join(__dirname, "index.tsx"), "utf8")
    const keys = Array.from(menu.matchAll(/\{ key: "(\w+)" as const, href: "([^"]+)" \}/g), (match) => match.slice(1))
    expect(keys.slice(0, 4)).toEqual([
      ["home", "/"],
      ["store", "/store"],
      ["account", "/account"],
      ["cart", "/cart"],
    ])
    expect(["home", "store", "account", "cart"].map((key) => ru.SideMenu.items[key])).toEqual(["Витрина", "Каталог", "Профиль", "Корзина"])
  })

  it.each(LOCALES)("%s: the menu, the breadcrumbs and the page title name the two alike", (file) => {
    const messages = catalogue(file)
    expect(messages.SideMenu.items.home).toBe(messages.Breadcrumb.home)
    expect(messages.SideMenu.items.store).toBe(messages.Breadcrumb.store)
    expect(messages.Metadata.store.title).toBe(messages.Breadcrumb.store)
  })

  it("English names them Showcase and Catalog", () => {
    const en = catalogue("en.json")
    expect([en.SideMenu.items.home, en.SideMenu.items.store]).toEqual(["Showcase", "Catalog"])
  })
})
