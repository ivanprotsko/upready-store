/**
 * The cookie the demo till sets and the onboarding page reads. It lives in its
 * own module rather than in the route handler that writes it: a page importing
 * a value out of `app/api/**\/route.ts` drags that route's module graph into
 * the page bundle, which is a build-shaped surprise nobody asked for.
 *
 * httpOnly, so only the server that ran the classification can set it — the
 * screen says "оплачено" on the strength of this, and a client that never
 * opened the till must not be able to write it.
 */
export const PAID_COOKIE = "demo_paid"

export type PaidRecord = {
  funnel: number
  serviceId: string
  planId: string
  price: number
  at: string
}

/**
 * The same cookie, written by the till when it was entered from a pricing
 * button (t-2026-09-25-08) rather than from one of the four funnels. `kind`
 * says which button: `paid` for «оплата сначала», `trial` for «карта и пробный
 * период». Either way the till is the demo one and nothing was charged or bound.
 */
export type TariffPaidRecord = {
  kind: "paid" | "trial"
  tariff: string
  trialDays: number | null
  at: string
}

export function readTariffPaidRecord(raw: string | undefined): TariffPaidRecord | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<TariffPaidRecord>
    if ((value.kind === "paid" || value.kind === "trial") && typeof value.tariff === "string") {
      return {
        kind: value.kind,
        tariff: value.tariff,
        trialDays: typeof value.trialDays === "number" ? value.trialDays : null,
        at: String(value.at ?? ""),
      }
    }
  } catch {
    // Not ours, or not readable: the caller falls back to what the URL says.
  }
  return null
}
