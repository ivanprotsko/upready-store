import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-06-11 (Ivan, 06.10.2026): «На скриншотах обрати внимание на
 * сбаланисрованость». The cart page draws its lines as a light table with column
 * captions beside one bordered summary card. That replaces the sidebar's grey panel of
 * white cards the page drew since t-2026-10-04-42. The page and the sidebar still group
 * the lines by shipment the same way and follow the same quantity rules.
 *
 * These are client components this package has no renderer for (no
 * @testing-library/react here, the same constraint `login-render.test.ts` and
 * `cart-sidebar-side.test.ts` work around), so the structure is asserted on the source.
 */
const here = dirname(fileURLToPath(import.meta.url))
const sidebarDir = join(here, "..", "..", "layout", "components", "cart-sidebar")
const read = (...parts: string[]) => readFileSync(join(...parts), "utf8")

const items = read(here, "items.tsx")
const content = read(here, "content.tsx")
const summary = read(here, "summary.tsx")
const line = read(here, "..", "components", "cart-line", "index.tsx")
const sidebar = read(sidebarDir, "index.tsx")
const groups = read(sidebarDir, "groups.tsx")
const sidebarLine = read(sidebarDir, "line.tsx")

describe("cart page lines are a table beside the summary card", () => {
  it("the page and the sidebar group the lines by shipment the same way", () => {
    for (const source of [items, groups]) {
      expect(source).toContain("shipmentGroups(cartShipmentLines(")
      expect(source).toContain('tShip("shipmentNo"')
      expect(source).toContain('tShip("digitalGroup")')
      expect(source).toContain("cart-sidebar-group-${group.kind}")
    }
    expect(sidebar).toContain("<CartLineGroups")
    expect(items).toContain("useCartDeliveryEstimate(cart, true)")
  })

  it("the captions and every line share one set of column tracks", () => {
    expect(items).toContain("<CartLine")
    expect(items).toMatch(/md:grid \$\{CART_ROW_COLUMNS\}/)
    expect(line).toMatch(/md:items-center \$\{CART_ROW_COLUMNS\}/)
    for (const key of ["columnProduct", "columnPrice", "columnQuantity", "columnTotal"]) {
      expect(items).toContain(`t("${key}")`)
    }
  })

  it("the page line keeps the sidebar card's rules and test ids", () => {
    for (const source of [line, sidebarLine]) {
      expect(source).toContain("queue.set(item.variant_id, next)")
      expect(source).toContain("noDelivery ? 1 : maxQuantity(item.variant)")
      expect(source).toContain("<WishlistButton")
      expect(source).toContain("<CartLineError")
      for (const id of [
        "cart-sidebar-line",
        "cart-sidebar-line-title",
        "cart-sidebar-line-total",
        "cart-sidebar-line-unit",
        "cart-sidebar-stepper",
        "cart-sidebar-decrease",
        "cart-sidebar-quantity",
        "cart-sidebar-increase",
        "line-no-delivery-badge",
      ]) {
        expect(source).toContain(`data-testid="${id}"`)
      }
    }
  })

  it("the list is no longer the sidebar's grey panel", () => {
    expect(sidebar).toContain("bg-[var(--cart-sidebar-bg)]")
    expect(items).not.toContain("--cart-sidebar-bg")
    expect(items).toMatch(/className="[^"]*\bborder-ui-border-base\b[^"]*"\s+data-testid="items-table"/)
  })

  it("the title is above both columns and the summary is one card", () => {
    expect(content.indexOf('t("heading")')).toBeLessThan(content.indexOf("<ItemsTemplate"))
    expect(content).toContain("items-start")
    expect(items).not.toContain("<h1")
    expect(summary).toMatch(/className="[^"]*\brounded-lg border border-ui-border-base\b[^"]*"\s+data-testid="cart-summary"/)
    const card = summary.slice(summary.indexOf('data-testid="cart-summary"'), summary.indexOf("</section>"))
    for (const part of ['tOrder("heading")', "<DiscountCode", "<CartTotals", 'data-testid="checkout-button"']) {
      expect(card).toContain(part)
    }
  })
})
