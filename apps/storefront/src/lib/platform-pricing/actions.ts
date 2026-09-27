/**
 * Where a pricing button leads (Ivan's order 4.1.1, t-2026-09-25-08): the one
 * place an action chosen in the admin becomes an `href`.
 *
 *   link             → the address as saved (`#final`, `/start`, `https://…`)
 *   onboarding_free  → the shop wizard straight away, no payment
 *   pay_first        → the till, then the wizard
 *   card_trial       → the till in card-entry mode with the trial length, then the wizard
 *   onboarding_trial → the shop wizard straight away, with the trial length, no card and no till
 *
 * There is no payment provider behind the till yet (t-2026-09-25-06): it is the
 * demo till of `/start/pay`, and the till says so on screen. `onboarding_trial`
 * (t-2026-09-27-05) never touches the till at all, by design: Ivan's answer 3b
 * puts paid tiers into a trial with no card.
 *
 * A missing or unknown action, a trial with no valid length or a funnel action
 * with no tariff THROWS. A button that silently fell back to some default would
 * send a visitor somewhere nobody chose (rule 20a); the backend validates the
 * same things, so reaching a throw here means the two disagree and somebody has
 * to look.
 */

export const TRIAL_DAYS_MIN = 1
export const TRIAL_DAYS_MAX = 365

export const ONBOARDING_PATH = "/start/onboarding"
export const TILL_PATH = "/start/pay"

export class PricingActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PricingActionError"
  }
}

const ALLOWED_HREF = /^(#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i
const TIER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isValidTrialDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TRIAL_DAYS_MIN &&
    value <= TRIAL_DAYS_MAX
  )
}

function funnelTier(tierId: string | null | undefined, type: string): string {
  if (!tierId || !TIER_ID.test(tierId)) {
    throw new PricingActionError(`action "${type}" needs a tariff id, got ${JSON.stringify(tierId)}`)
  }
  return tierId
}

/**
 * The `href` of a pricing button. `tierId` is the tariff the button belongs to
 * (a card's own tier, or `final.tier_id` for the final block); a `link` ignores it.
 * `action` is typed `unknown` on purpose: it arrives over the network.
 */
export function pricingButtonHref(action: unknown, tierId: string | null): string {
  if (!isRecord(action) || typeof action.type !== "string") {
    throw new PricingActionError(`pricing button has no action: ${JSON.stringify(action)}`)
  }

  switch (action.type) {
    case "link": {
      const href = action.href
      if (typeof href !== "string" || !ALLOWED_HREF.test(href)) {
        throw new PricingActionError(`link action has no usable href: ${JSON.stringify(href)}`)
      }
      return href
    }
    case "onboarding_free": {
      const params = new URLSearchParams({ tariff: funnelTier(tierId, action.type) })
      return `${ONBOARDING_PATH}?${params}`
    }
    case "pay_first": {
      const params = new URLSearchParams({ tariff: funnelTier(tierId, action.type) })
      return `${TILL_PATH}?${params}`
    }
    case "card_trial": {
      const tariff = funnelTier(tierId, action.type)
      if (!isValidTrialDays(action.trial_days)) {
        throw new PricingActionError(
          `card_trial needs trial_days between ${TRIAL_DAYS_MIN} and ${TRIAL_DAYS_MAX}, got ${JSON.stringify(action.trial_days)}`
        )
      }
      const params = new URLSearchParams({ tariff, trial: String(action.trial_days) })
      return `${TILL_PATH}?${params}`
    }
    case "onboarding_trial": {
      const tariff = funnelTier(tierId, action.type)
      if (!isValidTrialDays(action.trial_days)) {
        throw new PricingActionError(
          `onboarding_trial needs trial_days between ${TRIAL_DAYS_MIN} and ${TRIAL_DAYS_MAX}, got ${JSON.stringify(action.trial_days)}`
        )
      }
      const params = new URLSearchParams({ tariff, trial: String(action.trial_days) })
      return `${ONBOARDING_PATH}?${params}`
    }
    default:
      throw new PricingActionError(`unknown pricing button action "${action.type}"`)
  }
}

/** What the till and the wizard read back from a pricing button's URL. */
export type TariffEntry = { tariff: string; trialDays: number | null }

/**
 * The inverse of the funnel half of `pricingButtonHref`, for `/start/pay` and
 * `/start/onboarding`. Null when the URL carries no `tariff` at all (the old
 * funnels, untouched); a THROW when it carries one that is malformed, so the
 * page can say the link is broken instead of guessing.
 */
export function parseTariffEntry(params: {
  tariff?: string | string[]
  trial?: string | string[]
}): TariffEntry | null {
  const tariff = params.tariff
  if (tariff === undefined) return null
  if (typeof tariff !== "string" || !TIER_ID.test(tariff)) {
    throw new PricingActionError(`malformed tariff in the link: ${JSON.stringify(tariff)}`)
  }

  const trial = params.trial
  if (trial === undefined) return { tariff, trialDays: null }

  const days = typeof trial === "string" && /^\d+$/.test(trial) ? Number(trial) : NaN
  if (!isValidTrialDays(days)) {
    throw new PricingActionError(`malformed trial length in the link: ${JSON.stringify(trial)}`)
  }
  return { tariff, trialDays: days }
}
