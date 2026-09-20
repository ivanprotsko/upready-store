import type {
  MethodZone,
  ShippingTariff,
  TenantShippingMethod,
} from "../../hooks/api/shipping-methods"

// Plain-language labels for the raw enums the backend stores (rule 18e: a
// raw enum reaches the screen only through a label map).

export const TARIFF_KIND_LABEL: Record<ShippingTariff["kind"], string> = {
  flat: "Фиксированная цена",
  per_kg: "По весу (за кг)",
  free_above: "Бесплатно от суммы",
}

export const TARIFF_KIND_HINT: Record<ShippingTariff["kind"], string> = {
  flat: "Одна цена за весь заказ, независимо от веса и суммы.",
  per_kg:
    "Цена = базовая ставка + ставка за килограмм × вес заказа. Вес берётся из карточек товаров; если у товара вес не указан, подставляется вес по умолчанию (настройка ниже списка).",
  free_above:
    "Фиксированная цена, которая обнуляется, когда сумма товаров в заказе достигает порога.",
}

export const COUNTRY_LABEL: Record<string, string> = {
  ru: "Россия",
  by: "Беларусь",
  kz: "Казахстан",
  am: "Армения",
  kg: "Киргизия",
  uz: "Узбекистан",
  ge: "Грузия",
  us: "США",
  de: "Германия",
  fr: "Франция",
  gb: "Великобритания",
  it: "Италия",
  es: "Испания",
  tr: "Турция",
  ae: "ОАЭ",
  cn: "Китай",
}

export const countryName = (code: string): string =>
  COUNTRY_LABEL[code.toLowerCase()] ?? code.toUpperCase()

export const formatAmount = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

export const tariffSummary = (
  tariff: ShippingTariff,
  currency: string
): string => {
  switch (tariff.kind) {
    case "flat":
      return tariff.amount === 0
        ? "Бесплатно"
        : formatAmount(tariff.amount, currency)
    case "per_kg": {
      const parts = [`${formatAmount(tariff.per_kg_amount, currency)}/кг`]
      if (tariff.base_amount > 0) {
        parts.unshift(formatAmount(tariff.base_amount, currency))
      }
      const min = tariff.min_weight_g
        ? `, минимум ${tariff.min_weight_g} г`
        : ""
      return `${parts.join(" + ")}${min}`
    }
    case "free_above":
      return `${formatAmount(tariff.amount, currency)}, бесплатно от ${formatAmount(
        tariff.free_above_total,
        currency
      )}`
  }
}

/**
 * The zone as the list shows it. The backend names every zone it saves
 * (`zone.label`, «Урал»), so the panel prints that name rather than counting
 * regions again; the count below is for a method saved before zones had names.
 */
export const methodZoneSummary = (method: TenantShippingMethod): string =>
  method.zone_label || zoneSummary(method.zone)

export const zoneSummary = (zone: MethodZone | null): string => {
  if (!zone) {
    return "Все страны магазина"
  }
  if (!zone.provinces.length) {
    return `${countryName(zone.country_code)}, вся страна`
  }
  const count = zone.provinces.length
  const word =
    count % 10 === 1 && count % 100 !== 11
      ? "регион"
      : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)
        ? "региона"
        : "регионов"
  return `${countryName(zone.country_code)}, ${count} ${word}`
}

export const methodSummary = (method: TenantShippingMethod): string =>
  tariffSummary(method.tariff, method.currency_code)

export const CARRIER_LABEL: Record<string, string> = {
  cdek: "СДЭК",
  post_ru: "Почта России",
  courier: "Свой курьер",
  pickup: "Самовывоз",
}

export const carrierLabel = (key: string | null): string | null =>
  key ? (CARRIER_LABEL[key] ?? key) : null
