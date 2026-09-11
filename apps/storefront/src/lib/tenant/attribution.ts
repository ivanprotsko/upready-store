/**
 * The footer's attribution line as it travels from the backend to the page:
 * «создание интернет-магазина — upready», the anchor being a link to us
 * (`t-2026-09-12-footer-attribution`).
 *
 * The backend resolves it per shop — the shop's own override, then its group,
 * then the platform default (`api/storefront/by-host/attribution.ts`) — the
 * middleware carries it on `x-tenant-attribution`, and the footer renders what
 * arrives. Both readers live here so the "what counts as a usable line" rule is
 * written once: `src/lib/tenant/resolve.ts` reads the JSON body of `by-host`, and
 * `src/lib/data/attribution.ts` reads the header.
 */

export type TenantAttribution = {
  anchor: string
  href: string
  brand: string
  rel: string
}

/**
 * The single-store fallback: a stand that resolves no tenant gets no header, and
 * a footer still has to say who built the shop. It mirrors `ATTRIBUTION_FALLBACK`
 * in the backend on purpose — two deployments that cannot see each other need the
 * same line.
 */
export const ATTRIBUTION_FALLBACK: TenantAttribution = {
  anchor: process.env.ATTRIBUTION_ANCHOR || "создание интернет-магазина",
  href: process.env.ATTRIBUTION_HREF || "https://upready.dev",
  brand: process.env.ATTRIBUTION_BRAND || "upready",
  rel: process.env.ATTRIBUTION_REL || "noopener",
}

/**
 * All three of anchor, href and brand or nothing: a half-filled line («— upready»
 * with no anchor, or an anchor pointing nowhere) is worse than the fallback, and
 * returning null is what makes the caller use it. `rel` alone has a default,
 * because an empty `rel` is a valid link and not a broken line.
 */
export const readAttribution = (
  raw: Partial<TenantAttribution> | null | undefined
): TenantAttribution | null => {
  if (!raw?.anchor || !raw.href || !raw.brand) {
    return null
  }

  return {
    anchor: raw.anchor,
    href: raw.href,
    brand: raw.brand,
    rel: raw.rel || ATTRIBUTION_FALLBACK.rel,
  }
}

/**
 * The same, from the request header the middleware wrote. A header this process
 * cannot parse is not an error worth a 500: the shop still renders, with the
 * platform's own line.
 */
export const parseAttributionHeader = (
  raw: string | null | undefined
): TenantAttribution | null => {
  if (!raw) {
    return null
  }

  try {
    return readAttribution(JSON.parse(raw) as Partial<TenantAttribution>)
  } catch {
    return null
  }
}
