import { getEffectiveSettings } from "@lib/data/tenant-home"
import FooterLegal from "@modules/layout/components/footer-legal"

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
 *
 * Tenant panel wave 2, piece 8: same swap as `nav/index.tsx` — `getEffectiveSettings()`
 * prefers the tenant's own home-page document and falls back to the stand's settings.
 */
export default async function Footer() {
  const settings = await getEffectiveSettings()
  const footer = settings?.footer ?? DEFAULT_FOOTER

  // The legal row (offer, privacy policy) is rendered here, under the variant,
  // and not inside each variant file: every variant, today's and the next one,
  // gets it the same way (audit 2026-09-23, B-01). It stays even when the shop
  // switched its footer off, because the privacy policy has to stay reachable.
  if (footer === "none") {
    return <FooterLegal />
  }

  const Variant = FOOTER_VARIANTS[footer] ?? FOOTER_VARIANTS[DEFAULT_FOOTER]

  return (
    <>
      <Variant />
      <FooterLegal />
    </>
  )
}
