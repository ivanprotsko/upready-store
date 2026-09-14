/**
 * Reads that the SITE-WIDE chrome makes: the nav's category tree, the footer's
 * link lists, the region switcher. Every route under `(main)` renders that
 * chrome, so a read made there is made on the cart, on the checkout and on the
 * order confirmation as well.
 *
 * The rule those reads follow is already written in `tenant-pages.ts`: "Never
 * throw into a layout render over a footer link list." A read that breaks it
 * does not degrade one strip of the page, it replaces the whole page with
 * `Application error: a client-side exception has occurred`, and the customer
 * who was reading the page loses whatever it was showing them.
 *
 * Measured on this stack, 2026-09-15: a request the storefront could not tie to
 * a shop carries no publishable key, `/store/tenant/product-categories` answers
 * `400 Publishable API key required`, `fetchTenantCategories` rethrew it because
 * it is not a 404, and `/{locale}/order/{id}/confirmed` answered 500 — a buyer
 * seeing a stack trace at the moment their card was charged, while the order
 * itself had been placed and the page's own order read was fine.
 *
 * This module is that rule as code, so a new site-wide read has one obvious
 * thing to call rather than its own `try`.
 */

/** The message the Store API answers with when a request carries no publishable key. */
const NO_KEY_MESSAGE = /publishable api key/i

type HttpishError = { status?: number; message?: string }

/**
 * True when the failure is "this request could not name a shop", rather than
 * anything about the data being read. Its own status, because it is the one
 * failure on this deployment that is a configuration or resolution fault and
 * not a backend fault, and because it used to travel as a bare
 * `Error: Publishable API key required` with no hint of where the key comes
 * from.
 */
export function isNoShopError(error: unknown): boolean {
  const { status, message } = (error ?? {}) as HttpishError

  return status === 400 && NO_KEY_MESSAGE.test(String(message ?? ""))
}

/**
 * What to put in the log so the next occurrence costs one line instead of a
 * hunt. Names the chain a reader has to check, because the key is resolved in
 * two places and neither of them is the failing call.
 */
export function describeReadFailure(error: unknown): string {
  const { status, message } = (error ?? {}) as HttpishError

  if (isNoShopError(error)) {
    return (
      "the Store API answered 400 because this request carried no publishable key, " +
      "which means the storefront could not tell which shop the request is for. " +
      "The shop comes from the Host header: `src/middleware.ts` resolves it through " +
      "`GET /storefront/by-host` and puts the key on `x-tenant-key`, and " +
      "`lib/config.ts` getPublishableKeyHeader resolves it again from `host` when that " +
      "header is missing. Check that the request's Host belongs to a tenant and that " +
      "`GET /storefront/by-host` answers for it."
    )
  }

  return `${status ?? "no status"}: ${String(message ?? error)}`
}

/**
 * Run a site-wide read. On failure it reports and hands back `fallback` instead
 * of throwing into the layout render.
 *
 * `fallback` is a DEGRADED render, never a measured answer: a caller that draws
 * a conclusion from an empty result (rule 20a, "zero is not empty") has to tell
 * the two apart itself, which is why the callers here take `null` for "the read
 * failed" and an empty array only for "the shop really has none".
 */
export async function siteWideRead<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await read()
  } catch (error) {
    console.error(
      `${label}: site-wide read failed, rendering the page without it — ` +
        describeReadFailure(error)
    )

    return fallback
  }
}
