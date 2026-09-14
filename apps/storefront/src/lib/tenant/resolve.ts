/**
 * Which shop is this request for? One storefront process serves every tenant on
 * the backend, and the only thing that tells them apart is the `Host` header
 * (tenant-panel wave 2, piece 9 — `docs/multitenancy/storefront-by-host.md`).
 *
 * `GET /storefront/by-host` is public on purpose: it is the call that HANDS OUT
 * the publishable key, so it cannot sit behind the key gate that guards
 * `/store/*`. The key is not a secret — every storefront ships it in its own
 * HTML.
 *
 * Used from `src/middleware.ts`, which runs in its own runtime: the Map below
 * lives in that process and is not shared with the server components. Sixty
 * seconds per host, so a shop that registers now opens on its host a minute
 * later at the latest, with no restart and no deploy.
 */

import {
  readAttribution,
  type TenantAttribution,
} from "./attribution"

export type { TenantAttribution }

export type ResolvedTenant = {
  handle: string
  name: string
  publishableKey: string | null
  /** Theme preset id and light/dark default from the tenant's home document, when it has one. */
  theme: string | null
  mode: string | null
  attribution: TenantAttribution | null
  /**
   * The shop's MAIN public address — hostname only, no scheme and no port — as
   * the backend resolved it: the custom domain its owner marked primary, or
   * `<handle>.<base>`. Every other address of the shop answers 301 to it, and
   * every absolute URL the page emits is built on it
   * (`specs/tenant-address/CANONICAL.md`).
   */
  primaryHost: string | null
  /**
   * Language and currency defaults owned by the shop (t06-locale-currency),
   * not by the build. Null for a tenant that never saved
   * `tenant_locale_settings` — the storefront then falls back to
   * `STOREFRONT_DEFAULT_LOCALE`/`LOCALE_PIN`/`LOCALE_COUNTRY_MAP`, exactly the
   * single-image behaviour every deployment ran before this change.
   */
  locale: {
    defaultLocale: string
    enabledLocales: string[]
    defaultCountry: string | null
  } | null
}

const TTL_MS = 60_000

type CacheEntry = { value: ResolvedTenant | null; at: number }

const cache = new Map<string, CacheEntry>()

/** Lowercase, no port, no trailing root label — the spelling `tenant_domain` stores. */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) {
    return ""
  }

  return raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

export async function resolveTenantByHost(
  backendUrl: string | undefined,
  rawHost: string | null | undefined
): Promise<ResolvedTenant | null> {
  const host = normalizeHost(rawHost)

  if (!backendUrl || !host) {
    return null
  }

  const cached = cache.get(host)

  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.value
  }

  let resolved: ResolvedTenant | null = null

  try {
    const response = await fetch(
      `${backendUrl}/storefront/by-host?host=${encodeURIComponent(host)}`,
      { cache: "no-store" }
    )

    if (response.status === 404) {
      // A definite answer: no shop on this host. Cached like any other, so an
      // unknown host does not ask the backend on every request.
      resolved = null
    } else if (!response.ok) {
      // NOT an answer. Caching a 500 as "no shop here" would black out a live
      // storefront for a minute over one bad backend response, so this keeps
      // whatever was known before and leaves a line in the log (rule 20:
      // tolerating a failure is not hiding it).
      console.error(
        `resolveTenantByHost: backend answered ${response.status} for host "${host}"; keeping the previous answer`
      )
      return cached?.value ?? null
    } else {
      const body = (await response.json()) as {
        tenant?: { handle?: string; name?: string }
        publishable_key?: string | null
        theme?: { preset?: string | null; mode?: string | null } | null
        attribution?: Partial<TenantAttribution> | null
        primary_host?: string | null
        locale?: {
          default_locale?: string | null
          enabled_locales?: string[] | null
          default_country?: string | null
        } | null
      }

      if (body?.tenant?.handle) {
        const locale =
          body.locale?.default_locale && body.locale.enabled_locales?.length
            ? {
                defaultLocale: body.locale.default_locale,
                enabledLocales: body.locale.enabled_locales,
                defaultCountry: body.locale.default_country ?? null,
              }
            : null

        resolved = {
          handle: body.tenant.handle,
          name: body.tenant.name ?? body.tenant.handle,
          publishableKey: body.publishable_key ?? null,
          theme: body.theme?.preset ?? null,
          mode: body.theme?.mode ?? null,
          attribution: readAttribution(body.attribution),
          primaryHost: body.primary_host?.trim().toLowerCase() || null,
          locale,
        }
      }
    }
  } catch (error) {
    console.error(
      `resolveTenantByHost: cannot reach the backend for host "${host}"; keeping the previous answer`,
      error
    )
    return cached?.value ?? null
  }

  cache.set(host, { value: resolved, at: Date.now() })

  return resolved
}
