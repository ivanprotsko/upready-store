import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { type FetchArgs, type FetchInput } from "@medusajs/js-sdk"
import { headers as nextHeaders } from "next/headers"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { resolveTenantByHost } from "@lib/tenant/resolve"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

/**
 * The SDK is built WITHOUT a publishable key on purpose (piece 9,
 * docs/multitenancy/storefront-by-host.md §2). One process serves every tenant,
 * so the key belongs to the REQUEST, not to the process: `src/middleware.ts`
 * resolves the shop from the Host header and puts its key on `x-tenant-key`,
 * and every fetch below reads it from there.
 *
 * `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` survives as the single-store fallback
 * for a host that resolves to no tenant — today's behaviour for a one-shop
 * deployment, unchanged.
 */
export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
})

const FALLBACK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

/**
 * The publishable key for THIS request. `headers()` throws outside a request
 * (a build-time prerender, a script), which is exactly when the env fallback is
 * the right answer, so the throw is the branch rather than an error.
 */
async function getPublishableKeyHeader(): Promise<Record<string, string>> {
  let host: string | null = null

  try {
    const requestHeaders = await nextHeaders()
    const tenantKey = decodeTenantHeaderValue(requestHeaders.get("x-tenant-key"))

    if (tenantKey) {
      return { "x-publishable-api-key": tenantKey }
    }

    host = requestHeaders.get("host")
  } catch {}

  /*
   * The middleware header is missing but the request still names a host: resolve
   * the shop the same way the middleware does. `GET /storefront/by-host` needs no
   * key itself (`lib/tenant/resolve.ts`) and answers from that module's own TTL
   * cache, so this costs nothing on the warm path.
   *
   * Why it exists: after `placeOrder()` redirects, the confirmation page rendered
   * WITHOUT `x-tenant-key`, and with `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`
   * deliberately unset on the multi-tenant deployment the fallback below was an
   * empty object — so the Store API answered 400 and the customer who had just
   * paid saw «Application error» (measured on the live stand 2026-09-14, three
   * orders in a row, digest 2524605575; any later visit to the same URL rendered
   * the order fine). This branch only ever runs where the old code returned no
   * key at all, so it can add no failure that was not already certain.
   */
  if (host) {
    try {
      const tenant = await resolveTenantByHost(MEDUSA_BACKEND_URL, host)

      if (tenant?.publishableKey) {
        return { "x-publishable-api-key": tenant.publishableKey }
      }
    } catch {}
  }

  return FALLBACK_PUBLISHABLE_KEY
    ? { "x-publishable-api-key": FALLBACK_PUBLISHABLE_KEY }
    : {}
}

const originalFetch = sdk.client.fetch.bind(sdk.client)

/**
 * Fetch without the ambient `x-medusa-locale` header, so the Store API answers
 * with the base records instead of a translation. Use it from routes that are
 * not locale-scoped (llms.txt, sitemap): there `getLocale()` would fall back to
 * the visitor's cookie, and whichever language happened to fill the cache would
 * be served to everyone.
 *
 * It still carries the tenant's publishable key: "not locale-scoped" does not
 * mean "not shop-scoped", and without the key the Store API answers 400.
 */
export const fetchWithoutLocale = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const keyHeader = await getPublishableKeyHeader()

  return originalFetch<T>(input, {
    ...init,
    headers: {
      ...keyHeader,
      ...(init?.headers ?? {}),
    },
  })
}

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  const keyHeader = await getPublishableKeyHeader()

  const newHeaders = {
    ...localeHeader,
    ...keyHeader,
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }
  return originalFetch(input, init)
}
