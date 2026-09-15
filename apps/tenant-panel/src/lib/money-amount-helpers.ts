import { currencies } from "./data/currencies"

export const getDecimalDigits = (currency: string) => {
  return currencies[currency.toUpperCase()]?.decimal_digits ?? 0
}

/**
 * Returns a formatted amount based on the currency code using the browser's locale
 * @param amount - The amount to format
 * @param currencyCode - The currency code to format the amount in
 * @returns - The formatted amount
 *
 * @example
 * getFormattedAmount(10, "usd") // '$10.00' if the browser's locale is en-US
 * getFormattedAmount(10, "usd") // '10,00 $' if the browser's locale is fr-FR
 */
export const getLocaleAmount = (amount: number, currencyCode: string) => {
  const formatter = new Intl.NumberFormat([], {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: currencyCode,
  })

  return formatter.format(amount)
}

export const getNativeSymbol = (currencyCode: string) => {
  const formatted = new Intl.NumberFormat([], {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
  }).format(0)

  return formatted.replace(/\d/g, "").replace(/[.,]/g, "").trim()
}

/**
 * Formats an amount for emphasis (totals, summaries): full decimal precision
 * for the currency plus the sign convention for near-zero amounts. Unlike
 * `getStylizedAmount`'s previous "symbol amount CODE" shape, this follows the
 * browser's locale for symbol placement (e.g. "1 084,00 ₽" under ru), because
 * showing both the native symbol and the ISO code together read as a raw,
 * doubled-up value on a single-locale storefront.
 */
export const getStylizedAmount = (amount: number, currencyCode: string) => {
  const decimalDigits = getDecimalDigits(currencyCode)

  const lessThanRoundingPrecission = isAmountLessThenRoundingError(
    amount,
    currencyCode
  )

  const formatter = new Intl.NumberFormat([], {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: currencyCode,
    minimumFractionDigits: decimalDigits,
    maximumFractionDigits: decimalDigits,
    signDisplay: lessThanRoundingPrecission ? "exceptZero" : "auto",
  })

  return formatter.format(amount)
}

/**
 * Returns true if the amount is less than the rounding error for the currency
 * @param amount - The amount to check
 * @param currencyCode - The currency code to check the amount in
 * @returns - True if the amount is less than the rounding error, false otherwise
 *
 * For example returns true if amount is < 0.005 for a USD | EUR etc.
 */
export const isAmountLessThenRoundingError = (
  amount: number,
  currencyCode: string
) => {
  const decimalDigits = getDecimalDigits(currencyCode)
  return Math.abs(amount) < 1 / 10 ** decimalDigits / 2
}
