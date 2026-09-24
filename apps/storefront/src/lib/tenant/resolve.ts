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
import { EMPTY_BRANDING, type TenantBranding } from "./branding"
import { EMPTY_LOGIN_SETTINGS, type TenantLoginSettings } from "./login-settings"
import { readManualPayment, type TenantManualPayment } from "./manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS, readTenantPaymentMethods, type TenantPaymentMethods } from "./payment-methods"

export type { TenantAttribution }
export type { TenantBranding }
export type { TenantManualPayment }
export type { TenantPaymentMethods }

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
  /** Search-console ownership tags (t11-seo-redirects step 6), null when unset. */
  seoVerification: { yandex: string | null; google: string | null } | null
  /**
   * The shop's own analytics counters (t17-analytics step 1), null when the
   * owner has set neither. A tenant that resolves here NEVER falls back to
   * the build-time `NEXT_PUBLIC_GA_MEASUREMENT_ID` — that variable is the
   * single-store install's own fallback, not a shared id for every shop on
   * this process.
   */
  analytics: { yandexMetricaId: string | null; ga4MeasurementId: string | null } | null
  /** Logo, favicon, og image, primary colour, footer credit (t16-owner-branding). */
  branding: TenantBranding
  /** Which sign-in forms this shop's buyers get (o25-login-methods): email, Yandex ID, or both. */
  login: TenantLoginSettings
  /**
   * The shop's offline ways to pay on `pp_system_default` (olavka-payments):
   * crypto wallets and manager contacts, both off for a shop that configured
   * neither. Never a build-time default — every address here was typed by the
   * owner of this shop.
   */
  manualPayment: TenantManualPayment
  /**
   * Which payment methods this shop has connected (t-2026-09-24-n10):
   * Robokassa and the manual provider's two offline kinds, plus whether the
   * demo card is still its only way to pay. `EMPTY_TENANT_PAYMENT_METHODS`
   * for a tenant that connected nothing, same as a single-store install.
   */
  paymentMethods: TenantPaymentMethods
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
        seo_verification?: { yandex?: string | null; google?: string | null } | null
        analytics?: { yandex_metrica_id?: string | null; ga4_measurement_id?: string | null } | null
        branding?: Partial<TenantBranding> | null
        login?: Partial<TenantLoginSettings> | null
        manual_payment?: unknown
        payment_methods?: unknown
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
          seoVerification:
            body.seo_verification?.yandex || body.seo_verification?.google
              ? {
                  yandex: body.seo_verification.yandex ?? null,
                  google: body.seo_verification.google ?? null,
                }
              : null,
          analytics:
            body.analytics?.yandex_metrica_id || body.analytics?.ga4_measurement_id
              ? {
                  yandexMetricaId: body.analytics.yandex_metrica_id ?? null,
                  ga4MeasurementId: body.analytics.ga4_measurement_id ?? null,
                }
              : null,
          branding: { ...EMPTY_BRANDING, ...(body.branding ?? {}) },
          login: { ...EMPTY_LOGIN_SETTINGS, ...(body.login ?? {}) },
          manualPayment: readManualPayment(body.manual_payment),
          paymentMethods: body.payment_methods
            ? readTenantPaymentMethods(body.payment_methods)
            : EMPTY_TENANT_PAYMENT_METHODS,
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
