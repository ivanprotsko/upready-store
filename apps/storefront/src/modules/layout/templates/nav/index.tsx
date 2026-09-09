import { getStorefrontSettings } from "@lib/data/storefront-settings"

import { DEFAULT_HEADER, NAV_VARIANTS } from "./variants"

/**
 * Site-wide header switch (`(main)/layout.tsx` renders this once, wrapping every route
 * under the group). Reads the one composition document that decides every visitor's
 * header — `store.metadata.storefrontSettings.header` — and dispatches to the matching
 * entry in `nav/variants/index.ts`. Self-contained and zero-prop, the same shape every
 * variant it dispatches to already has (`block-port-map.md` §9): `getStorefrontSettings()`
 * reads through Next's `force-cache` data cache tagged `"storefront-settings"`, so calling
 * it again from `footer/index.tsx` and `(main)/page.tsx` on the same request is a cache
 * hit, not a second round trip (Next's fetch request memoization, same URL + options).
 *
 * No saved settings (`panel-composition-mockup.md` §C1 "Absent" row) → `DEFAULT_HEADER`
 * ("h1"), today's baseline, unchanged.
 */
export default async function Nav() {
  const settings = await getStorefrontSettings()
  const header = settings?.header ?? DEFAULT_HEADER
  const Variant = NAV_VARIANTS[header] ?? NAV_VARIANTS[DEFAULT_HEADER]

  return <Variant />
}
