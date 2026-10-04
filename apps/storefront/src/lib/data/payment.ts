"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import type { HttpTypes } from "@medusajs/types"
import type { RobokassaMethod } from "@lib/util/robokassa-methods"

/**
 * The payment methods THIS shop offers in this region.
 *
 * Read fresh, not from the data cache (i01-robokassa-checkout). The answer is
 * not a fact about the region alone: `GET /store/payment-providers` hides
 * Robokassa unless the shop behind the publishable key has an ENABLED account
 * (`apps/backend/src/api/store/payment-providers/route.ts`), so the list
 * changes the moment the owner saves or removes the account in the panel.
 *
 * The starter's `cache: "force-cache"` froze it instead, and nothing could
 * clear it: `getCacheOptions` builds the tag from `_medusa_cache_id`, a random
 * per-visitor UUID (`src/middleware.ts`), so no `revalidateTag` from
 * `app/api/revalidate` can ever name it. Measured on the stand 2026-09-16: the
 * owner saved the shop's Robokassa account in the panel, `GET
 * /store/payment-providers` answered with `pp_robokassa_robokassa`, and the
 * checkout kept offering «Manual payment» alone until the storefront process
 * was restarted.
 *
 * One small request per checkout render is the honest price; the checkout page
 * is a per-cart page and was never served from a shared cache anyway.
 */
export const listCartPaymentMethods = async (regionId: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("payment_providers")),
  }

  return sdk.client
    .fetch<HttpTypes.StorePaymentProviderListResponse>(
      `/store/payment-providers`,
      {
        method: "GET",
        query: { region_id: regionId },
        headers,
        next,
        cache: "no-store",
      }
    )
    .then(({ payment_providers }) =>
      payment_providers.sort((a, b) => {
        return a.id > b.id ? 1 : -1
      })
    )
    .catch((error) => {
      // A swallowed failure renders as «no payment methods», which reads like a
      // shop that configured none (rule 20a): say so in the server log.
      console.error(
        `[payment-providers] region=${regionId} could not be listed:`,
        error
      )
      return null
    })
}

/**
 * The factor to multiply the cart's own total by, for rule 5zd's pre-payment
 * notice («≈ <сумма>»). `null` when the backend has no reliable,
 * already-stamped rate to use (`tenant-legal/charge-estimate.ts`): the
 * notice then names the rate source with no sum, never a guess.
 *
 * Returning a FACTOR rather than a backend-computed amount is the fix for a
 * lead review (t-2026-10-03-32): the first version summed the cart's line
 * items on the backend, which skips shipping, a promotion and tax, so the
 * «≈» read lower than the real charge. The caller already holds the cart's
 * real total (`cart.total`, the same number `CheckoutTotals` renders) and
 * multiplies it by this factor itself.
 *
 * Called directly from the client (`CheckoutPaymentSection`, a server action,
 * the same way `initiatePaymentSession` is), because it has to re-run every
 * time the buyer switches to a method whose charge currency differs from the
 * cart's — a server parent re-rendering on every method click would be the
 * wrong trade.
 */
export const getChargeConversionFactor = async (
  cartId: string,
  currencyCode: string
): Promise<number | null> => {
  return sdk.client
    .fetch<{ currency_code: string; factor: number | null }>(
      `/store/payment-settings/charge-estimate`,
      {
        method: "POST",
        body: { cart_id: cartId, currency_code: currencyCode },
        cache: "no-store",
      }
    )
    .then(({ factor }) => factor)
    .catch((error) => {
      console.error(
        `[charge-estimate] cart=${cartId} currency=${currencyCode} could not be estimated:`,
        error
      )
      return null
    })
}

/**
 * The Robokassa methods this shop has enabled (t-2026-10-04-49), for the
 * checkout to list as rows of their own under «Способ оплаты». The backend
 * reads them from Robokassa's `GetCurrencies` and caches them
 * (`apps/backend/src/api/store/tenant/robokassa-methods/route.ts`), so this is
 * one cheap request per checkout render, fresh for the same reason
 * `listCartPaymentMethods` is.
 *
 * `null` when the backend could not answer; the checkout then lists card and
 * SBP (`robokassaMethodsForCart`).
 */
export const listRobokassaMethods = async (): Promise<RobokassaMethod[] | null> => {
  return sdk.client
    .fetch<{ methods: RobokassaMethod[] }>(`/store/tenant/robokassa-methods`, {
      method: "GET",
      cache: "no-store",
    })
    .then(({ methods }) => (Array.isArray(methods) ? methods : null))
    .catch((error) => {
      console.error("[robokassa-methods] could not be listed:", error)
      return null
    })
}
