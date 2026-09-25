import "server-only"
import { cache } from "react"

import type { PricingPayload } from "@lib/platform-pricing/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

/**
 * The platform pricing page from `GET /platform/pricing` (t-2026-09-25-08).
 *
 * A plain fetch and not the SDK: the route lives outside `/store`, and a
 * platform host has no publishable key to send. `no-store`, so a save in the
 * admin shows on the next request without a rebuild or a revalidation call.
 * `cache()` shares one answer between `generateMetadata` and the page.
 *
 * Null when the backend says the page was never filled in (404); a throw for
 * anything else, because a pricing page drawn from a failed read would be a
 * page of wrong prices.
 */
export const getPlatformPricing = cache(async (): Promise<PricingPayload | null> => {
  const response = await fetch(`${BACKEND_URL}/platform/pricing`, { cache: "no-store" })

  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`GET /platform/pricing answered ${response.status}`)
  }

  return (await response.json()) as PricingPayload
})
