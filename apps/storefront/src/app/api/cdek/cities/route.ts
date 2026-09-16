import { NextResponse } from "next/server"

import { listCdekCities } from "@lib/data/cdek"

/**
 * `GET /api/cdek/cities?q=Красно` — CDEK's city directory for the checkout's
 * suggest fields (i03-checkout-pvz-map-address-suggest).
 *
 * A route handler rather than the `"use server"` reader it replaced: this is
 * fetched on every few keystrokes, and Next runs server ACTIONS one at a time
 * per page — a suggest behind an action queues behind whatever else the page is
 * doing (a `setShippingMethod`, a points fetch), which is the one thing a
 * suggest must never do. Being a plain GET also makes it abortable and lets an
 * e2e run answer it from a fixture instead of the carrier.
 *
 * The publishable key is NOT taken from a query parameter: `sdk` resolves the
 * shop from the request's own Host header (`lib/config.ts`), the same way every
 * other storefront read does, so one shop can never spend another's rate limit.
 * `src/app/api` is outside the middleware matcher (AGENTS.md, "The middleware
 * matcher"), which is why the host resolution in `lib/config.ts` — not the
 * `x-tenant-key` header — is what answers here.
 */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim()
  if (term.length < 2) return NextResponse.json({ cities: [] })

  // A shop with no CDEK, a carrier hiccup: `listCdekCities` answers `[]` and
  // the field stays a plain input rather than showing the buyer an error they
  // cannot act on.
  return NextResponse.json({ cities: await listCdekCities(term) })
}
