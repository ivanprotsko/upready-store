import { NextResponse } from "next/server"

import { listPochtaCities } from "@lib/data/pochta"

/**
 * `GET /api/pochta/cities?q=Мос` — settlements with Russian Post pickup points
 * (46df-pochta). A browser-visible GET so the city field can abort a term the
 * buyer typed past; the shop comes from the Host header (`lib/config.ts`).
 */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim()
  return NextResponse.json({ cities: await listPochtaCities(q) })
}
