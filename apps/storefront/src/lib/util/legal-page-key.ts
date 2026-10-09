/**
 * The tenant page key behind a legal link (`legalHref` answers `/pages/<key>` for a
 * shop's own document), or `null` for any other address: a starter placeholder
 * route (`/terms`), an external URL. Only a tenant page opens over the checkout
 * (t-2026-10-09-56, Ivan's item 12); anything else stays an ordinary link.
 */
export const tenantPageKeyOf = (href: string | null | undefined): string | null => {
  const match = href?.match(/^\/pages\/([^/?#]+)$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
