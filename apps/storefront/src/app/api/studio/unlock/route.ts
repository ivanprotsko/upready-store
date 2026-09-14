import { NextResponse, type NextRequest } from "next/server"

import {
  STUDIO_COOKIE,
  STUDIO_TTL_SECONDS,
  isStudioEnabled,
  issueStudioCookie,
  passwordMatches,
} from "@lib/studio/session"

/**
 * The only door to the hidden settings panel.
 *
 * POST unlocks (password in, signed httpOnly cookie out), DELETE locks (cookie
 * cleared). With STOREFRONT_STUDIO_PASSWORD unset or empty both answer 404, so a
 * storefront that does not use the feature does not advertise that the route exists.
 *
 * The route is dynamic on purpose: it reads an environment variable and writes a
 * cookie, neither of which may be baked into a build artifact.
 */
export const dynamic = "force-dynamic"

/** Indistinguishable from a route that was never deployed. */
function disabled(): NextResponse {
  return new NextResponse(null, { status: 404 })
}

export async function POST(req: NextRequest) {
  if (!isStudioEnabled()) return disabled()

  let submitted: unknown = null
  try {
    const body = (await req.json()) as { password?: unknown } | null
    submitted = body?.password ?? null
  } catch {
    // a body that is not JSON is simply a failed attempt
    submitted = null
  }

  if (!passwordMatches(submitted)) {
    return NextResponse.json({ error: "invalid" }, { status: 401 })
  }

  const res = NextResponse.json({ unlocked: true })
  res.cookies.set(STUDIO_COOKIE, issueStudioCookie(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: STUDIO_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  })
  return res
}

export async function DELETE() {
  if (!isStudioEnabled()) return disabled()

  const res = NextResponse.json({ unlocked: false })
  res.cookies.set(STUDIO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  })
  return res
}
