import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currencyDisplay: "symbol",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}

/**
 * A tile's price: whole units when the amount has no fraction («1 050 ₽», not «1 050,00 ₽»),
 * otherwise the string the caller already formatted (t-2026-10-20-61 D3).
 */
export const convertToWholeLocale = (
  params: ConvertToLocaleParams,
  formatted: string
) =>
  Number.isInteger(params.amount)
    ? convertToLocale({
        ...params,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : formatted
