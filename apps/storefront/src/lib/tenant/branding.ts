/**
 * The tenant's brand identity as it travels from the backend to the page
 * (t16-owner-branding): logo (light/dark), favicon, og image, primary colour
 * and the footer credit line. The backend resolves it per shop
 * (`api/storefront/by-host/route.ts`, `api/tenants/branding/branding.ts`), the
 * middleware carries it on `x-tenant-branding`, and every consumer here reads
 * what arrives — the same split `attribution.ts` already uses.
 */

export type TenantFooterCredit = {
  enabled: boolean
  text: string
  href: string | null
}

export type TenantBranding = {
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  primary_color: string | null
  /** Whichever of white/black text the backend picked for readability on `primary_color`. */
  primary_foreground: "#ffffff" | "#000000" | null
  /** True when even the better foreground fails WCAG AA on `primary_color`. */
  low_contrast: boolean
  shop_name_short: string | null
  footer_credit: TenantFooterCredit | null
}

/** A tenant that configured nothing: the storefront then renders exactly as it does today. */
export const EMPTY_BRANDING: TenantBranding = {
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  og_image_url: null,
  primary_color: null,
  primary_foreground: null,
  low_contrast: false,
  shop_name_short: null,
  footer_credit: null,
}

/** From the request header the middleware wrote. Malformed JSON is not a 500 — the
 * shop still renders with no branding, the same posture `parseAttributionHeader` takes. */
export const parseBrandingHeader = (raw: string | null | undefined): TenantBranding | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TenantBranding>
    return { ...EMPTY_BRANDING, ...parsed }
  } catch {
    return null
  }
}
