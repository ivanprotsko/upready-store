"use server"

/**
 * Read path for the site-wide block-composition document — the one document that sets
 * every visitor's header/hero/tiles/listing/footer version and the default light/dark
 * mode for a visitor who has never switched it themselves.
 *
 * Contract: `artifacts/docs/2026-09-09-panel-composition-mockup.md` §C1/§C5. Not
 * locale-scoped (one document for every language, `panel-composition-mockup.md`'s own
 * Facts table), so this calls `fetchWithoutLocale` rather than the locale-aware
 * `sdk.client.fetch` every other loader under this directory uses — the same reason
 * `app/llms.txt/route.ts` does (`AGENTS.md` "Two pieces of locale plumbing").
 *
 * One shared cache tag, `"storefront-settings"` — no `_medusa_cache_id` suffix, unlike
 * `categories.ts`'s per-browser tags, because this is the opposite of per-visitor data:
 * one saved document, shown to everyone, invalidated for everyone at once by the single
 * `revalidateTag("storefront-settings")` call inside the studio proxy's PUT handler
 * (`app/api/studio/settings/route.ts`), never through the unrelated
 * `/api/revalidate` webhook route (critique §2.2).
 */

import { fetchWithoutLocale } from "@lib/config"
import { profile } from "@lib/profile"
import {
  PROFILE_DEFAULTS,
  type ProfileId,
  type StorefrontSettings,
} from "@lib/theme/composition"

const SETTINGS_TAG = "storefront-settings"

let warnedUnreachable = false

function isKnownProfileId(id: string): id is ProfileId {
  return Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, id)
}

/**
 * Used ONLY when the backend cannot be reached at all (network/DNS failure, or the
 * fetch throwing for any other reason) — the plan's own extension of D1 §C5, "falls
 * back to the profile default from composition.ts when the backend is unreachable".
 *
 * This is a DIFFERENT case from a reachable backend answering `{ settings: null }`
 * (nothing saved yet, D1 §C1's "Absent" row): that case still returns `null` below, and
 * callers fall back to today's per-slot baseline unchanged, exactly as D1 specifies.
 * The profile's own generated build carries no per-stand secret or write access, so this
 * fallback can only ever read `PROFILE_DEFAULTS`, never call the backend a second way.
 *
 * The `default` build profile (no `NEXT_PUBLIC_STORE_PROFILE` set, e.g. a local
 * `pnpm dev` with no profile selected) has no entry in `PROFILE_DEFAULTS` — that case
 * falls through to `null`, same as "nothing saved", which is the closest existing
 * behavior to fall back to for a profile the composition vocabulary was never built
 * for.
 */
function profileFallbackSettings(): StorefrontSettings | null {
  if (!isKnownProfileId(profile.id)) return null
  return { ...PROFILE_DEFAULTS[profile.id], updatedAt: profile.generatedAt ?? "" }
}

export async function getStorefrontSettings(): Promise<StorefrontSettings | null> {
  try {
    const { settings } = await fetchWithoutLocale<{ settings: StorefrontSettings | null }>(
      "/store/storefront-settings",
      { next: { tags: [SETTINGS_TAG] }, cache: "force-cache" }
    )
    return settings
  } catch (error) {
    // Never throw into a page render over a settings document — the storefront must
    // still render (rule 20: tolerating a failure is not the same as hiding it, so
    // this logs once per server process rather than staying silent).
    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "getStorefrontSettings: backend unreachable, falling back to the profile's own default composition",
        error
      )
    }
    return profileFallbackSettings()
  }
}
