"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import type { HttpTypes } from "@medusajs/types"

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
