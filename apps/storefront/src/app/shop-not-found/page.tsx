import { publicHost } from "@lib/tenant/origin"
import { headers } from "next/headers"

import { displayHost, ShopNotFoundView } from "./shop-not-found-view"

/**
 * Reached only through `src/middleware.ts`, which rewrites every page of a host
 * the backend answered "No storefront is configured for host" to this path
 * (t-2026-10-12-32 FX4). Lives outside `[locale]` like `/start`: every page
 * there needs a publishable key such a host cannot produce, and before this
 * the host got an empty shop under the build profile's name with a 200.
 *
 * The 404 status is the middleware's: Next keeps the status of the response
 * that carried the rewrite. Not `notFound()` here — thrown from a page, it
 * fails the server render's shell and Next sends an empty
 * `<html id="__next_error__">` that only the browser fills in (measured on the
 * stand), so a visitor without JavaScript and every crawler got a blank page.
 *
 * The address is read the way the shop lookup read it: the forwarded name a
 * proxy recorded, else `Host`.
 */
export default async function ShopNotFoundPage() {
  return <ShopNotFoundView host={displayHost(publicHost(await headers()))} />
}
