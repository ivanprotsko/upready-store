import { NextResponse } from "next/server"

import { quotePochtaPoint } from "@lib/data/pochta"

/**
 * `GET /api/pochta/quote?pochta_point_index=…&pochta_point_kind=pvz` — price
 * and term to one point for the visitor's own cart, read from its cookie
 * (46df-pochta).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const index = (params.get("pochta_point_index") ?? "").trim()
  const kind = params.get("pochta_point_kind") === "office" ? "office" : "pvz"
  if (!/^\d{6}$/.test(index)) {
    return NextResponse.json({ configured: true, quote: null }, { status: 400 })
  }
  return NextResponse.json(await quotePochtaPoint({ index, kind }))
}
