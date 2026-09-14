"use server"

import { profile, promoText } from "@lib/profile"

import { getTenantHandle } from "./cookies"

/**
 * Copy of the profile baked into this image, for the shop that is being served.
 *
 * One process serves many shops by Host, and the build profile is a FALLBACK for a
 * single-store deployment, never a tenant's voice: with `promoText()` read straight
 * from the profile, every shop on shipshift.dev promised "Free shipping over $120 ·
 * 30-day returns · every pair ships in 48 hours" in its footer — a kitchenware shop
 * and a wizard-created shop with an empty catalog included, in English under a
 * Russian catalog (measured 2026-09-12 on globex, nochlavka, acme `/ru`).
 *
 * A shop that says nothing beats a shop that promises another shop's terms, so a
 * resolved tenant gets null from both readers; a per-shop strip and tagline are fields
 * the tenant document does not have yet. A single-store stand keeps its profile copy.
 * `(main)/layout.tsx` applies the same rule to the site-wide promo banner.
 */
export async function shopPromoText(locale: string): Promise<string | null> {
  if ((await getTenantHandle()) !== null) {
    return null
  }
  return promoText(locale)
}

export async function shopTagline(): Promise<string | null> {
  if ((await getTenantHandle()) !== null) {
    return null
  }
  return profile.brand?.tagline ?? null
}
