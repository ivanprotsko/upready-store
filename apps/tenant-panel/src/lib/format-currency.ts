import { panelLocale } from "./panel-locale.ts"

export const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat(panelLocale(), {
    style: "currency",
    currency,
    signDisplay: "auto",
  }).format(amount)
}
