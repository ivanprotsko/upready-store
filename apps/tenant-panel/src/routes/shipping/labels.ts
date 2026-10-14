import type { TFunction } from "i18next"

import type {
  MethodZone,
  ShippingTariff,
  TenantShippingMethod,
} from "../../hooks/api/shipping-methods"
import { formatCurrency } from "../../lib/format-currency.ts"

// Plain-language labels for the raw enums the backend stores (rule 18e: a
// raw enum reaches the screen only through a label map).
//
// t-2026-10-14-01 (panel redesign, G2): every label is a key under
// `shippingMethods` in ru.json/en.json (panel-ds rule 7), and money goes
// through the panel's one formatter (rule 14: «350,00 ₽»). The file has no JSX,
// so `shipping-g2.test.mjs` imports and runs it for real.

type T = TFunction<"translation">

export const TARIFF_KINDS: readonly ShippingTariff["kind"][] = ["flat", "per_kg", "free_above"]

/** The countries a method's zone can name, in the order the form offers them. */
export const SHIPPING_COUNTRIES = [
  "ru",
  "by",
  "kz",
  "am",
  "kg",
  "uz",
  "ge",
  "us",
  "de",
  "fr",
  "gb",
  "it",
  "es",
  "tr",
  "ae",
  "cn",
] as const

const KNOWN_CARRIERS = ["cdek", "post_ru", "courier", "pickup"]

export const tariffKindLabel = (t: T, kind: ShippingTariff["kind"]): string =>
  t(`shippingMethods.tariff.kinds.${kind}`)

export const tariffKindHint = (t: T, kind: ShippingTariff["kind"]): string =>
  t(`shippingMethods.tariff.hints.${kind}`)

export const countryName = (t: T, code: string): string => {
  const key = code.toLowerCase()
  return (SHIPPING_COUNTRIES as readonly string[]).includes(key)
    ? t(`shippingMethods.countries.${key}`)
    : code.toUpperCase()
}

export const formatAmount = (amount: number, currency: string): string => {
  try {
    return formatCurrency(amount, currency.toUpperCase())
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

export const tariffSummary = (
  t: T,
  tariff: ShippingTariff,
  currency: string
): string => {
  switch (tariff.kind) {
    case "flat":
      return tariff.amount === 0
        ? t("shippingMethods.tariff.free")
        : formatAmount(tariff.amount, currency)
    case "per_kg": {
      const parts = [
        t("shippingMethods.tariff.perKg", {
          amount: formatAmount(tariff.per_kg_amount, currency),
        }),
      ]
      if (tariff.base_amount > 0) {
        parts.unshift(formatAmount(tariff.base_amount, currency))
      }
      const summary = parts.join(" + ")
      return tariff.min_weight_g
        ? t("shippingMethods.tariff.withMinimum", {
            summary,
            grams: tariff.min_weight_g,
          })
        : summary
    }
    case "free_above":
      return t("shippingMethods.tariff.freeAbove", {
        amount: formatAmount(tariff.amount, currency),
        total: formatAmount(tariff.free_above_total, currency),
      })
  }
}

/**
 * The zone as the list shows it. The backend names every zone it saves
 * (`zone.label`, «Урал»), so the panel prints that name rather than counting
 * regions again; the count below is for a method saved before zones had names.
 */
export const methodZoneSummary = (t: T, method: TenantShippingMethod): string =>
  method.zone_label || zoneSummary(t, method.zone)

export const zoneSummary = (t: T, zone: MethodZone | null): string => {
  if (!zone) {
    return t("shippingMethods.zone.everywhere")
  }
  const country = countryName(t, zone.country_code)
  if (!zone.provinces.length) {
    return t("shippingMethods.zone.wholeCountry", { country })
  }
  return t("shippingMethods.zone.regions", {
    country,
    count: zone.provinces.length,
  })
}

export const carrierLabel = (t: T, key: string | null): string | null =>
  key
    ? KNOWN_CARRIERS.includes(key)
      ? t(`shippingMethods.carriers.${key}`)
      : key
    : null

/**
 * The checkout order after one «Выше» (`-1`) or «Ниже» (`1`): the whole id
 * sequence `POST /tenants/shipping-methods/reorder` takes, or `null` when the
 * row is already first or last.
 */
export const moveMethodIds = (
  ids: string[],
  index: number,
  direction: -1 | 1
): string[] | null => {
  const target = index + direction
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) {
    return null
  }
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** The default weight the backend accepts: a whole number of grams, 1 to 100 000. */
export const isDefaultWeight = (value: string): boolean => {
  const grams = Number(value)
  return value.trim() !== "" && Number.isInteger(grams) && grams >= 1 && grams <= 100000
}
