import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { closeSearch, getSearchOpen, isSearchShortcut, openSearch, subscribe, toggleSearch } from "./store"

const SRC = join(__dirname, "../../../..")
const read = (path: string) => readFileSync(join(SRC, path), "utf8")

afterEach(() => closeSearch())

/**
 * Ivan, 04.10 (ask-20261004-225755-14ba): «давай слева от контрола входа в личный кабинет
 * добавим контрол с поиском, который будет вызывать ту же панель поиска что и CMD + K».
 */
describe("the search control opens the palette Cmd+K opens", () => {
  it("opens the shared palette and the shortcut closes it again", () => {
    openSearch() // the control's onClick
    expect(getSearchOpen()).toBe(true)
    toggleSearch() // Cmd+K while it is open
    expect(getSearchOpen()).toBe(false)
    toggleSearch() // Cmd+K while it is closed
    expect(getSearchOpen()).toBe(true)
  })

  it("tells a listener once per change, not per call", () => {
    let calls = 0
    const unsubscribe = subscribe(() => calls++)
    openSearch()
    openSearch()
    closeSearch()
    unsubscribe()
    openSearch()
    expect(calls).toBe(2)
  })

  it.each([
    [{ key: "k", metaKey: true, ctrlKey: false }, true],
    [{ key: "k", metaKey: false, ctrlKey: true }, true],
    [{ key: "k", metaKey: false, ctrlKey: false }, false],
    [{ key: "j", metaKey: true, ctrlKey: false }, false],
  ])("reads %o as the shortcut: %s", (event, expected) => {
    expect(isSearchShortcut(event)).toBe(expected)
  })

  it("is a button with no palette of its own", () => {
    const control = read("modules/layout/components/search/index.tsx")
    expect(control).toContain("onClick={openSearch}")
    expect(control).toContain('aria-label={t("label")}')
    expect(control).not.toContain("Dialog")
    expect(control).not.toContain("keydown")
  })
})

describe("one palette per page", () => {
  it("the (main) layout places SearchPalette exactly once", () => {
    const layout = read("app/[locale]/(main)/layout.tsx")
    expect(layout.match(/<SearchPalette \/>/g)).toHaveLength(1)
  })

  it("only the palette listens for Cmd+K", () => {
    const palette = read("modules/layout/components/search/palette.tsx")
    expect(palette).toContain("isSearchShortcut(e)")
    expect(palette).toContain("toggleSearch()")
  })
})

describe("the search control stands right before the header's account icon", () => {
  it.each(["h1", "h2", "h4", "h7"])("in %s", (variant) => {
    const nav = read(`modules/layout/templates/nav/variants/${variant}.tsx`)
    expect(nav).toMatch(/<Search className=(\{[^}]+\}|"[^"]+") \/>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<AccountLink\b/)
  })
})
