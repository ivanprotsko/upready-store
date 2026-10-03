import { parseSyncLines } from "@lib/cart-store/protocol"
import { retrieveCartSnapshot } from "@lib/data/cart"
import { syncCartLines } from "@lib/data/cart-lines"
import { NextResponse } from "next/server"

/**
 * The cart for the client queue (`lib/cart-store`, t-2026-10-03-66). A Route Handler
 * rather than the Server Actions in `lib/data/cart.ts`, for three reasons measured on
 * the stand on 2026-10-03:
 *
 * - An action that calls `revalidateTag` answers with the whole page re-rendered
 *   (`pathWasRevalidated`), 610–850 KB of RSC per click on a product page. This answers
 *   with the cart as JSON.
 * - Actions share the router's queue: a navigation discards the one in flight. A plain
 *   `fetch` does not care what the router does.
 * - `fetch(…, { keepalive: true })` outlives the page, so a click made right before the
 *   tab closes still reaches the server.
 *
 * The middleware does not run on `/api` (its matcher excludes it), so nothing here
 * reads its headers. The shop comes from the Host header (`getPublishableKeyHeader`,
 * `lib/config.ts`), and the country and locale come from the visitor's own cookies,
 * the same way `api/pochta/quote` does it.
 */
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

/** `GET /api/cart`: the cart as the server has it, `{ cart, at }`. */
export async function GET() {
  return NextResponse.json(await retrieveCartSnapshot(), { headers: NO_STORE })
}

/**
 * `POST /api/cart` with `{ lines: [{ variantId, quantity }] }`: sets each variant's
 * line to that quantity and answers `{ cart, at, errors }`. JSON only, which a
 * cross-site form cannot send without a CORS preflight this route never answers.
 */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE })
  }

  const lines = parseSyncLines(await request.json().catch(() => null))
  if (!lines) {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE })
  }

  try {
    return NextResponse.json(await syncCartLines(lines), { headers: NO_STORE })
  } catch (error) {
    console.error("POST /api/cart", error)
    return NextResponse.json({ error: "failed" }, { status: 502, headers: NO_STORE })
  }
}
