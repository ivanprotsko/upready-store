/**
 * How THIS shop's buyers are allowed to sign in (o25-login-methods): email and
 * password, Yandex ID, or both. The backend resolves it per shop
 * (`api/storefront/by-host/route.ts`, `api/tenants/login-settings/login-settings.ts`),
 * the middleware carries it on `x-tenant-login`, and every consumer here reads
 * what arrives — the same split `branding.ts` already uses.
 *
 * Enforcement lives on the backend (`login-method-gate.ts`); what lives here
 * only decides which forms the storefront draws, so a hidden control and the
 * backend's own refusal always agree with each other.
 */

export type BuyerLoginMethod = "email" | "yandex" | "both"

export type TenantLoginSettings = {
  method: BuyerLoginMethod
  /** Whether this DEPLOYMENT has Yandex ID keys at all (`YANDEX_CLIENT_ID` on the backend). */
  yandex_platform_available: boolean
}

/**
 * A tenant that never resolves (single-store install, or a host with no shop
 * behind it) keeps TODAY's behaviour exactly: email and password always work,
 * and Yandex follows the build-time `NEXT_PUBLIC_YANDEX_LOGIN_ENABLED` flag —
 * the same single-store fallback the Yandex button already used before this
 * task, now expressed as the "both methods, platform availability from the
 * build" case rather than a special path of its own.
 */
export const EMPTY_LOGIN_SETTINGS: TenantLoginSettings = {
  method: "both",
  yandex_platform_available: process.env.NEXT_PUBLIC_YANDEX_LOGIN_ENABLED === "true",
}

export const allowsEmailLogin = (method: BuyerLoginMethod): boolean =>
  method === "email" || method === "both"

export const allowsYandexLogin = (method: BuyerLoginMethod): boolean =>
  method === "yandex" || method === "both"

/** Whether the Yandex control should actually render: the shop chose it AND the platform can serve it. */
export const yandexLoginAvailable = (settings: TenantLoginSettings): boolean =>
  allowsYandexLogin(settings.method) && settings.yandex_platform_available

const isBuyerLoginMethod = (value: unknown): value is BuyerLoginMethod =>
  value === "email" || value === "yandex" || value === "both"

/** From the request header the middleware wrote. Malformed JSON is not a 500 — the
 * shop still renders, with today's behaviour, the same posture `parseBrandingHeader` takes. */
export const parseLoginSettingsHeader = (
  raw: string | null | undefined
): TenantLoginSettings | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TenantLoginSettings>
    if (!isBuyerLoginMethod(parsed.method)) {
      return null
    }
    return {
      method: parsed.method,
      yandex_platform_available: Boolean(parsed.yandex_platform_available),
    }
  } catch {
    return null
  }
}
