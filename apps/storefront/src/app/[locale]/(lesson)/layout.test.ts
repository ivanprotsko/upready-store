import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ivan 05.10 (ask-20261005-055028-2ae9): «на странице урока нужно убрать
 * футер, регион и валюту, корзину, поиск». The lesson renders under this
 * route group's own layout, which never mounts the shop's header variant,
 * footer, bottom navigation, cart or search; asserted on source, the same
 * convention `(main)/layout.test.ts` uses.
 */

const here = dirname(fileURLToPath(import.meta.url))
const layout = readFileSync(join(here, "layout.tsx"), "utf8")
const header = readFileSync(
  join(here, "../../../modules/layout/templates/lesson-header/index.tsx"),
  "utf8"
)

describe("(lesson) layout: the lesson without the shop around it", () => {
  it("the lesson page lives in this group, not under (main)", () => {
    expect(
      existsSync(join(here, "account/courses/[slug]/lessons/[lessonId]/page.tsx"))
    ).toBe(true)
    expect(
      existsSync(
        join(here, "../(main)/account/@dashboard/courses/[slug]/lessons/[lessonId]/page.tsx")
      )
    ).toBe(false)
  })

  it.each([
    ["the footer", "templates/footer"],
    ["the shop's header", "templates/nav"],
    ["the bottom navigation", "components/bottom-nav"],
    ["region and currency", "components/region-select"],
    ["the cart", "components/cart"],
    ["search", "components/search"],
  ])("mounts no %s", (_name, module) => {
    for (const source of [layout, header]) {
      expect(source).not.toContain(`@modules/layout/${module}`)
    }
  })

  it("keeps the logo home and the way into the account", () => {
    expect(header).toContain('href="/"')
    expect(header).toContain("<AccountLink")
  })

  it("keeps the skip link to the one main landmark", () => {
    expect(layout).toContain('href="#main-content"')
    expect(layout).toContain('id="main-content"')
  })
})
