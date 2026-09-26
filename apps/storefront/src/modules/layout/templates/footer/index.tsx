import { isOlavkaShop } from "@lib/data/olavka-shop"
import { getEffectiveSettings } from "@lib/data/tenant-home"
import FooterLegal from "@modules/layout/components/footer-legal"

import { DEFAULT_FOOTER, FOOTER_VARIANTS } from "./variants"
import FooterOlavka from "./variants/olavka"

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
  const [settings, olavka] = await Promise.all([getEffectiveSettings(), isOlavkaShop()])
  const footer = settings?.footer ?? DEFAULT_FOOTER

  // The legal row (offer, privacy policy) is rendered here, under the variant,
  // and not inside each variant file: every variant, today's and the next one,
  // gets it the same way (audit 2026-09-23, B-01). It stays even when the shop
  // switched its footer off, because the privacy policy has to stay reachable.
  if (footer === "none") {
    return <FooterLegal />
  }

  // BRANCH-LOCAL (redesign-olavka, Ivan's remarks 13 and 19): the Olavka shop's own footer
  // (`OLAVKA_SHOP_HANDLES`) and no legal row under it — its «© shop» column already links the
  // offer and the privacy policy from every page, the row only repeated them.
  if (olavka) {
    return <FooterOlavka />
  }

  const Variant = FOOTER_VARIANTS[footer] ?? FOOTER_VARIANTS[DEFAULT_FOOTER]

  return (
    <>
      <Variant />
      <FooterLegal />
    </>
  )
}
