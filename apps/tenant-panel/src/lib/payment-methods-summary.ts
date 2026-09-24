import type { TenantPaymentMethods } from "../hooks/api/payment-settings"

/**
 * «Приём оплат» (t-2026-09-24-n10): a per-method key for the panel's status
 * badges, and the ordered list of what the buyer sees right now for the
 * "Покупателю доступны: …" hint. `demo` is deliberately its own key: it is
 * never a method the owner "connects", so it never appears in
 * `connectedMethodKeys` — its absence there IS the demo card, shown when the
 * list comes back empty.
 */
export type PaymentMethodKey = "robokassa" | "manualCrypto" | "manualManager"

export const PAYMENT_METHOD_KEYS: PaymentMethodKey[] = ["robokassa", "manualCrypto", "manualManager"]

/** Which of the owner's own methods are connected, in the order the panel lists them. */
export const connectedMethodKeys = (methods: TenantPaymentMethods): PaymentMethodKey[] =>
  PAYMENT_METHOD_KEYS.filter((key) => methods[key])

/** Whether `pp_system_default`'s demo card is this shop's only way to pay right now. */
export const isDemoOnly = (methods: TenantPaymentMethods): boolean => methods.demo
