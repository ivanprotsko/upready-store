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
