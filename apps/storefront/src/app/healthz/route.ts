import { NextResponse } from "next/server"

/**
 * The container's own liveness probe, and nothing else.
 *
 * It exists because the storefront serves EVERY tenant by Host: the compose
 * healthcheck used to fetch `http://127.0.0.1:8000/`, whose Host header is
 * `127.0.0.1`, which resolves to no tenant, which answers 500 — so the
 * container reported `unhealthy` forever while every real domain served its
 * shop correctly (measured 2026-09-11 on the shipshift.dev deployment:
 * FailingStreak 14, `wget: server returned error: HTTP/1.1 500` on a stack
 * whose five hosts all answered 302/200 over https). A probe that can only
 * fail is worse than no probe: `depends_on: service_healthy` never releases
 * and `docker ps` lies to whoever reads it.
 *
 * So the probe asks a question this process can answer without a tenant: is
 * the Next.js server up. It deliberately does NOT touch the backend — that
 * would make a backend blip restart a storefront that is serving pages from
 * cache perfectly well.
 */
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 })
}
