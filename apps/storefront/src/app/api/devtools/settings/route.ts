import { revalidateTag } from "next/cache"
import { NextResponse, type NextRequest } from "next/server"
import { FetchError } from "@medusajs/js-sdk"

import { fetchWithoutLocale } from "@lib/config"
import {
  DEVTOOLS_COOKIE,
  devtoolsCookieIsValid,
  isDevtoolsEnabled,
} from "@lib/devtools/session"
import { validate, type StorefrontSettings, type StorefrontSettingsInput } from "@lib/theme/composition"

/**
 * The panel's only door to `store.metadata.storefrontSettings`. Contract:
 * `artifacts/docs/2026-09-09-panel-composition-mockup.md` §C3.
 *
 * The panel never sees `STOREFRONT_SETTINGS_SECRET` — exactly as
 * `STOREFRONT_DEVTOOLS_PASSWORD` never reaches the browser (`lib/devtools/session.ts`).
 * Gate: `isDevtoolsEnabled()` + a valid `upready_devtools` cookie — either failing
 * answers 404, indistinguishable from a route that was never deployed, the same pattern
 * `api/devtools/unlock/route.ts` uses. `middleware.ts`'s matcher already excludes
 * `/api`, so no locale handling belongs here (`api/payment-return` precedent,
 * `AGENTS.md` "The middleware matcher").
 *
 * Dynamic on purpose: it reads a cookie and an environment variable, and GET
 * deliberately bypasses the tagged read cache (`cache: "no-store"`) so the operator
 * always sees the live document, never a stale tab — D1 §C3.
 */
export const dynamic = "force-dynamic"

const SETTINGS_TAG = "storefront-settings"
const SECRET_HEADER = "x-storefront-settings-secret"

/** Indistinguishable from a route that was never deployed. */
function disabled(): NextResponse {
  return new NextResponse(null, { status: 404 })
}

async function gatePasses(req: NextRequest): Promise<boolean> {
  if (!isDevtoolsEnabled()) return false
  return devtoolsCookieIsValid(req.cookies.get(DEVTOOLS_COOKIE)?.value)
}

/** The configured write secret, or null when the stand has not set one. */
function settingsSecret(): string | null {
  const raw = process.env.STOREFRONT_SETTINGS_SECRET
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(req: NextRequest) {
  if (!(await gatePasses(req))) return disabled()

  // Checked here, in the storefront's own env, so the panel can warn BEFORE a save is
  // attempted (T6's proactive frame) rather than only after an unexplained failure.
  const secretConfigured = settingsSecret() !== null

  try {
    const { settings } = await fetchWithoutLocale<{ settings: StorefrontSettings | null }>(
      "/store/storefront-settings",
      { cache: "no-store" }
    )
    return NextResponse.json({ settings, secretConfigured })
  } catch (error) {
    console.error("devtools/settings GET: backend unreachable", error)
    return NextResponse.json({ settings: null, secretConfigured, loadError: true })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await gatePasses(req))) return disabled()

  const secret = settingsSecret()
  if (secret === null) {
    // The panel's own Save button is never shown once `secretConfigured` reads false
    // (GET above, T6's proactive frame) — this only fires if a request reaches the
    // route anyway, and it must still answer something rather than 401 for a reason
    // the caller configured wrong.
    return NextResponse.json({ reason: "secret-not-configured" }, { status: 501 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  // Defensive re-check before spending a round trip on a document the backend would
  // reject anyway — §C7's second of three enforcement points. The backend re-checks
  // the same rules again on its own (the one check that truly cannot be skipped), so a
  // divergence between the two copies still fails closed, just one hop later.
  const validated = validate(body)
  if (!validated.ok) {
    return NextResponse.json({
      ok: false,
      error: "invalid",
      kind: validated.kind,
      ...(validated.kind === "invalid_field"
        ? { errors: validated.errors }
        : { rule: validated.rule }),
    })
  }

  const value: StorefrontSettingsInput = validated.value

  try {
    const { settings } = await fetchWithoutLocale<{ settings: StorefrontSettings }>(
      "/store/storefront-settings",
      {
        method: "PUT",
        headers: { [SECRET_HEADER]: secret },
        body: value,
      }
    )
    // Write and revalidation share one process — no round trip through the unrelated
    // `/api/revalidate` webhook route (critique §2.2).
    revalidateTag(SETTINGS_TAG)
    return NextResponse.json({ ok: true, settings })
  } catch (error) {
    if (error instanceof FetchError) {
      // The backend re-validates independently and could in principle reject a
      // document this proxy's own copy of the rules just accepted (a drift between
      // the two hand-transcribed copies, composition.ts's own doc comment flags this
      // exact risk) — surfaced rather than folded into "unreachable", which would
      // mislabel a real validation disagreement as a network problem.
      console.error("devtools/settings PUT: backend rejected the document", error.status, error.message)
      return NextResponse.json({
        ok: false,
        error: "backend_rejected",
        status: error.status,
        message: error.message,
      })
    }
    console.error("devtools/settings PUT: backend unreachable", error)
    return NextResponse.json({ ok: false, error: "backend_unreachable" })
  }
}
