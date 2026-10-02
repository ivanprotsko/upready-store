"use server"

import type { HttpTypes } from "@medusajs/types"

import { cartDeliveryDays } from "@lib/util/delivery-estimate"
import type { DeliveryDays } from "@lib/util/fulfillment"

import { listCartShippingMethods } from "./fulfillment"

/**
 * The delivery term the cart sidebar quotes next to «Отправление № N» (batch 5),
 * asked for when the sidebar opens rather than on every page render: the shop's
 * options for a cart are a `no-store` request (`listCartShippingMethods`), too dear
 * for a header that renders on every page. The rule is `cartDeliveryDays`
 * (`lib/util/delivery-estimate.ts`): the method already on the cart, else the one
 * delivery option, else nothing.
 */
export async function getCartDeliveryDays(
  cartId: string,
  chosenOptionId: string | null
): Promise<DeliveryDays | null> {
  if (!cartId) return null
  const options = await listCartShippingMethods(cartId)
  const cart = {
    shipping_methods: chosenOptionId ? [{ shipping_option_id: chosenOptionId }] : [],
  } as unknown as Pick<HttpTypes.StoreCart, "shipping_methods">
  return cartDeliveryDays(cart, options)
}
