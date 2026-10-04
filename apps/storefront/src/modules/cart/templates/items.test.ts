import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-04-42 (Ivan, 04.10.2026): «на странице корзины нужно обернуть карточки товаров
 * и стилизовать их точно также как в которая отображается сайдбаре». The cart page and the
 * cart sidebar draw their lines through one component, `CartLineGroups`, so the two cannot
 * drift apart again.
 *
 * Both are client components this package has no renderer for (no @testing-library/react
 * here, the same constraint `login-render.test.ts` and `cart-sidebar-side.test.ts` work
 * around), so the sharing is asserted on the source.
 */
const here = dirname(fileURLToPath(import.meta.url))
const sidebarDir = join(here, "..", "..", "layout", "components", "cart-sidebar")
const read = (...parts: string[]) => readFileSync(join(...parts), "utf8")

const items = read(here, "items.tsx")
const sidebar = read(sidebarDir, "index.tsx")
const groups = read(sidebarDir, "groups.tsx")

describe("cart page lines are the cart sidebar's cards", () => {
  it("the page and the sidebar both draw CartLineGroups", () => {
    for (const source of [items, sidebar]) {
      expect(source).toContain("<CartLineGroups")
    }
    expect(items).toContain('from "@modules/layout/components/cart-sidebar/groups"')
    expect(sidebar).toContain('from "./groups"')
  })

  it("every line is the sidebar's own CartSidebarLine card", () => {
    expect(groups).toContain("<CartSidebarLine")
    // Neither consumer draws a line of its own any more.
    for (const source of [items, sidebar]) {
      expect(source).not.toContain("<CartSidebarLine")
      expect(source).not.toMatch(/<Item\b/)
    }
  })

  it("the page wraps the groups in the sidebar's grey", () => {
    expect(sidebar).toContain("bg-[var(--cart-sidebar-bg)]")
    expect(items).toMatch(/className="[^"]*\bbg-\[var\(--cart-sidebar-bg\)\][^"]*"\s+data-testid="items-table"/)
  })
})
