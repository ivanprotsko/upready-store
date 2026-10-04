/**
 * The Robokassa methods the checkout lists as rows of its own under «Способ
 * оплаты» (t-2026-10-04-49), and the request that opens Robokassa straight on
 * the one the buyer picked.
 *
 * The list comes from the backend (`GET /store/tenant/robokassa-methods`, read
 * from Robokassa's `GetCurrencies`). Each method is named by its `alias`, the
 * value Robokassa's `IncCurrLabel` and the iframe's `Settings.PaymentMethods`
 * take. Paying never trusts the browser's pick on its own: an alias opens
 * Robokassa only when the payment session the backend built lists it in
 * `payment_methods`, the server's whitelist for this shop.
 *
 * No JSX in here, so vitest can import it (see `pick-payment-method.ts`).
 */

export type RobokassaMethod = {
  alias: string
  name_ru: string | null
  name_en: string | null
  min: number | null
  max: number | null
}

/** Card and SBP, what every Robokassa shop takes: the list when the backend could not answer. */
export const ROBOKASSA_FALLBACK_METHODS: readonly RobokassaMethod[] = [
  { alias: "BankCard", name_ru: null, name_en: null, min: null, max: null },
  { alias: "SBP", name_ru: null, name_en: null, min: null, max: null },
]

const ALIAS_PATTERN = /^[A-Za-z0-9_]{1,40}$/

const isAlias = (value: unknown): value is string =>
  typeof value === "string" && ALIAS_PATTERN.test(value)

/**
 * `PaymentMethods` catalog keys for the aliases this storefront names itself.
 * Robokassa's own names are not used for these: its `GetCurrencies` answer
 * calls SBP «Банковская карта».
 */
const LABEL_KEYS: Record<string, string> = {
  BankCard: "robokassaBankCard",
  SBP: "robokassaSbp",
  BankCardHalva: "robokassaHalva",
  Card120Days: "robokassaCard120Days",
}

export const robokassaMethodLabelKey = (alias: string): string | null =>
  LABEL_KEYS[alias] ?? null

type Translator = ((key: string) => string) & { has: (key: string) => boolean }

/**
 * The row's label: the catalog's own words for a known alias, else the name
 * Robokassa gave it in the reader's language (Russian for `ru`, English for
 * every other locale), else the alias itself.
 */
export function robokassaMethodLabel(
  t: Translator,
  method: RobokassaMethod,
  locale: string
): string {
  const key = robokassaMethodLabelKey(method.alias)
  if (key && t.has(key)) {
    return t(key)
  }
  const named =
    locale === "ru"
      ? method.name_ru ?? method.name_en
      : method.name_en ?? method.name_ru
  return named?.trim() || method.alias
}

/** True for the methods whose icon is a card rather than SBP's. */
export const isRobokassaSbp = (alias: string | null | undefined) => alias === "SBP"

/**
 * The rows to show for this cart: the backend's list (the fallback when it
 * had none), well-formed aliases only, without a method whose
 * `MinValue`/`MaxValue` leaves the cart's total out. Should that leave
 * nothing, the unfiltered list stands: better Robokassa's own refusal than a
 * Robokassa option with no rows.
 */
export function robokassaMethodsForCart(
  methods: RobokassaMethod[] | null | undefined,
  total: number | null | undefined
): RobokassaMethod[] {
  const source = (methods ?? []).filter((method) => isAlias(method?.alias))
  const list = source.length ? source : [...ROBOKASSA_FALLBACK_METHODS]
  if (typeof total !== "number" || !Number.isFinite(total)) {
    return list
  }
  const fitting = list.filter(
    (method) =>
      (method.min === null || total >= method.min) &&
      (method.max === null || total <= method.max)
  )
  return fitting.length ? fitting : list
}

/** The buyer's alias while it is still on the list, else the list's first. */
export function pickRobokassaMethod(
  current: string | null | undefined,
  methods: RobokassaMethod[]
): string | null {
  if (current && methods.some((method) => method.alias === current)) {
    return current
  }
  return methods[0]?.alias ?? null
}

/**
 * The payment list's radio values. A Robokassa row is the provider id and the
 * alias joined by `::`, which neither a provider id nor an alias contains;
 * every other row is the provider id alone, as before.
 */
const CHOICE_SEPARATOR = "::"

export const robokassaChoiceValue = (providerId: string, alias: string) =>
  `${providerId}${CHOICE_SEPARATOR}${alias}`

export function parsePaymentChoice(value: string): {
  providerId: string
  alias: string | null
} {
  const at = value.indexOf(CHOICE_SEPARATOR)
  if (at === -1) {
    return { providerId: value, alias: null }
  }
  const alias = value.slice(at + CHOICE_SEPARATOR.length)
  return { providerId: value.slice(0, at), alias: isAlias(alias) ? alias : null }
}

export const ROBOKASSA_ORIGIN = "https://auth.robokassa.ru"

export type RobokassaPaymentRequest = {
  /** The alias Robokassa opens on, `null` when the session does not list the pick. */
  alias: string | null
  /** The fields for `Robokassa.Render`, `Settings` included; `null` for a session built before the modal. */
  modalParams: Record<string, string> | null
  /** The full-page fallback, `payment_url` with `IncCurrLabel`. */
  redirectUrl: string | null
  successUrl: string | null
  failUrl: string | null
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

/**
 * What paying with the session's data opens, for the alias the buyer picked.
 *
 * - The alias reaches Robokassa only when the session lists it in
 *   `payment_methods`: as `IncCurrLabel` and as the iframe's only
 *   `Settings.PaymentMethods` entry, so the modal shows that one method and no
 *   method-choice screen. Off the list, Robokassa opens with its own choice.
 * - `payment_fields` are posted exactly as the backend signed them. Neither
 *   addition enters Robokassa's signature (pay-interface doc, «Сборка
 *   подписи»), so the signature stays valid.
 * - A session without `payment_fields` (built before this change) has no modal
 *   request; the button then sends the buyer to `payment_url` as before.
 */
export function robokassaPaymentRequest(
  data: Record<string, unknown> | null | undefined,
  pickedAlias: string | null | undefined
): RobokassaPaymentRequest {
  const allowed = Array.isArray(data?.payment_methods)
    ? (data.payment_methods as unknown[]).filter(isAlias)
    : []
  const alias =
    pickedAlias && isAlias(pickedAlias) && allowed.includes(pickedAlias)
      ? pickedAlias
      : null

  const rawFields = data?.payment_fields
  let modalParams: Record<string, string> | null = null
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    const entries = Object.entries(rawFields as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
    const fields = Object.fromEntries(entries)
    if (fields.MerchantLogin && fields.OutSum && fields.SignatureValue) {
      modalParams = {
        ...fields,
        ...(alias ? { IncCurrLabel: alias } : {}),
        Settings: JSON.stringify(
          alias ? { PaymentMethods: [alias], Mode: "modal" } : { Mode: "modal" }
        ),
      }
    }
  }

  const paymentUrl = stringOrNull(data?.payment_url)
  const redirectUrl =
    paymentUrl && paymentUrl.startsWith(`${ROBOKASSA_ORIGIN}/`)
      ? alias
        ? `${paymentUrl}&IncCurrLabel=${encodeURIComponent(alias)}`
        : paymentUrl
      : null

  return {
    alias,
    modalParams,
    redirectUrl,
    successUrl: stringOrNull(data?.success_url),
    failUrl: stringOrNull(data?.fail_url),
  }
}

/**
 * Whether a URL Robokassa asks the page to open is the session's own
 * `FailUrl2`: the modal then stays a modal and the buyer stays on the filled
 * checkout instead of being sent away from it.
 */
export function isRobokassaFailReturn(
  url: unknown,
  failUrl: string | null
): boolean {
  if (typeof url !== "string" || !failUrl) {
    return false
  }
  try {
    const target = new URL(url)
    const fail = new URL(failUrl)
    return (
      target.origin === fail.origin &&
      target.pathname === fail.pathname &&
      target.searchParams.get("outcome") === "fail"
    )
  } catch {
    return false
  }
}
