import "server-only"

import { getPlatformPricing } from "@lib/data/platform-pricing"
import { PricingActionError, parseTariffEntry, type TariffEntry } from "@lib/platform-pricing/actions"
import type { PricingTier } from "@lib/platform-pricing/types"

/**
 * A pricing button's tariff as the till and the wizard see it
 * (t-2026-09-25-08): the `?tariff=` of the link, looked up in the SAME pricing
 * document `/pricing` was drawn from, so the till names the tier and the price
 * the visitor clicked and nothing the URL could invent.
 *
 *   null          → the link carries no tariff: one of the four old funnels
 *   { broken }    → a tariff that is malformed or no longer on the page
 *   { tier, … }   → the tier and, for a card trial, its length
 */
export type ResolvedTariff =
  | { broken: true; reason: string }
  | { broken: false; tier: PricingTier; trialDays: number | null }

export async function resolveTariffLink(params: {
  tariff?: string | string[]
  trial?: string | string[]
}): Promise<ResolvedTariff | null> {
  let entry: TariffEntry | null
  try {
    entry = parseTariffEntry(params)
  } catch (error) {
    if (error instanceof PricingActionError) return { broken: true, reason: error.message }
    throw error
  }
  if (!entry) return null

  const payload = await getPlatformPricing()
  const tier = payload?.pricing.tiers.find((t) => t.id === entry.tariff)
  if (!tier) {
    return { broken: true, reason: `tariff "${entry.tariff}" is not on the pricing page` }
  }
  return { broken: false, tier, trialDays: entry.trialDays }
}

/** «1 день», «3 дня», «14 дней». */
export function daysLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`
  return `${n} дней`
}
