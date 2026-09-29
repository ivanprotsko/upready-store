import { NextResponse } from "next/server"

import { listPochtaPoints } from "@lib/data/pochta"

/** `GET /api/pochta/points?city=Москва&region=…` — the points of one city (46df-pochta). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const city = (params.get("city") ?? "").trim()
  if (!city) return NextResponse.json({ configured: true, city: null, points: [] })
  return NextResponse.json(
    await listPochtaPoints({ city, region: (params.get("region") ?? "").trim() || undefined })
  )
}
