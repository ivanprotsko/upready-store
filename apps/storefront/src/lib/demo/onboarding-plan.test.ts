import { describe, expect, it } from "vitest"

import { resolveOnboardingPlan } from "./onboarding-plan"
import type { PricingTier } from "@lib/platform-pricing/types"

const tier = (id: string, trial_days: number | null): PricingTier => ({
  id,
  name: id,
  short_name: "",
  price: "",
  price_note: "",
  price_annual: null,
  recommended: false,
  description: "",
  plus: "",
  features: [],
  button: { label: "", style: "solid", action: { type: "onboarding_free" } },
  trial_days,
})

const TIERS = [tier("novice", null), tier("pro", 3), tier("master", 7)]

describe("resolveOnboardingPlan", () => {
  it("resolves a tariff the URL named", () => {
    expect(resolveOnboardingPlan(TIERS, "pro")).toEqual({ tier: TIERS[1], unknown: false })
  })

  it("falls back to novice when the URL names no tariff at all", () => {
    expect(resolveOnboardingPlan(TIERS, null)).toEqual({ tier: TIERS[0], unknown: false })
  })

  it("falls back to novice and flags an unknown tariff", () => {
    expect(resolveOnboardingPlan(TIERS, "nope")).toEqual({ tier: TIERS[0], unknown: true })
  })

  it("takes no trial length parameter at all: a forged trial has nothing to attach to", () => {
    // This is the whole proof: the function signature has no room for a trial
    // length, so whatever the browser's URL claimed (`trial=365`) never
    // reaches the result — only `tier.trial_days` of the RESOLVED tier does.
    expect(resolveOnboardingPlan.length).toBe(2)
    const resolved = resolveOnboardingPlan(TIERS, "pro")
    expect(resolved.tier?.trial_days).toBe(3)
  })

  it("returns tier: null when the pricing document itself has no tiers", () => {
    expect(resolveOnboardingPlan([], "pro")).toEqual({ tier: null, unknown: true })
    expect(resolveOnboardingPlan([], null)).toEqual({ tier: null, unknown: false })
  })
})
