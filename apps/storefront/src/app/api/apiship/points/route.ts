import { NextResponse } from "next/server"

import { listApishipPoints } from "@lib/data/apiship"
import type { ApishipPointsResponse } from "@lib/util/apiship"

/** Empty answer shape, used for every failure: the sheet shows its own copy. */
const NONE: ApishipPointsResponse = {
  configured: false,
  provider_key: null,
  city: null,
  total: 0,
  points: [],
}

/**
 * `GET /api/apiship/points?provider_key=cdek&city=Москва` — one carrier's pickup
 * points in one city through the shop's ApiShip account, for the picker's list
 * and its map (t-2026-10-14-58, part B).
 *
 * The same shape as `app/api/cdek/points`: a browser-visible GET, so the sheet
 * can abort a city the buyer typed past, and so an e2e can answer from a
 * fixture instead of the carrier. The shop is resolved from the Host header by
 * `lib/config.ts`, never from the query.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const providerKey = (params.get("provider_key") ?? "").trim()
  const city = (params.get("city") ?? "").trim()

  if (!providerKey || !city) return NextResponse.json(NONE)

  return NextResponse.json(await listApishipPoints({ providerKey, city }))
}
