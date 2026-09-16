import { NextResponse } from "next/server"

import { listCdekPoints } from "@lib/data/cdek"
import type { CdekPointsResponse } from "@lib/util/cdek"

/** Empty answer shape, used for every failure: the sheet shows its own copy. */
const NONE: CdekPointsResponse = { configured: false, city: null, points: [] }

/**
 * `GET /api/cdek/points?city=Москва&type=PVZ` — the shop's CDEK pickup points
 * for one city, for the picker's list and its map
 * (i03-checkout-pvz-map-address-suggest).
 *
 * Same reasoning as the cities route next door: a browser-visible GET, so the
 * sheet can abort a city the buyer typed past, and so an e2e can answer from a
 * fixture instead of the carrier. The shop is resolved from the Host header by
 * `lib/config.ts`, never from the query.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const city = (params.get("city") ?? "").trim()
  const type = params.get("type")

  if (!city) return NextResponse.json(NONE)

  const answer = await listCdekPoints({
    city,
    type: type === "POSTAMAT" || type === "ALL" ? type : "PVZ",
  })
  return NextResponse.json(answer)
}
