import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { HttpTypes } from "@medusajs/types"
import { NextIntlClientProvider } from "next-intl"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import CheckoutAddressRow from "."

/**
 * t-2026-10-12-05, Ivan 12.10 item 6.3: «на чекауте нужно сделать чтобы поля адреса не
 * отображались пока пользователь не авторизуется». Locked, the section is its muted heading and
 * one line; signed in, it is the form it always was.
 */

vi.mock("@modules/checkout/context/pickup-sheet-context", () => ({
  usePickupSheet: () => ({ openSheet: () => {} }),
}))

vi.mock("@modules/checkout/components/checkout-address-form", () => ({
  default: () => (
    <form data-testid="address-form">
      <input name="shipping_address.address_1" />
    </form>
  ),
}))

const messages = JSON.parse(
  readFileSync(join(__dirname, "../../../../../messages/ru.json"), "utf8")
)

const cart = {
  id: "cart_1",
  shipping_address: null,
  shipping_methods: [],
  metadata: {},
} as unknown as HttpTypes.StoreCart

const render = (locked: boolean) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <CheckoutAddressRow cart={cart} addresses={null} availableShippingMethods={[]} locked={locked} />
    </NextIntlClientProvider>
  )

describe("the address step before the sign-in", () => {
  it("shows a guest no field, only the muted heading and when it opens", () => {
    const html = render(true)
    expect(html).toContain('data-testid="checkout-address-locked"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain("Адрес доставки")
    expect(html).toContain("Адрес откроется после входа")
    expect(html).not.toContain("<input")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("address-form")
  })

  it("opens the form as before once the buyer is signed in", () => {
    const html = render(false)
    expect(html).toContain('data-testid="checkout-address-row"')
    expect(html).toContain('data-testid="address-form"')
    expect(html).not.toContain("checkout-address-locked")
  })
})
