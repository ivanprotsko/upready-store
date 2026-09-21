"use server"

import { sdk } from "@lib/config"

const SELLER_TAG = "tenant-seller"

/** Who sells in this storefront: the public part of the shop's requisites. */
export type TenantSeller = {
  name: string | null
  legal_name: string | null
  inn: string | null
  ogrn: string | null
  legal_address: string | null
  phone: string | null
  email: string | null
}

let warnedUnreachable = false

/**
 * The seller block of the footer, from `GET /store/tenant/seller` (the shop's own
 * requisites row; the owner fills it once, in the panel). `null` when the backend does not
 * answer or the deployment has no tenant: the footer then renders without the block's rows
 * rather than failing the page.
 */
export async function getTenantSeller(): Promise<TenantSeller | null> {
  try {
    const { seller } = await sdk.client.fetch<{ seller: TenantSeller }>(`/store/tenant/seller`, {
      next: { tags: [SELLER_TAG] },
      cache: "force-cache",
    })
    return seller ?? null
  } catch (error) {
    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "getTenantSeller: /store/tenant/seller did not answer; the footer renders without the seller's contacts",
        error
      )
    }
    return null
  }
}
