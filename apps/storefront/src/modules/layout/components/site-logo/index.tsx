import type { TenantBranding } from "@lib/tenant/branding"

/**
 * The tenant's logo in the header (t16-owner-branding, step 3): the light
 * variant shows in light mode, the dark variant in dark mode, each falling
 * back to the other when only one was uploaded. `.site-logo-light`/
 * `.site-logo-dark` are the mode switch, defined once in `styles/globals.css`
 * next to the other `[data-mode]` rules.
 *
 * With no logo at all this renders the shop's short name, or the site name it
 * replaces — a tenant that configured nothing gets exactly the text node the
 * header already rendered, so the markup stays byte-identical.
 */
export default function SiteLogo({
  siteName,
  branding,
}: {
  siteName: string
  branding: TenantBranding
}) {
  const { logo_light_url: light, logo_dark_url: dark } = branding

  if (!light && !dark) {
    return <>{branding.shop_name_short || siteName}</>
  }

  const alt = branding.shop_name_short || siteName
  const imgClass = "h-8 w-auto max-w-[10rem] object-contain"

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
    <span className="inline-flex items-center h-8">
      {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
      <img src={light} alt={alt} className={`site-logo-light ${imgClass}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
      <img src={dark} alt={alt} className={`site-logo-dark ${imgClass}`} />
    </span>
  )
}
