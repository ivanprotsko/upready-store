import { publicHost } from "@lib/tenant/origin"
import { headers } from "next/headers"

import { displayHost, ShopNotFoundView } from "./shop-not-found-view"

/**
 * What `page.tsx` of this segment renders through `notFound()`, so the answer
 * carries Next's own 404 status (t-2026-10-12-32 FX4). The address is read
 * the way the shop lookup read it: the forwarded name a proxy recorded, else
 * `Host`.
 */
export default async function ShopNotFound() {
  return <ShopNotFoundView host={displayHost(publicHost(await headers()))} />
}
