import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { HttpTypes } from "@medusajs/types"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CheckoutItemList from "."

/**
 * t-2026-10-12-05, Ivan 12.10 item 6.1: «На чекауте нельзя разрешать убирать товары из
 * заказа». The list shows what is bought and how many, as text, with no control to change it.
 */

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@modules/products/components/product-media", () => ({
  default: () => <span data-testid="product-media" />,
}))

vi.mock("@modules/layout/components/cart-sidebar/line", () => ({
  variantLabel: (item: { variant_title?: string | null }) => item.variant_title ?? null,
}))

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../../../messages/ru.json"), "utf8")
)

const line = (id: string, quantity: number) => ({
  id,
  title: "Тройчатка плюс",
  product_title: "Тройчатка плюс",
  product_handle: "troychatka",
  variant_title: "60 капсул",
  quantity,
  unit_price: 1355,
  total: 1355 * quantity,
  created_at: `2026-10-12T0${quantity}:00:00Z`,
  requires_shipping: true,
  variant: { product: { images: [] } },
})

const cart = {
  id: "cart_1",
  currency_code: "rub",
  items: [line("item_1", 2), line("item_2", 1)],
} as unknown as HttpTypes.StoreCart

const html = renderToStaticMarkup(
  <NextIntlClientProvider locale="ru" messages={messages}>
    <CheckoutItemList cart={cart} />
  </NextIntlClientProvider>
)

describe("the checkout's order list is read-only", () => {
  it("has no delete control and no quantity stepper", () => {
    expect(html).not.toContain("product-delete-button")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<input")
  })

  it("keeps how many as text, one per line", () => {
    expect(html.match(/data-testid="checkout-item-quantity"/g)).toHaveLength(2)
    expect(html).toContain("2 шт.")
    expect(html).toContain("1 шт.")
  })
})
