import "server-only"

import { notFound, redirect } from "next/navigation"
import { getLocale } from "next-intl/server"

import { getTenantHandle } from "@lib/data/cookies"
import { listPublishedPageKeys } from "@lib/data/tenant-pages"
import {
  NO_TENANT,
  starterPageVerdict,
  type LegalLinkContext,
  type LegalSlot,
} from "@lib/util/legal-links"

/**
 * The shop's side of the legal-link decision, read once per render: does this
 * deployment have a tenant, and which pages has that tenant published. The
 * mapping from a slot to an href is pure and lives in `@lib/util/legal-links`,
 * which a client component may import; this module reads `next/headers` and a
 * Store API route, so it is `server-only` (rule 19g) and a client component
 * takes the context as a PROP from its server parent.
 *
 * `getTenantHandle` is a header read, not a fetch: `src/middleware.ts` resolves
 * the shop by Host and writes `x-tenant-handle`, and a single-store deployment
 * simply has none. So a deployment with no tenant costs no round trip at all
 * and keeps exactly the behaviour the starter shipped with.
 */
export async function getLegalLinkContext(): Promise<LegalLinkContext> {
  const handle = await getTenantHandle()

  if (handle === null) {
    return NO_TENANT
  }

  return { hasTenant: true, pageKeys: await listPublishedPageKeys() }
}

/**
 * The first line of each starter placeholder route (`/terms`, `/privacy`,
 * `/returns`, `/shipping`, `/customer-service`, `/contact`). It renders the
 * placeholder only for a deployment with no tenant; a tenant's visitor is
 * redirected to the shop's own document for that slot, or gets a 404 when the
 * shop published none.
 *
 * Why the routes need a guard of their own, when this task also repointed every
 * link: a link is not the only way in. The sitemap listed all six paths for
 * every shop, so a search engine indexed "Это страница-заглушка из стартера"
 * under the shop's own domain, and a bookmark or an old newsletter needs no
 * link in the current build at all (rule 20 — fix the class, not the call
 * sites).
 *
 * A temporary redirect, not a permanent one: which page covers a slot depends
 * on what the owner has published, and that changes the day they add one. A 308
 * is cached by the browser indefinitely and would outlive the mapping. Search
 * engines are served by the sitemap, which now lists the tenant's own pages and
 * not these paths.
 */
export async function guardStarterLegalPage(slot: LegalSlot): Promise<void> {
  const verdict = starterPageVerdict(slot, await getLegalLinkContext())

  if (verdict.kind === "redirect") {
    // Every page of this storefront is under `/<locale>`, and `next/navigation`'s
    // `redirect` adds no prefix, so a bare
    // `/pages/offer` would be redirected a second time by the middleware,
    // guessing the language from the visitor's cookie rather than keeping the
    // one they are reading in.
    redirect(`/${await getLocale()}${verdict.to}`)
  }

  if (verdict.kind === "gone") {
    notFound()
  }
}
