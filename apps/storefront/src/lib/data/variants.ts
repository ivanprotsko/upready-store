"use server"

import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"

import { getAuthHeaders, getCacheOptions } from "./cookies"

export const retrieveVariant = async (
  variant_id: string
): Promise<HttpTypes.StoreProductVariant | null> => {
  // A guest reads a variant too. `/store/product-variants/:id` answers without a
  // session, and the header only goes along when there is one. There used to be
  // an `if (!authHeaders) return null` here that never fired, because
  // `getAuthHeaders()` answers `{}` for a guest. Do not turn it into a
  // `hasSession` check (t-2026-10-12-32).
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("variants")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  return await sdk.client
    .fetch<{ variant: HttpTypes.StoreProductVariant }>(
      `/store/product-variants/${variant_id}`,
      {
        method: "GET",
        query: {
          fields: "*images",
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ variant }) => variant)
    .catch(() => null)
}
