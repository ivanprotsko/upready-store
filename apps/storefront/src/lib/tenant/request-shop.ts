/**
 * Which shop a request is for, and which of its two addresses named it.
 *
 * One storefront process serves every tenant and tells them apart by the `Host`
 * header (`docs/multitenancy/storefront-by-host.md` §2). That holds for every
 * request a browser makes — and fails for one the SERVER makes to itself.
 *
 * Measured 2026-09-15 on the local MT stand (`ssshop.localhost:8043`, backend
 * :9031), placing an order through the checkout the way a buyer does:
 *
 *   [middleware] POST /ru/checkout        host=ssshop.localhost:8043
 *   [middleware] GET  /ru/order/…/confirmed
 *                                         host=localhost:8043
 *                                         x-forwarded-host=ssshop.localhost:8043
 *
 * `placeOrder` ends in `redirect()` inside a Server Action, and Next renders the
 * target by fetching ITSELF — `createRedirectRenderResult` in
 * `next/dist/server/app-render/action-handler.js` builds that URL from the
 * server's own origin (`initURL`, or `__NEXT_PRIVATE_ORIGIN`), so the `Host` of
 * that GET is the address the PROCESS listens on, never the shop's. The
 * visitor's address survives on `x-forwarded-host`, which the same function
 * forwards untouched along with the rest of the request's headers.
 *
 * With the shop unresolved, `src/middleware.ts` writes no `x-tenant-*` headers,
 * and the flight payload that reaches the buyer's browser is a page rendered for
 * NO shop: the build profile's theme on `<html>`, the build profile's name in
 * the header, another shop's promo terms, `© Upready` in the footer — measured
 * live on cherkashino.shipshift.dev (orders #5, #6) and reproduced locally.
 * Before `lib/data/site-wide.ts` turned the Store API's `400 Publishable API key
 * required` into a degraded render, the same render answered 500 (digest
 * 2524605575, `handoff/night-2026-09-14-tribute/REPORT.md`).
 *
 * The class is bigger than the confirmation page: every Server Action that ends
 * in `redirect()` renders its target through that self-fetch — `applyRegion`
 * and `signout` do too (`lib/data/cart.ts`, `lib/data/customer.ts`).
 *
 * Why the forwarded name is only a FALLBACK. `x-forwarded-host` is written by
 * whoever stands in front of us — traefik on the live deployment — but Next also
 * writes it from the `Host` when nothing else did, which means a request that
 * reaches the app directly can carry a value its own sender chose. So a request
 * whose `Host` already names a shop is answered by THAT shop and never looks at
 * the header: no visitor can move a request from one tenant to another. The
 * fallback runs only where the answer would otherwise be "no shop at all" — the
 * self-fetch, and hosts that resolve to nothing anyway.
 */

import { normalizeHost, type ResolvedTenant } from "./resolve"
import { forwardedHost } from "./origin"

export type ShopOfRequest = {
  /** The tenant, or null for a host with no shop behind it (single-store mode). */
  tenant: ResolvedTenant | null
  /**
   * The address that named the shop, port included — what every other host
   * decision of the request has to be made against: whether this is the shop's
   * main address (`primaryHostRedirect`) and what origin its absolute URLs are
   * built on (`x-tenant-origin`). The `Host` header when that resolved, the
   * forwarded name when it did not, and the `Host` header again when neither
   * names a shop.
   */
  host: string
}

/**
 * Resolve the shop of a request from its addresses. `resolve` is the lookup
 * itself (`resolveTenantByHost` bound to the backend URL), passed in so this
 * decision is testable without a backend and without Next's request objects.
 */
export async function resolveShopOfRequest(
  headers: Headers,
  resolve: (host: string) => Promise<ResolvedTenant | null>
): Promise<ShopOfRequest> {
  const host = (headers.get("host") ?? "").trim()
  const tenant = await resolve(host)

  if (tenant) {
    return { tenant, host }
  }

  const forwarded = forwardedHost(headers)

  if (!forwarded || normalizeHost(forwarded) === normalizeHost(host)) {
    return { tenant: null, host }
  }

  const forwardedTenant = await resolve(forwarded)

  return forwardedTenant
    ? { tenant: forwardedTenant, host: forwarded }
    : { tenant: null, host }
}
