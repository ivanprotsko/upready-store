"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders, getCacheOptions, getCacheTag } from "./cookies"
import type { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"

export const retrieveOrder = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`, {
      method: "GET",
      query: {
        // +metadata: the pickup point a checkout wrote onto the order (fulfillment.ts
        // getOrderPickupPoint). +canceled_at and the three fulfillment timestamps feed
        // the account order-timeline (W17) — none of the five are in
        // defaultStoreRetrieveOrderFields, so a bare add is required; every other field
        // already reaches this response through that default set.
        fields:
          // +fulfillments.labels / +fulfillments.metadata: the tracking number and
          // the carrier the shop owner typed on the shipment (t04-shipping-tariffs),
          // shown under the account order-timeline.
          "*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product,+metadata,+canceled_at,+fulfillments.packed_at,+fulfillments.shipped_at,+fulfillments.delivered_at,*fulfillments.labels,+fulfillments.metadata",
      },
      headers,
      next,
      /*
       * `no-store`, for the same reason the cart is not cached: an order is one
       * customer's data. On this stack there is a second, sharper edge — the
       * tenant's publishable key is taken from the REQUEST headers
       * (`lib/config.ts` getPublishableKeyHeader), and a cached fetch that Next
       * runs outside a request context has none: `headers()` throws, the env
       * fallback `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is deliberately unset on
       * the multi-tenant deployment, and the Store API answers 400.
       *
       * Measured 2026-09-14 on the live stand: a customer who had just paid
       * landed on «Application error … Digest: 2524605575», and the storefront
       * log carried `Publishable API key required in the request header`. It
       * reproduced on two separate orders, so it is not a restart race.
       */
      cache: "no-store",
    })
    .then(({ order }) => order)
    .catch((err) => medusaError(err))
}

export const listOrders = async (
  limit: number = 10,
  offset: number = 0,
  filters?: Record<string, unknown>
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`, {
      method: "GET",
      query: {
        limit,
        offset,
        order: "-created_at",
        // *shipping_methods: the order card's pickup/courier line (W17) needs the
        // chosen method's name and amount; defaultStoreOrderFields already carries
        // metadata (the pickup point), so only this relation is new here.
        fields: "*items,+items.metadata,*items.variant,*items.product,*shipping_methods",
        ...filters,
      },
      headers,
      next,
      cache: "no-store",
    })
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
}

export const createTransferRequest = async (
  state: {
    success: boolean
    error: string | null
    order: HttpTypes.StoreOrder | null
  },
  formData: FormData
): Promise<{
  success: boolean
  error: string | null
  order: HttpTypes.StoreOrder | null
}> => {
  // The customer only ever sees the display number, so the id reaches them as
  // a link in the order email. Accept the whole link as readily as a bare id
  // rather than making them dissect the URL.
  const raw = String(formData.get("order_id") ?? "").trim()
  const id = /order_[A-Za-z0-9]+/.exec(raw)?.[0] ?? raw

  if (!id) {
    return { success: false, error: "Order ID is required", order: null }
  }

  const headers = await getAuthHeaders()

  return await sdk.store.order
    .requestTransfer(
      id,
      {},
      {
        fields: "id, email",
      },
      headers
    )
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

const revalidateOrdersCache = async () => {
  const ordersCacheTag = await getCacheTag("orders")
  if (ordersCacheTag) revalidateTag(ordersCacheTag)

  const customersCacheTag = await getCacheTag("customers")
  if (customersCacheTag) revalidateTag(customersCacheTag)
}

export type ClaimOrdersState = {
  /** null while the form has not been submitted, a number once it has. */
  claimed: number | null
  error: string | null
}

/**
 * Attaches the orders this shop holds under the logged-in customer's own email
 * to their account, and returns how many moved.
 *
 * The buyer who checks out as a guest and registers afterwards is the case
 * this exists for: Medusa hangs the guest order on an account-less customer
 * row, `GET /store/orders` filters by `customer_id`, and the account is empty
 * (f03-guest-order-not-in-account). The backend decides what may move; nothing
 * about the address or the shop is sent from here, because both are read from
 * the session and the publishable key server-side.
 *
 * Zero claimed is a real answer and says so on the screen. It is never
 * reported as a success with no number, because "nothing was found for your
 * address" and "the call failed" have to look different to the person reading
 * it (rule 20a).
 */
export const claimGuestOrders = async (): Promise<ClaimOrdersState> => {
  const headers = await getAuthHeaders()

  if (!headers) {
    return { claimed: null, error: "unauthorized" }
  }

  try {
    const { claimed } = await sdk.client.fetch<{ claimed: number }>(
      `/store/customers/me/claim-orders`,
      {
        method: "POST",
        headers,
        cache: "no-store",
      }
    )

    if (claimed > 0) {
      await revalidateOrdersCache()
    }

    return { claimed, error: null }
  } catch (error) {
    console.error("[claimGuestOrders]", error)
    return { claimed: null, error: String(error) }
  }
}

/**
 * The form action behind the "find my orders" button on the account orders
 * screen. Submitting it re-renders the route, so a claimed order is in the
 * list by the time the message is on screen.
 */
export const claimGuestOrdersAction = async (
  _state: ClaimOrdersState,
  _formData: FormData
): Promise<ClaimOrdersState> => {
  return await claimGuestOrders()
}

export const acceptTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .acceptTransfer(id, { token }, {}, headers)
    .then(async ({ order }) => {
      await revalidateOrdersCache()
      return { success: true, error: null, order }
    })
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

export const declineTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .declineTransfer(id, { token }, {}, headers)
    .then(async ({ order }) => {
      await revalidateOrdersCache()
      return { success: true, error: null, order }
    })
    .catch((err) => ({ success: false, error: err.message, order: null }))
}
