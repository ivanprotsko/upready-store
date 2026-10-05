import type { TenantPaymentMethods } from "../hooks/api/payment-settings"

/**
 * «Приём оплат» (t-2026-09-24-n10): a per-method key for the panel's status
 * badges, and the ordered list of what the buyer sees right now for the
 * "Покупателю доступны: …" hint. `demo` is deliberately its own key: it is
 * never a method the owner "connects", so it never appears in
 * `connectedMethodKeys` — its absence there IS the demo card, shown when the
 * list comes back empty.
 *
 * t-cherk-com-hotfix batch 6: the backend still answers `manualCrypto` and
 * `manualManager` separately (`tenant-secrets/payment-methods.ts` derives
 * them from the owner's one requisites list for the storefront's provider
 * filter, and the two CAN differ — a list of wallets only turns
 * `manualManager` off). The panel shows the owner ONE method, «Перевод по
 * реквизитам», on if either half is: `isManualConnected` is that OR.
 */
export type PaymentMethodKey = "robokassa" | "btcpay" | "bitcart" | "manual"

export const PAYMENT_METHOD_KEYS: PaymentMethodKey[] = ["robokassa", "btcpay", "bitcart", "manual"]

/** The methods that exist only where the instance takes cryptocurrency (ask-20261005-070255-438f). */
const CRYPTO_METHOD_KEYS: PaymentMethodKey[] = ["btcpay", "bitcart"]

export const isManualConnected = (methods: TenantPaymentMethods): boolean =>
  methods.manualCrypto || methods.manualManager

export const isMethodConnected = (methods: TenantPaymentMethods, key: PaymentMethodKey): boolean => {
  if (key === "manual") return isManualConnected(methods)
  // A backend older than ask-20261005-070255-438f sends no `btcpay` at all.
  if (key === "btcpay") return Boolean(methods.btcpay)
  // Nor one older than its stage 2 a `bitcart`.
  if (key === "bitcart") return Boolean(methods.bitcart)
  return methods.robokassa
}

/**
 * The rows «Что видит покупатель» lists. BTCPay and Bitcart are rows only
 * where the instance takes cryptocurrency (ask-20261005-070255-438f): on RU
 * they are not methods the owner could connect, so they are not listed as
 * «not connected» either.
 */
export const visibleMethodKeys = ({ cryptoAvailable }: { cryptoAvailable: boolean }): PaymentMethodKey[] =>
  PAYMENT_METHOD_KEYS.filter((key) => !CRYPTO_METHOD_KEYS.includes(key) || cryptoAvailable)

/** Which of the owner's own methods are connected, in the order the panel lists them. */
export const connectedMethodKeys = (methods: TenantPaymentMethods): PaymentMethodKey[] =>
  PAYMENT_METHOD_KEYS.filter((key) => isMethodConnected(methods, key))

/** Whether `pp_system_default`'s demo card is this shop's only way to pay right now. */
export const isDemoOnly = (methods: TenantPaymentMethods): boolean => methods.demo
