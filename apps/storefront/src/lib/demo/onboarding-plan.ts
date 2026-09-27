import type { PricingTier } from "@lib/platform-pricing/types"

export const DEFAULT_ONBOARDING_TARIFF = "novice"

export type ResolvedOnboardingPlan = {
  tier: PricingTier | null
  /** True when the caller named a tariff that is not (or no longer) on the pricing page. */
  unknown: boolean
}

/**
 * The wizard's server route (`/api/demo/onboarding`) resolving the tariff to
 * store on the tenant (t-2026-09-27-05, order o-20260921-01 answer 3b/7a).
 *
 * This function takes no trial length at all, on purpose: the ONLY source for
 * how long a trial runs is `tier.trial_days`, from the SAME pricing document
 * `requestedTariff` is looked up in. A caller cannot pass a forged trial
 * through this function even by mistake, because there is no parameter for
 * one — the trial length the route stores always comes from `tier.trial_days`
 * of whatever this function returns.
 *
 *   - `requestedTariff` matches a tier            -> that tier, `unknown: false`
 *   - `requestedTariff` is null (no tariff at all) -> the default tier, `unknown: false`
 *   - `requestedTariff` matches no tier            -> the default tier, `unknown: true`
 *   - the pricing document itself has no tiers     -> `tier: null`, `unknown` as above
 */
export function resolveOnboardingPlan(
  tiers: PricingTier[],
  requestedTariff: string | null
): ResolvedOnboardingPlan {
  const requested = requestedTariff ? tiers.find((t) => t.id === requestedTariff) : undefined
  const fallback = tiers.find((t) => t.id === DEFAULT_ONBOARDING_TARIFF) ?? null
  const tier = requested ?? fallback
  const unknown = requestedTariff !== null && requested === undefined

  return { tier, unknown }
}
