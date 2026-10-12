import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-12-06. Ivan, 12.10.2026: «4. панель с харектеристиками и описанием продукта нужно
 * показывать справа», «4.1. и похоже в этой панели не работает кнопка "в корзину"», «5. убери
 * кнопку "купить" везде».
 *
 * Reproduced on a cherkashino stand before the fix: «В корзину» in the drawer did reach the
 * server (POST /api/cart 200), but nothing on screen said so. Below 1024 px the cart sidebar
 * never opens, and the drawer covers the page (the whole screen on a phone), so the header's
 * count and the buy box's «В корзине − N +» changed behind it. From 1024 px the sidebar landed
 * over the still-open drawer only by portal order. A product with options and none chosen
 * showed a grey «В корзину» with no reason given.
 *
 * The drawer is called for real, with `useProductPurchase` real too; only its surroundings (the
 * cart queue, the sidebar, the selection context, the UI kit) are stand-ins that record what
 * the click does.
 */

type Captured = { className?: string; onClick?: () => void; disabled?: boolean; children?: ReactNode }

const state = vi.hoisted(() => ({
  calls: [] as string[],
  sidebarOpens: true,
  buttons: {} as Record<string, Captured>,
  content: {} as Captured,
  selection: {} as Record<string, unknown>,
}))

vi.mock("next-intl", async () => {
  const ru = (await import("../../../../../messages/ru.json")).default as unknown as Record<
    string,
    Record<string, string>
  >
  return { useTranslations: (section: string) => (key: string) => ru[section]?.[key] ?? key }
})

vi.mock("@medusajs/icons", () => ({ XMark: () => null }))

vi.mock("@medusajs/ui", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  const Content = (props: Captured & Record<string, unknown>) => {
    state.content = props
    return <div data-testid={props["data-testid"] as string}>{props.children}</div>
  }
  const Drawer = Object.assign(Pass, { Content, Title: Pass, Close: Pass })
  const Button = (props: Captured & Record<string, unknown>) => {
    state.buttons[props["data-testid"] as string] = props
    return (
      <button data-testid={props["data-testid"] as string} disabled={props.disabled}>
        {props.children}
      </button>
    )
  }
  return { Button, Drawer, IconButton: () => null }
})

vi.mock("@lib/cart-store", () => ({
  useCartQueue: () => ({
    add: (variantId: string, delta: number) => state.calls.push(`add ${variantId} ${delta}`),
  }),
}))
vi.mock("@lib/cart-store/draft", () => ({ draftLineFor: () => ({}) }))
vi.mock("@modules/layout/components/cart-sidebar/context", () => ({
  useCartSidebar: () => ({
    open: () => {
      state.calls.push("open sidebar")
      return state.sidebarOpens
    },
  }),
}))
vi.mock("@i18n/navigation", () => ({ useRouter: () => ({ push: () => state.calls.push("navigate") }) }))
vi.mock("@modules/products/components/product-selection", () => ({
  useProductSelection: () => state.selection,
}))
vi.mock("@modules/products/components/product-price", () => ({ default: () => null }))
vi.mock("@modules/products/components/supplement-notice", () => ({ default: () => null }))

import ProductDetailsDrawer from "."

const variant = (id: string) =>
  ({ id, manage_inventory: false, options: [] }) as unknown as HttpTypes.StoreProductVariant

const product = { id: "prod_1", variants: [variant("variant_1"), variant("variant_2")] }

const render = ({ chosen = "variant_1" as string | null } = {}) => {
  state.selection = {
    product,
    pricedProduct: product,
    selectedVariant: chosen ? variant(chosen) : undefined,
    isValidVariant: Boolean(chosen),
    detailsOpen: true,
    setDetailsOpen: (open: boolean) => state.calls.push(`drawer ${open ? "open" : "closed"}`),
    detailsOpenerRef: { current: null },
  }
  return renderToStaticMarkup(<ProductDetailsDrawer rows={[]} description="Описание." />)
}

beforeEach(() => {
  state.calls = []
  state.sidebarOpens = true
  state.buttons = {}
  state.content = {}
})

describe("«В корзину» in the details drawer (item 4.1)", () => {
  it("puts the chosen variant in the cart, closes the drawer, then opens the cart sidebar", () => {
    render()
    state.buttons["product-details-add"].onClick?.()

    expect(state.calls).toEqual(["add variant_1 1", "drawer closed", "open sidebar"])
  })

  it("closes the drawer on a phone too, where no sidebar opens, so the page shows the line", () => {
    state.sidebarOpens = false
    render()
    state.buttons["product-details-add"].onClick?.()

    expect(state.calls).toContain("add variant_1 1")
    expect(state.calls).toContain("drawer closed")
    expect(state.calls).not.toContain("navigate")
  })

  it("says what is missing on a product with options and none chosen, as the buy box does", () => {
    const html = render({ chosen: null })

    expect(state.buttons["product-details-add"].disabled).toBe(true)
    expect(html).toContain("Выберите вариант")
    expect(html).not.toContain(">В корзину<")
  })
})

describe("the drawer's place and buttons (items 4 and 5)", () => {
  it("is a card on the right edge from 512 px, sliding in from the right", () => {
    render()
    const classes = (state.content.className ?? "").split(/\s+/)

    expect(classes).toContain("xsmall:!right-2")
    expect(classes).toContain("xsmall:!left-auto")
    expect(classes.some((name) => /left-2$|slide-(in-from|out-to)-left/.test(name))).toBe(false)
  })

  it("has one buy button, «В корзину», and no «Купить»", () => {
    const html = render()

    expect(Object.keys(state.buttons)).toEqual(["product-details-add"])
    expect(html).not.toContain("Купить")
  })
})
