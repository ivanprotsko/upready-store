/**
 * The platform pricing page as `GET /platform/pricing` answers it
 * (t-2026-09-25-08). The backend owns the shape and validates it with one zod
 * schema on every write and every read
 * (`apps/backend/src/modules/platform-pricing/schema.ts`); this file is the
 * storefront's hand-kept mirror of it, because the two apps share no package.
 * A field added there is added here.
 */

export type PricingIcon = "box" | "gear" | "globe" | "shield" | "guard" | "card" | "check"

export type ButtonAction =
  | { type: "link"; href: string }
  | { type: "onboarding_free" }
  | { type: "pay_first" }
  | { type: "card_trial"; trial_days: number }
  | { type: "onboarding_trial"; trial_days: number }

export type PricingButton = {
  label: string
  style: "solid" | "outline"
  action: ButtonAction
}

export type PricingTierPrice = { amount: string; period: string; note: string }

export type PricingTier = {
  id: string
  name: string
  short_name: string
  price: string
  price_note: string
  price_annual: PricingTierPrice | null
  recommended: boolean
  description: string
  plus: string
  features: { text: string; tip: string; note: string }[]
  button: PricingButton
  trial_days: number | null
}

export type PricingCellValue =
  | { type: "yes" }
  | { type: "no" }
  | { type: "text"; text: string }

export type PricingRow = {
  feature: string
  tip: string
  values: Record<string, PricingCellValue>
}

export type PricingSection = {
  icon: PricingIcon
  eyebrow: string
  heading: string
  chips: string[]
  more_chip: string
  rows: PricingRow[]
}

export type PricingDocument = {
  schema_version: 1
  page: { meta_title: string; eyebrow: string; title: string; note: string }
  highlights: { icon: PricingIcon; label: string; text: string }[]
  features_label: string
  tiers: PricingTier[]
  sections: PricingSection[]
  drawer: {
    eyebrow: string
    availability_label: string
    yes_label: string
    no_label: string
    close_label: string
  }
  explainers: { title: string; text: string }[]
  final: { title: string; text: string; tier_id: string | null; button: PricingButton }
}

export type PricingPayload = {
  pricing: PricingDocument
  revision: number
  updated_at: string
}
