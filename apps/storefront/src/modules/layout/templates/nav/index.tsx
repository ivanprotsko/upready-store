import { getEffectiveSettings } from "@lib/data/tenant-home"

import { DEFAULT_HEADER, DEMO_HEADER, NAV_VARIANTS } from "./variants"

/**
 * Site-wide header switch (`(main)/layout.tsx` renders this once, wrapping every route
 * under the group). Reads the one composition document that decides every visitor's
 * header — `store.metadata.storefrontSettings.header` — and dispatches to the matching
 * entry in `nav/variants/index.ts`. Self-contained and zero-prop, the same shape every
 * variant it dispatches to already has (`block-port-map.md` §9): `getEffectiveSettings()`
 * reads through Next's `force-cache` data cache tagged `"storefront-settings"`, so calling
 * it again from `footer/index.tsx` and `(main)/page.tsx` on the same request is a cache
 * hit, not a second round trip (Next's fetch request memoization, same URL + options).
 *
 * No saved settings (`panel-composition-mockup.md` §C1 "Absent" row) → `DEFAULT_HEADER`
 * ("h1"), today's baseline, unchanged.
 *
 * Tenant panel wave 2, piece 8: the read goes through `getEffectiveSettings()`
 * (`lib/data/tenant-home.ts`), which prefers the tenant's own home-page document when this
 * storefront's publishable key has a tenant behind it and is `getStorefrontSettings()`
 * otherwise — the five old stands are unaffected.
 */
export default async function Nav() {
  const settings = await getEffectiveSettings()
  // Branch-local demo (`redesign-olavka`): `DEMO_HEADER` outranks the saved composition so
  // the Figma header shows on every route of every shop served from this branch. See the
  // constant's own doc comment in `./variants/index.ts`; `null` there = today's behaviour.
  const header = DEMO_HEADER ?? settings?.header ?? DEFAULT_HEADER
  const Variant = NAV_VARIANTS[header] ?? NAV_VARIANTS[DEFAULT_HEADER]

  return <Variant />
}
