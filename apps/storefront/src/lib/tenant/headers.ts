/**
 * The request headers that carry the resolved tenant from `src/middleware.ts` to the
 * server components, and the one transform that makes them safe to carry.
 *
 * An HTTP header value is a ByteString: `Headers.set()` THROWS on any code point above
 * U+00FF. In Next's middleware that throw is not a missing header — it takes the whole
 * request with it, so the shop answers 500 on every path. Measured on the live deployment
 * 2026-09-12: a shop created through the onboarding wizard and named «Ночная лавка»
 * answered 500 at `https://nochlavka.shipshift.dev/` with
 * `TypeError: Cannot convert argument to a ByteString … value of 1053` (U+041D, «Н») in
 * `mt-storefront`'s log, while the backend's `/storefront/by-host` returned that tenant
 * and its publishable key perfectly.
 *
 * A tenant names itself in its own language, so the name is the field that breaks — but
 * the fix belongs to the CLASS, not to that one header (rule 20): every tenant value
 * crossing this boundary goes through `encodeTenantHeaderValue` on the way out and
 * `decodeTenantHeaderValue` on the way in. The pair is symmetric and total — ASCII
 * survives a round trip byte for byte (`pk_…`, a handle slug, a theme id), and a value
 * that is not valid percent-encoding decodes to itself instead of throwing.
 */

/**
 * Set by `src/middleware.ts` and by nothing else: whatever a visitor sends under these
 * names is deleted before ours are written, or a browser could ask for another shop's
 * catalog by typing a header.
 */
export const TENANT_HEADERS = [
  "x-tenant-key",
  "x-tenant-handle",
  "x-tenant-name",
  "x-tenant-theme",
  "x-tenant-mode",
  "x-tenant-origin",
  "x-tenant-attribution",
  "x-tenant-locales",
  "x-tenant-default-locale",
  "x-tenant-seo-verification",
  "x-tenant-branding",
] as const

export type TenantHeaderName = (typeof TENANT_HEADERS)[number]

/** Latin-1-safe form of a tenant value, for `Headers.set()`. Never throws. */
export function encodeTenantHeaderValue(value: string): string {
  return encodeURIComponent(value)
}

/** The value as the tenant wrote it. Null in, null out; malformed in, unchanged out. */
export function decodeTenantHeaderValue(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  try {
    return decodeURIComponent(value)
  } catch {
    // A header this process did not write (or one mangled in transit) is worth less than
    // a working page: hand back what arrived rather than throw inside a server component.
    return value
  }
}
