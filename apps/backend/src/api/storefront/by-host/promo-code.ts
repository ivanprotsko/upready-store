/**
 * Whether the shop's cart and checkout offer the promo code field
 * (t-2026-10-13-11). Ivan, 13.10.2026: «Я жду когда на cherkashino.ru будет
 * убран способ оплаты "СБП" и промокод тоже пусть выключит.» Off only when
 * `tenant.metadata.promo_code.enabled` is `false`, so every shop that never set
 * it keeps the field it has always had.
 */
export const isPromoCodeEnabled = (
  metadata: Record<string, unknown> | null | undefined,
): boolean => {
  const block = metadata?.promo_code;
  if (!block || typeof block !== "object") {
    return true;
  }
  const enabled = (block as Record<string, unknown>).enabled;
  return enabled !== false && enabled !== "false";
};
