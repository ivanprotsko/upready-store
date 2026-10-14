import type { TenantPaymentMethods } from "../../../hooks/api/payment-settings"

/**
 * t-2026-10-14-01 (panel redesign, G3 «Оплата»): `/settings/payments` is a
 * list of the shop's payment methods, one row per method, each row opening
 * the method's own card `/settings/payments/<way>`. This file is the list's
 * logic and the cards' state words, plain TS with type-only imports, so
 * `src/__tests__/payments-g3.test.mjs` runs it for real.
 *
 * The order is the prototype's: the two methods every shop has (Robokassa and
 * the transfer by requisites) first, then Tribute, then the crypto methods.
 */

export type PaymentWay = "robokassa" | "manual" | "tribute" | "btcpay" | "bitcart" | "x402"

export const PAYMENT_WAYS: PaymentWay[] = ["robokassa", "manual", "tribute", "btcpay", "bitcart", "x402"]

/** The methods that exist only where the instance takes cryptocurrency (`PAYMENTS_CRYPTO_AVAILABLE`). */
const CRYPTO_WAYS: PaymentWay[] = ["btcpay", "bitcart", "x402"]

/**
 * The rows the list shows. Tribute is a row only where the instance offers it
 * (`TRIBUTE_AVAILABLE`), the crypto methods only where it takes cryptocurrency:
 * elsewhere they are not methods the owner could connect, so they are not
 * listed as «не настроено» either.
 */
export const visibleWays = ({
  tributeAvailable,
  cryptoAvailable,
}: {
  tributeAvailable: boolean
  cryptoAvailable: boolean
}): PaymentWay[] =>
  PAYMENT_WAYS.filter((way) =>
    way === "tribute" ? tributeAvailable : CRYPTO_WAYS.includes(way) ? cryptoAvailable : true
  )

/**
 * Whether the checkout offers the method right now, as the platform's own
 * resolver says (`methods`, the same answer `/store/payment-providers` reads).
 * The transfer by requisites is one method to the owner, on if either half is.
 */
export const isOffered = (methods: TenantPaymentMethods, way: PaymentWay): boolean => {
  switch (way) {
    case "manual":
      return methods.manualCrypto || methods.manualManager
    case "robokassa":
      return methods.robokassa
    default:
      return Boolean(methods[way])
  }
}

/** The methods the buyer can pay with right now, in the list's order. */
export const offeredWays = (methods: TenantPaymentMethods, visible: PaymentWay[]): PaymentWay[] =>
  visible.filter((way) => isOffered(methods, way))

// ── State of one method: the word and the colour of its StatusBadge ────────

/**
 * Design-system rule 17: green «подключено» (and Robokassa's «тестовый режим»,
 * as the prototype draws it), grey «выключено» / «не настроено», orange
 * «тестовая сеть», red «ключ не читается».
 */
export type WayState = "connected" | "test" | "testnet" | "off" | "none" | "unreadable"

export const WAY_STATE_COLOR: Record<WayState, "green" | "grey" | "orange" | "red"> = {
  connected: "green",
  test: "green",
  testnet: "orange",
  off: "grey",
  none: "grey",
  unreadable: "red",
}

export const wayStateKey = (state: WayState) => `paymentMethods.state.${state}` as const

type Stored = { is_enabled: boolean } | null | undefined

/** A stored row with a switch: Tribute, BTCPay, Bitcart. */
export const storedState = (settings: Stored, unreadable?: unknown): WayState =>
  unreadable ? "unreadable" : !settings ? "none" : settings.is_enabled ? "connected" : "off"

/** Robokassa: an enabled account in test mode reads «тестовый режим». */
export const robokassaState = (
  settings: { is_enabled: boolean; is_test: boolean } | null | undefined,
  unreadable?: unknown
): WayState =>
  unreadable
    ? "unreadable"
    : !settings
      ? "none"
      : !settings.is_enabled
        ? "off"
        : settings.is_test
          ? "test"
          : "connected"

/** x402: an enabled address that only takes test networks reads «тестовая сеть». */
export const x402State = (
  settings: { is_enabled: boolean; is_test: boolean } | null | undefined,
  unreadable?: unknown
): WayState =>
  unreadable
    ? "unreadable"
    : !settings
      ? "none"
      : !settings.is_enabled
        ? "off"
        : settings.is_test
          ? "testnet"
          : "connected"

/** The transfer by requisites has no row of its own here: it is on while the checkout offers it. */
export const manualState = (methods: TenantPaymentMethods): WayState =>
  isOffered(methods, "manual") ? "connected" : "off"

// ── Robokassa's own methods (card, SBP, …) ───────────────────────────────────

/** The aliases the panel names in its own words; Robokassa names SBP «Банковская карта». */
export const KNOWN_ROBOKASSA_ALIASES = ["BankCard", "SBP", "BankCardHalva", "Card120Days"]

export const robokassaMethodLabel = (
  t: (key: string) => string,
  method: { alias: string; name_ru: string | null; name_en: string | null },
  language: string
): string => {
  if (KNOWN_ROBOKASSA_ALIASES.includes(method.alias)) {
    return t(`paymentSettings.robokassaMethods.labels.${method.alias}`)
  }
  const named = language.startsWith("ru")
    ? method.name_ru ?? method.name_en
    : method.name_en ?? method.name_ru
  return named?.trim() || method.alias
}
