/**
 * Whether the shop's cart and checkout offer the promo code field (t-2026-10-13-11). Ivan,
 * 13.10.2026: «Я жду когда на cherkashino.ru будет убран способ оплаты "СБП" и промокод тоже
 * пусть выключит.» The backend reads the shop's own switch (`/storefront/by-host` →
 * `promo_code.enabled`) and the middleware carries it on `x-tenant-promo-code`.
 */

/** Anything that is not a clear `enabled: false` keeps the field: a shop loses it only on purpose. */
export const readTenantPromoCode = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return true
  }
  return (value as Record<string, unknown>).enabled !== false
}

/** True when there is no header, a header this process cannot parse, or a shop with the field on. */
export const parseTenantPromoCodeHeader = (value: string | null): boolean => {
  if (!value) {
    return true
  }
  try {
    return readTenantPromoCode(JSON.parse(value))
  } catch {
    return true
  }
}
