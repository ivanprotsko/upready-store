import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-12-06. Ivan, 12.10.2026: «5. убери кнопку "купить" везде».
 *
 * The buy box had «В корзину» and, under it, «Купить» (`buy-now-button`), which put the line
 * in the cart and left for the checkout. Now «В корзину» is its one button, on the card's
 * whole width. The buy box is called for real, with `useProductPurchase` real too; its
 * surroundings are stand-ins that record what the click does.
 */

type Captured = { className?: string; onClick?: () => void; disabled?: boolean; children?: ReactNode }

const state = vi.hoisted(() => ({
  calls: [] as string[],
  buttons: {} as Record<string, Captured>,
  selection: {} as Record<string, unknown>,
}))

vi.mock("next-intl", async () => {
  const ru = (await import("../../../../../messages/ru.json")).default as unknown as Record<
    string,
    Record<string, string>
  >
  return { useTranslations: (section: string) => (key: string) => ru[section]?.[key] ?? key }
})

vi.mock("@medusajs/ui", () => ({
  Button: (props: Captured & Record<string, unknown>) => {
    state.buttons[props["data-testid"] as string] = props
    return (
      <button data-testid={props["data-testid"] as string} disabled={props.disabled}>
        {props.children}
      </button>
    )
  },
}))

vi.mock("@lib/cart-store", () => ({
  useCart: () => ({ cart: null, queue: { add: () => undefined } }),
  useCartQueue: () => ({
    add: (variantId: string, delta: number) => state.calls.push(`add ${variantId} ${delta}`),
  }),
}))
vi.mock("@lib/cart-store/draft", () => ({ draftLineFor: () => ({}) }))
vi.mock("@lib/cart-store/queue", () => ({ quantityIn: () => 0 }))
vi.mock("@modules/layout/components/cart-sidebar/context", () => ({
  useCartSidebar: () => ({
    open: () => {
      state.calls.push("open sidebar")
      return true
    },
  }),
}))
vi.mock("@i18n/navigation", () => ({ useRouter: () => ({ push: () => state.calls.push("navigate") }) }))
vi.mock("@modules/products/components/product-selection", () => ({
  useProductSelection: () => state.selection,
}))
vi.mock("@modules/cart/components/cart-line-error", () => ({ default: () => null }))
vi.mock("@modules/products/components/in-cart-stepper", () => ({
  default: ({ addButton }: { addButton: ReactNode }) => <>{addButton}</>,
}))
vi.mock("@modules/products/components/in-cart-stepper/logic", () => ({ maxQuantity: () => 10 }))
vi.mock("../product-price", () => ({ default: () => null }))
vi.mock("./mobile-actions", () => ({ default: () => null }))

import ProductActions from "."

const variant = (id: string) =>
  ({ id, manage_inventory: false, options: [] }) as unknown as HttpTypes.StoreProductVariant

const product = {
  id: "prod_1",
  variants: [variant("variant_1"), variant("variant_2")],
} as unknown as HttpTypes.StoreProduct

const render = ({ chosen = "variant_1" as string | null } = {}) => {
  state.selection = {
    options: {},
    setOptionValue: () => undefined,
    selectedVariant: chosen ? variant(chosen) : undefined,
    isValidVariant: Boolean(chosen),
    detailsOpen: false,
    setPricedProduct: () => undefined,
  }
  return renderToStaticMarkup(
    <ProductActions product={product} region={{} as HttpTypes.StoreRegion} />
  )
}

beforeEach(() => {
  state.calls = []
  state.buttons = {}
})

describe("the buy box's buttons (item 5)", () => {
  it("has one button, «В корзину» on the card's whole width, and no «Купить»", () => {
    const html = render()

    expect(Object.keys(state.buttons)).toEqual(["add-product-button"])
    expect((state.buttons["add-product-button"].className ?? "").split(/\s+/)).toContain("w-full")
    expect(html).toContain(">В корзину<")
    expect(html).not.toContain("Купить")
  })

  it("puts the chosen variant in the cart and opens the cart sidebar, without leaving the page", () => {
    render()
    state.buttons["add-product-button"].onClick?.()

    expect(state.calls).toEqual(["add variant_1 1", "open sidebar"])
  })

  it("says «Выбрать вариант» while the choice is incomplete", () => {
    const html = render({ chosen: null })

    expect(state.buttons["add-product-button"].disabled).toBe(true)
    expect(html).toContain("Выбрать вариант")
  })
})
