"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cartHasStaleShipping } from "@lib/util/shipping-address"
import { mergeCartMetadata } from "@lib/util/cart-metadata"
import { type ErrorMessageKey, resolveErrorKey } from "@lib/util/error-messages"
import {
  describeUpstreamFailure,
  isGatewayFailure,
  retryOnGatewayFailure,
  upstreamStatus,
} from "@lib/util/upstream-retry"
import type { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect, unstable_rethrow } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  getCountryCode,
  removeCartId,
  setCartId,
  setCountryCode,
} from "./cookies"
import { getRegion, isShopRegion } from "./regions"
import { getLocale } from "./locale-actions"
import { defaultLocale } from "@i18n/config"
import { DEFAULT_REGION } from "@lib/util/env"

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(cartId?: string, fields?: string) {
  const id = cartId || (await getCartId())
  fields ??=
    // `+shipping_methods.data` (i02-apiship-cdek-shipping): the CDEK provider
    // writes the chosen pickup point, the tariff and the delivery term there,
    // and the checkout card prints them. Without this field the buyer picks a
    // point and the card never says which one — measured on the stand
    // 2026-09-16, the flow otherwise complete (radio selected, 185 ₽ in the
    // totals) and the point line simply absent.
    // `+items.product.metadata` (o24-courses): `*items.product` alone does not
    // reliably expand a JSON column, and the checkout's digital-cart check
    // (`isDigitalDeliveryCart`, `lib/util/shipping-address.ts`) reads
    // `product.metadata.digital` on every line to decide whether to show the
    // delivery step at all.
    "*items, *region, *items.product, +items.product.metadata, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name, +shipping_methods.data"

  if (!id) {
    return null
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("carts")),
  }

  /*
   * `cache: "no-store"`, not "force-cache". A cart is per-visitor state that
   * changes on almost every click, and Next's Data Cache is keyed by the
   * request (URL + options) while the invalidation TAG carries the visitor's
   * own `_medusa_cache_id` (lib/data/cookies.ts `getCacheTag`) — so one
   * visitor's cached response can be handed to another whose tag will never
   * clear it.
   *
   * What that cost, measured on the live stand 2026-09-14: with a cart that the
   * Store API returned complete (email, shipping and billing addresses, one
   * shipping method, a pending `pp_system_default` session), the checkout's own
   * React props held `email: false, billing: false, methods: 0, sessions: []`
   * — read off the fiber of the pay button. `PaymentButton`'s `notReady` is
   * computed from exactly those fields, so «Оплатить» stayed disabled forever
   * and NO order could be placed on any tenant shop.
   */
  return await retryOnGatewayFailure(
    `retrieveCart ${id}`,
    () =>
      sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
        method: "GET",
        query: {
          fields,
        },
        headers,
        next,
        cache: "no-store",
      }),
    { idempotent: true }
  )
    .then(({ cart }: { cart: HttpTypes.StoreCart }) => cart)
    .catch((error) => {
      // A 404 is a cart that is gone (completed or expired), answered as no cart.
      // Anything else is logged, because the checkout page turns a null cart into
      // a redirect to the cart page (t-2026-10-04-44).
      if (upstreamStatus(error) !== 404) {
        console.error(
          `[cart] retrieveCart ${id} failed with ${describeUpstreamFailure(error)}`
        )
      }
      return null
    })
}

/**
 * The visitor's cart with the server's clock at the moment the read began, for the
 * client queue (`lib/cart-store`, t-2026-10-03-66). A page renders this into its
 * props; the queue takes it only when it is newer than the cart it already has, so a
 * page the router restores from its cache cannot undo a click the server confirmed
 * since. `at` is taken BEFORE the read on purpose: a read that started before a
 * change landed must lose to the reply that reports that change.
 */
export async function retrieveCartSnapshot(): Promise<{
  cart: HttpTypes.StoreCart | null
  at: number
}> {
  const at = Date.now()
  return { cart: await retrieveCart().catch(() => null), at }
}

/**
 * Whether the backend answers 404 for this cart. `retrieveCart` answers null
 * for ANY failure, and a cookie dropped on a backend hiccup would cost a buyer
 * their cart, so the one status that means «gone» is asked for by name.
 */
const isCartGone = async (cartId: string): Promise<boolean> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch(`/store/carts/${cartId}`, {
      method: "GET",
      query: { fields: "id" },
      headers,
      cache: "no-store",
    })
    .then(() => false)
    .catch((error: { status?: number }) => error?.status === 404)
}

export async function getOrSetCart(countryCode?: string) {
  const cc = countryCode ?? (await getCountryCode()) ?? DEFAULT_REGION
  const region = await getRegion(cc)

  if (!region) {
    throw new Error(`Region not found for country code: ${cc}`)
  }

  let cart = await retrieveCart(undefined, "id,region_id")

  const headers = {
    ...(await getAuthHeaders()),
  }

  if (!cart) {
    const locale = await getLocale()
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id, locale: locale || undefined },
      {},
      headers
    )
    cart = cartResp.cart

    await setCartId(cart.id)

    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers)
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  return cart
}

/**
 * The metadata the backend holds for this cart right now, for `updateCart` to
 * merge a patch into (`mergeCartMetadata`). A failed read throws: writing the
 * patch alone would erase every other key, which is the bug this read exists
 * to prevent (t-2026-10-04-48).
 */
const readServerMetadata = async (
  cartId: string,
  headers: Record<string, string>
): Promise<Record<string, unknown> | null> =>
  retryOnGatewayFailure(
    `readServerMetadata ${cartId}`,
    () =>
      sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
        method: "GET",
        query: { fields: "id,metadata" },
        headers,
        cache: "no-store",
      }),
    { idempotent: true }
  ).then(({ cart }) => (cart.metadata ?? null) as Record<string, unknown> | null)

/**
 * Writes `data` onto the visitor's cart. `data.metadata` is a PATCH: only the
 * keys a caller names change, everything else stays as the backend has it
 * (`@lib/util/cart-metadata`). Send your own keys only, never a spread of a
 * `cart.metadata` you rendered earlier, or its stale values win again.
 */
export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const payload: HttpTypes.StoreUpdateCart = data.metadata
    ? {
        ...data,
        metadata: mergeCartMetadata(
          await readServerMetadata(cartId, headers).catch(medusaError),
          data.metadata
        ),
      }
    : data

  return sdk.store.cart
    .update(cartId, payload, {}, headers)
    .then(async ({ cart }: { cart: HttpTypes.StoreCart }) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode?: string
}) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when updating line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when updating line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when deleting line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when deleting line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .deleteLineItem(cartId, lineId, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)

  // The removed line may have been the last one with anything to post
  // (t-2026-10-04-23).
  await dropShippingIfNothingToShip(await retrieveCart(cartId))
}

/**
 * Takes a stale shipping method off a cart that has nothing left to post
 * (t-2026-10-04-23, `cartHasStaleShipping`), through the backend's
 * `POST /store/carts/:id/drop-shipping` — the Store API has no DELETE for a
 * shipping method. Called after a line is removed or changed
 * (`cart-lines.ts` `syncCartLines`) and by the checkout's
 * `api/checkout/digital-delivery` route before the payment step renders, so the
 * course is not charged shipping and place-order does not fail on the address
 * guard. Answers whether anything was dropped; a refusal is logged with the cart
 * id and the cart is left as it was.
 */
export async function dropShippingIfNothingToShip(
  cart?: HttpTypes.StoreCart | null
): Promise<boolean> {
  if (!cart || !cartHasStaleShipping(cart)) {
    return false
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  try {
    await sdk.client.fetch(`/store/carts/${cart.id}/drop-shipping`, {
      method: "POST",
      headers,
    })
  } catch (error) {
    console.error(
      `dropShippingIfNothingToShip: cart ${cart.id} kept its shipping method: ${
        (error as { message?: string })?.message ?? error
      }`
    )
    return false
  }

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  return true
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
  data,
}: {
  cartId: string
  shippingMethodId: string
  /**
   * Handed to the provider's `validateFulfillmentData` and stored on the
   * cart's shipping method. A CDEK pickup method needs `cdek_point_code` here
   * (i02-apiship-cdek-shipping); every other method sends nothing.
   */
  data?: Record<string, unknown>
}) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .addShippingMethod(
      cartId,
      data
        ? { option_id: shippingMethodId, data }
        : { option_id: shippingMethodId },
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
    })
    .catch(medusaError)
}

/**
 * Creates the cart's payment session, retried once when the proxy in front of the
 * Store API answers 502 or 503 (t-2026-10-04-44, `lib/util/upstream-retry.ts`).
 * Creating a session replaces the current one, so a second call is safe when it
 * runs AFTER the first has failed. Whatever the first call left behind, the retry
 * replaces it, and its answer is the one the page gets through the revalidated
 * cart. Two calls in flight at once are a different case, kept out by
 * `CheckoutPaymentSection`'s `initiatingRef`.
 */
async function createPaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const resp = await retryOnGatewayFailure(
    `initiatePaymentSession cart=${cart.id} provider=${data.provider_id}`,
    () => sdk.store.payment.initiatePaymentSession(cart, data, {}, headers),
    { idempotent: false }
  )

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  return resp
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  return createPaymentSession(cart, data).catch(medusaError)
}

/**
 * `initiatePaymentSession` for the checkout's payment block (t-2026-10-04-44). A
 * thrown server action answers HTTP 500 and reaches the browser redacted, so a
 * proxy's 502 used to end as «Что-то пошло не так» under the payment methods. A
 * failure comes back as an `Errors` key instead. `paymentNotReady` stands for an
 * upstream that did not answer after the retry, and the block offers a retry
 * button for it. Every failure is logged with the cart, the provider and the status.
 */
export async function initiatePaymentSessionOrReason(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
): Promise<{ error: ErrorMessageKey } | null> {
  try {
    await createPaymentSession(cart, data)
    return null
  } catch (error) {
    console.error(
      `[checkout:payment-session] cart=${cart.id} provider=${data.provider_id} failed with ${describeUpstreamFailure(error)}`
    )

    return {
      error: isGatewayFailure(error, { idempotent: true })
        ? "paymentNotReady"
        : resolveErrorKey(error),
    }
  }
}

export async function applyPromotions(codes: string[]) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, { promo_codes: codes }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function applyGiftCard(_code: string) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function removeDiscount(_code: string) {
  // const cartId = getCartId()
  // if (!cartId) return "No cartId cookie found"
  // try {
  //   await deleteDiscount(cartId, code)
  //   revalidateTag("cart")
  // } catch (error: any) {
  //   throw error
  // }
}

export async function removeGiftCard(
  _codeToRemove: string,
  _giftCards: unknown[]
  // giftCards: GiftCard[]
) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, {
  //       gift_cards: [...giftCards]
  //         .filter((gc) => gc.code !== codeToRemove)
  //         .map((gc) => ({ code: gc.code })),
  //     }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get("code") as string
  try {
    await applyPromotions([code])
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

type AddressPayload = Partial<{
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  company: string
  postal_code: string
  city: string
  country_code: string
  province: string
  phone: string
}>

export type SetAddressesInput = {
  shipping_address?: AddressPayload
  email?: string
  same_as_billing?: boolean
}

const ADDRESS_FIELDS = [
  "first_name",
  "last_name",
  "address_1",
  "address_2",
  "company",
  "postal_code",
  "city",
  "country_code",
  "province",
  "phone",
] as const

const mergeAddress = (
  current: AddressPayload,
  patch: AddressPayload = {}
): AddressPayload =>
  ADDRESS_FIELDS.reduce<AddressPayload>((address, field) => {
    const value = patch[field] ?? current[field]
    if (value != null) {
      address[field] = value
    }
    return address
  }, {})

const isSameAddress = (a: AddressPayload, b: AddressPayload) =>
  Boolean(a.address_1) &&
  a.address_1 === b.address_1 &&
  a.postal_code === b.postal_code &&
  a.city === b.city &&
  a.country_code === b.country_code

export async function setAddresses(input: SetAddressesInput) {
  try {
    const cartId = await getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const cart = await retrieveCart(
      cartId,
      "*shipping_address, *billing_address"
    )
    const currentShipping = (cart?.shipping_address ?? {}) as AddressPayload
    const currentBilling = (cart?.billing_address ?? {}) as AddressPayload

    const shippingAddress = mergeAddress(
      currentShipping,
      input.shipping_address
    )

    const data: HttpTypes.StoreUpdateCart = {
      shipping_address: shippingAddress,
    }

    if (input.email?.trim()) {
      data.email = input.email
    }

    if (
      input.same_as_billing ||
      isSameAddress(currentShipping, currentBilling)
    ) {
      data.billing_address = shippingAddress
    }

    await updateCart(data)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Places an order for a cart. If no cart ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to place an order for.
 * @returns The cart object if the order was successful, or null if not.
 */
/**
 * Asks the backend to complete the cart. Answers the confirmation page's path
 * once the cart is an order (the cart cookie is gone by then), or the cart as
 * it still is. A refusal throws, as `medusaError` words it.
 */
async function completeCart(
  id: string
): Promise<{ confirmedPath: string } | { cart: HttpTypes.StoreCart }> {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return cartRes
    })
    .catch(medusaError)

  if (cartRes?.type === "order") {
    const [orderCacheTag, locale] = await Promise.all([
      getCacheTag("orders"),
      getLocale(),
    ])
    revalidateTag(orderCacheTag)

    removeCartId()
    /*
     * `order_token` rides along with the completion response
     * (`api/store/cart-scope.ts` attachOrderAccessToken). Since
     * b07-store-api-isolation the Store API refuses `GET /store/orders/:id` to
     * anyone who is neither the order's owner nor holding this token, and a
     * guest buyer is neither logged in nor anything else — so the token has to
     * travel to the confirmation page in the URL, the way the order link in
     * the email does. A buyer who IS logged in reaches the same page through
     * their session, and the parameter is simply unused.
     */
    const orderToken = (cartRes as { order_token?: string }).order_token
    const confirmedPath = `/${locale ?? defaultLocale}/order/${
      cartRes?.order.id
    }/confirmed`
    return {
      confirmedPath: orderToken
        ? `${confirmedPath}?token=${encodeURIComponent(orderToken)}`
        : confirmedPath,
    }
  }

  return { cart: cartRes.cart }
}

export async function placeOrder(cartId?: string) {
  const id = cartId || (await getCartId())

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const result = await completeCart(id)

  if ("confirmedPath" in result) {
    redirect(result.confirmedPath)
  }

  return result.cart
}

/**
 * One look from the Robokassa waiting page (`[locale]/payment-return`,
 * t-2026-10-04-48) at whether the payment turned the cart into an order. The
 * cart is the one `app/api/payment-return` put into the cookie. Completing it
 * succeeds only after the Result webhook confirmed the payment (the provider
 * answers PENDING before that), and a cart the webhook already completed
 * answers with its order, so asking again is safe. `order` carries the
 * confirmation page's path; `pending` is any refusal, the page asks again;
 * `no_cart` is a visitor with no cart cookie at all.
 */
export async function checkPaymentReturn(): Promise<
  | { status: "order"; href: string }
  | { status: "pending" }
  | { status: "no_cart" }
> {
  const cartId = await getCartId()

  if (!cartId) {
    return { status: "no_cart" }
  }

  try {
    const result = await completeCart(cartId)
    return "confirmedPath" in result
      ? { status: "order", href: result.confirmedPath }
      : { status: "pending" }
  } catch {
    return { status: "pending" }
  }
}

/**
 * `placeOrder` for the pay buttons (t-2026-10-04-23, rule 5ze item 3). A message
 * thrown from a server action reaches the browser as Next's redacted «An error
 * occurred in the Server Components render» in a production build, so every
 * refusal the backend gave — an incomplete address, a missing shipping method —
 * ended on «Что-то пошло не так». The reason is answered as an `Errors` key
 * instead, and the backend's own text is logged with the cart id, known or not.
 * A placed order still ends in `redirect()`, which is passed through.
 */
export async function placeOrderOrReason(): Promise<{
  error: ErrorMessageKey
} | null> {
  const cartId = await getCartId()

  try {
    await placeOrder(cartId)
    return null
  } catch (error) {
    unstable_rethrow(error)

    const message = (error as { message?: string })?.message ?? String(error)
    console.error(`placeOrder: cart ${cartId ?? "?"} was refused: ${message}`)

    return { error: resolveErrorKey(message) }
  }
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
/**
 * Moves the shop — and the open cart — to the region that serves `countryCode`,
 * which is what actually changes the currency: a region carries its own price
 * rows, so nothing is converted in the markup.
 *
 * `explicit` says whether the visitor PICKED this country (the country switcher)
 * or the storefront derived it for them (switching the language on a deployment
 * that maps locales to countries — `@lib/geolocation/locale-country`). Only a
 * pick is remembered as a choice; see `setCountryCode`.
 *
 * A country outside the shop's own regions (`isShopRegion`, N9) changes
 * nothing: the switcher no longer offers one, so only a stale page or a forged
 * call asks for it, and moving there would price the shop in a currency it
 * has no prices in.
 */
export async function applyRegion(
  countryCode: string,
  { explicit = true }: { explicit?: boolean } = {}
) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (!(await isShopRegion(region.id))) {
    return
  }

  await setCountryCode(countryCode, { explicit })

  const existingCart = cartId
    ? await retrieveCart(cartId, "*shipping_address")
    : null

  // A stale cookie: the cart it names is gone from the backend (a database
  // reset, a cart of another environment). The update below used to throw on
  // it and take the country switch down. The cookie is dropped, so the next
  // add to cart creates a fresh cart in the new region.
  const cartIsGone =
    Boolean(cartId) && !existingCart && (await isCartGone(cartId as string))

  if (cartIsGone) {
    await removeCartId()
  }

  if (cartId && !cartIsGone) {
    const addr = existingCart?.shipping_address
    const countryChanged =
      Boolean(addr?.country_code) && addr?.country_code !== countryCode

    await updateCart({
      region_id: region.id,
      shipping_address: {
        ...(addr?.first_name && { first_name: addr.first_name }),
        ...(addr?.last_name && { last_name: addr.last_name }),
        ...(addr?.phone && { phone: addr.phone }),
        ...(countryChanged
          ? {
              address_1: "",
              address_2: "",
              city: "",
              postal_code: "",
              province: "",
              company: "",
            }
          : {
              ...(addr?.address_1 && { address_1: addr.address_1 }),
              ...(addr?.address_2 && { address_2: addr.address_2 }),
              ...(addr?.city && { city: addr.city }),
              ...(addr?.postal_code && { postal_code: addr.postal_code }),
              ...(addr?.province && { province: addr.province }),
              ...(addr?.company && { company: addr.company }),
            }),
        country_code: countryCode,
      },
    })
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  const regionCacheTag = await getCacheTag("regions")
  revalidateTag(regionCacheTag)

  const productsCacheTag = await getCacheTag("products")
  revalidateTag(productsCacheTag)
}

/**
 * The country switcher: the visitor picked a country, so this is an explicit
 * choice, and the page they were on is re-rendered under the new region.
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  await applyRegion(countryCode, { explicit: true })

  redirect(currentPath)
}

export async function listCartOptions() {
  const cartId = await getCartId()
  const headers = {
    ...(await getAuthHeaders()),
  }
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  })
}
