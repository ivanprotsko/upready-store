import type { TenantBranding } from "@lib/tenant/branding"

/**
 * The tenant's mark for icon-sized slots (t-2026-09-12-medusa-mark-bottom-nav):
 * the shop's own logo if set, else a neutral badge with the shop name's first
 * letter — never a generic icon from someone else's icon set (`@medusajs/icons`'
 * `House`, the bottom nav's previous fallback), which is still not the shop's
 * own identity even though it isn't literally Medusa's logo file.
 *
 * `SiteLogo` (same branding, the header's own slot) falls back to the full
 * short name as text, which fits a header but not a ~20px round button; this
 * is that fallback's icon-sized sibling, not a replacement for it.
 */
export default function SiteMark({
  siteName,
  branding,
}: {
  siteName: string
  branding: TenantBranding
}) {
  const { logo_light_url: light, logo_dark_url: dark } = branding

  if (!light && !dark) {
    const name = branding.shop_name_short || siteName
    const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?"
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full border border-ui-border-base bg-ui-bg-subtle text-[11px] font-medium leading-none text-ui-fg-subtle"
      >
        {initial}
      </span>
    )
  }

  const alt = branding.shop_name_short || siteName
  const imgClass = "size-5 rounded-full object-contain"

  // Only one variant uploaded: show it in both modes, unconditionally — the
  // mode classes below only make sense once there is something to switch to.
  if (!light || !dark || light === dark) {
    const only = light ?? dark
    return (
      // eslint-disable-next-line @next/next/no-img-element -- SVG/PNG/WebP straight from tenant storage, no next/image domain/SVG config to carry.
      <img src={only as string} alt={alt} className={imgClass} />
    )
  }

  return (
    <span className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
      <img src={light} alt={alt} className={`site-logo-light ${imgClass}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
      <img src={dark} alt={alt} className={`site-logo-dark ${imgClass}`} />
    </span>
  )
}
