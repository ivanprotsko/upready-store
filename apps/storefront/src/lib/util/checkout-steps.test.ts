import { describe, expect, it } from "vitest"
import type { HttpTypes } from "@medusajs/types"

import {
  checkoutStepLocks,
  checkoutStepLocksOf,
  isAddressStepDone,
  isContactsStepDone,
  isShippingStepDone,
} from "@lib/util/checkout-steps"

/**
 * t-2026-10-09-56, Ivan's item 7: «нужно сделать, чтобы к следующему разделу нельзя
 * было перейти пока предыдущий не будет завершен». Each section opens once every
 * section before it is done, read off the cart.
 */

type Cart = HttpTypes.StoreCart
type Option = HttpTypes.StoreCartShippingOptionWithServiceZone

const address = {
  address_1: "ул. Ленина, 1",
  postal_code: "190000",
  city: "Санкт-Петербург",
  province: "Санкт-Петербург",
  country_code: "ru",
}

const courier = { id: "so_courier", provider_id: "manual_manual", data: {} } as unknown as Option
const pochta = {
  id: "so_pochta",
  provider_id: "pochta_pochta",
  data: { provider: "pochta" },
} as unknown as Option

const cart = (over: Partial<Record<string, unknown>> = {}): Cart =>
  ({
    id: "cart_1",
    items: [{ id: "i1", requires_shipping: true }],
    region: { countries: [{ iso_2: "ru" }] },
    shipping_address: null,
    shipping_methods: [],
    metadata: {},
    email: null,
    ...over,
  }) as unknown as Cart

const contacts = {
  contact_first_name: "Анна",
  contact_last_name: "Иванова",
}

describe("checkoutStepLocks", () => {
  it("opens the delivery only after the address, the contacts after both, the payment last", () => {
    const none = { signedIn: true, needsShipping: true, address: false, shipping: false, contacts: false }
    expect(checkoutStepLocks(none)).toEqual({
      address: false,
      shipping: true,
      contacts: true,
      payment: true,
    })
    expect(checkoutStepLocks({ ...none, address: true })).toEqual({
      address: false,
      shipping: false,
      contacts: true,
      payment: true,
    })
    expect(checkoutStepLocks({ ...none, address: true, shipping: true })).toEqual({
      address: false,
      shipping: false,
      contacts: false,
      payment: true,
    })
    expect(checkoutStepLocks({ ...none, address: true, shipping: true, contacts: true })).toEqual({
      address: false,
      shipping: false,
      contacts: false,
      payment: false,
    })
  })

  it("keeps a later section closed even when its own data is there", () => {
    // Contacts saved on an earlier visit do not open the payment before the address.
    expect(
      checkoutStepLocks({
        signedIn: true,
        needsShipping: true,
        address: false,
        shipping: true,
        contacts: true,
      })
    ).toEqual({ address: false, shipping: true, contacts: true, payment: true })
  })

  it("starts a cart with nothing to post at the contacts", () => {
    expect(
      checkoutStepLocks({
        signedIn: true,
        needsShipping: false,
        address: false,
        shipping: false,
        contacts: false,
      })
    ).toEqual({ address: false, shipping: false, contacts: false, payment: true })
  })

  // t-2026-10-12-05, Ivan 12.10 item 6.3: «поля адреса не отображались пока пользователь
  // не авторизуется». The sign-in is the first step: a guest opens nothing after it.
  it("locks every section for a guest, even on a cart that is otherwise complete", () => {
    const complete = { needsShipping: true, address: true, shipping: true, contacts: true }
    expect(checkoutStepLocks({ ...complete, signedIn: false })).toEqual({
      address: true,
      shipping: true,
      contacts: true,
      payment: true,
    })
    expect(checkoutStepLocks({ ...complete, signedIn: true })).toEqual({
      address: false,
      shipping: false,
      contacts: false,
      payment: false,
    })
  })

  it("locks the contacts of a cart with nothing to post until the sign-in", () => {
    expect(
      checkoutStepLocks({
        signedIn: false,
        needsShipping: false,
        address: false,
        shipping: false,
        contacts: true,
      })
    ).toEqual({ address: false, shipping: false, contacts: true, payment: true })
  })
})

describe("the step tests read off the cart", () => {
  it("counts an address done only when a carrier can post to it", () => {
    expect(isAddressStepDone(cart(), [courier])).toBe(false)
    expect(isAddressStepDone(cart({ shipping_address: { ...address, province: "" } }), [courier])).toBe(
      false
    )
    expect(isAddressStepDone(cart({ shipping_address: address }), [courier])).toBe(true)
  })

  it("keeps the address open on a Russian postcode that is not six digits (item 9: 80571)", () => {
    expect(
      isAddressStepDone(cart({ shipping_address: { ...address, postal_code: "80571" } }), [courier])
    ).toBe(false)
    expect(
      checkoutStepLocksOf(
        cart({ shipping_address: { ...address, postal_code: "80571" } }),
        [courier],
        true
      ).shipping
    ).toBe(true)
  })

  it("counts a Russian Post method done only with its point", () => {
    const withMethod = cart({
      shipping_address: address,
      shipping_methods: [{ shipping_option_id: "so_pochta", data: { provider: "pochta" } }],
    })
    expect(isShippingStepDone(withMethod, [courier, pochta])).toBe(false)
    const withPoint = cart({
      shipping_address: address,
      shipping_methods: [
        {
          shipping_option_id: "so_pochta",
          data: { provider: "pochta", pochta_point_index: "190000" },
        },
      ],
    })
    expect(isShippingStepDone(withPoint, [courier, pochta])).toBe(true)
    expect(
      isShippingStepDone(cart({ shipping_methods: [{ shipping_option_id: "so_courier" }] }), [courier])
    ).toBe(true)
  })

  it("counts an ApiShip pickup method done only with its point, a courier one at once (t-2026-10-14-58)", () => {
    const point = {
      id: "so_apiship_point",
      provider_id: "apiship_apiship",
      data: { provider_key: "cdek", kind: "pickup" },
    } as unknown as Option
    const door = {
      id: "so_apiship_door",
      provider_id: "apiship_apiship",
      data: { provider_key: "cdek", kind: "courier" },
    } as unknown as Option
    const method = (id: string, data: Record<string, unknown>) =>
      cart({ shipping_address: address, shipping_methods: [{ shipping_option_id: id, data }] })

    expect(
      isShippingStepDone(method("so_apiship_point", { provider: "apiship", apiship_point_id: null }), [point])
    ).toBe(false)
    expect(
      isShippingStepDone(method("so_apiship_point", { provider: "apiship", apiship_point_id: 491 }), [point])
    ).toBe(true)
    expect(
      isShippingStepDone(method("so_apiship_door", { provider: "apiship", apiship_point_id: null }), [door])
    ).toBe(true)
  })

  it("counts the contacts done on a name, a surname and a real e-mail", () => {
    expect(isContactsStepDone(cart({ metadata: contacts, email: "anna@" }))).toBe(false)
    expect(isContactsStepDone(cart({ metadata: contacts, email: "anna@example.ru" }))).toBe(true)
  })

  it("puts it together for one cart", () => {
    expect(
      checkoutStepLocksOf(
        cart({
          shipping_address: address,
          shipping_methods: [{ shipping_option_id: "so_courier" }],
          metadata: contacts,
          email: "anna@example.ru",
        }),
        [courier],
        true
      )
    ).toEqual({ address: false, shipping: false, contacts: false, payment: false })
  })
})
