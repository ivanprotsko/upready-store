/**
 * Payments and/or delivery in a provider's test contour (t-2026-10-04-21, checkout-v2 acceptance
 * A3): while either is on, the storefront shows a red dot in its top-right corner, and hovering it
 * says what is in test. The backend reads it from the providers' own `is_test` flags
 * (`/storefront/by-host` → `test_mode`), the switch the panel already has; there is no separate
 * setting for the dot.
 */
export type TenantTestMode = {
  payments: boolean
  delivery: boolean
}

export const EMPTY_TENANT_TEST_MODE: TenantTestMode = { payments: false, delivery: false }

/**
 * The switch that takes the dot off the page (t-2026-10-08-13). The dot is the owner's own
 * mark from t-2026-10-04-21 (acceptance A3, Ivan: «включены тестовые оплаты и доставка»). A
 * shop under Robokassa moderation keeps its payments in test until the moderation ends, so
 * no shop setting takes the dot away, and a moderator would see a test mark on every page.
 * A deployment sets `STOREFRONT_HIDE_TEST_MODE_DOT=1` for the time of the moderation and
 * removes the variable after it.
 */
export const HIDE_TEST_MODE_DOT_ENV = "STOREFRONT_HIDE_TEST_MODE_DOT"

/**
 * On for `1` and for `true`, off for everything else. The storefront reads it on the server
 * at render time, so you flip it with the container's environment and a restart, with no
 * rebuild.
 */
export const testModeDotHidden = (
  env: Record<string, string | undefined> = process.env
): boolean => {
  const value = (env[HIDE_TEST_MODE_DOT_ENV] ?? "").trim().toLowerCase()
  return value === "1" || value === "true"
}

/** What the layout hands to the dot: the shop's test mode, or nothing in test with the switch on. */
export const visibleTestMode = (
  mode: TenantTestMode,
  env: Record<string, string | undefined> = process.env
): TenantTestMode => (testModeDotHidden(env) ? EMPTY_TENANT_TEST_MODE : mode)

/** Anything that is not a clear `true` reads as live: the dot never shows on a guess. */
export const readTenantTestMode = (value: unknown): TenantTestMode => {
  if (!value || typeof value !== "object") {
    return EMPTY_TENANT_TEST_MODE
  }
  const raw = value as Record<string, unknown>
  return { payments: raw.payments === true, delivery: raw.delivery === true }
}

export const parseTenantTestModeHeader = (value: string | null): TenantTestMode | null => {
  if (!value) {
    return null
  }
  try {
    return readTenantTestMode(JSON.parse(value))
  } catch {
    return null
  }
}

/**
 * The hover text. Russian is Ivan's wording from A3 («включены тестовые оплаты и доставка»),
 * narrowed when only one of the two is in test; every other locale gets the English one. Kept
 * here rather than in `messages/*.json`: it is the owner's marker, not a buyer-facing string.
 */
export const testModeLabel = (mode: TenantTestMode, locale: string): string | null => {
  const ru = locale.toLowerCase().startsWith("ru")

  if (mode.payments && mode.delivery) {
    return ru ? "Включены тестовые оплаты и доставка" : "Test payments and test delivery are on"
  }
  if (mode.payments) {
    return ru ? "Включены тестовые оплаты" : "Test payments are on"
  }
  if (mode.delivery) {
    return ru ? "Включена тестовая доставка" : "Test delivery is on"
  }
  return null
}
