import { getStorefrontSettings } from "@lib/data/storefront-settings"

import { DEFAULT_FOOTER, FOOTER_VARIANTS } from "./variants"

/**
 * Site-wide footer switch (`(main)/layout.tsx` renders this once, wrapping every route
 * under the group, mirroring `nav/index.tsx`). Reads
 * `store.metadata.storefrontSettings.footer` and dispatches to the matching entry in
 * `footer/variants/index.ts`; `footer === "none"` renders nothing, the same
 * self-suppressing idiom `ProfileHero`/`CategoryTiles` already use rather than a caller
 * gating the render from outside.
 *
 * No saved settings (`panel-composition-mockup.md` §C1 "Absent" row) → `DEFAULT_FOOTER`
 * ("f1"), today's baseline, unchanged.
 */
export default async function Footer() {
  const settings = await getStorefrontSettings()
  const footer = settings?.footer ?? DEFAULT_FOOTER

  if (footer === "none") {
    return null
  }

  const Variant = FOOTER_VARIANTS[footer] ?? FOOTER_VARIANTS[DEFAULT_FOOTER]

  return <Variant />
}
