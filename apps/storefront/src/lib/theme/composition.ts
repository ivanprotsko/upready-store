/**
 * The site-wide block-composition document: which version of each home-page block
 * (header, hero, category tiles, listing, footer) a stand shows, plus the default
 * light/dark mode a visitor who has never switched sees. One document, server-side,
 * shown to every visitor of the stand — the opposite of `AXES` in `attributes.ts`,
 * which is per-browser `localStorage` only (rule: order t-2026-09-09-02, point 1;
 * `settings-persistence-deploy-map.md` §5.1).
 *
 * Runtime shape and vocabulary source: `artifacts/docs/2026-09-09-panel-composition-
 * mockup.md` §C1/§C4 and `artifacts/docs/2026-09-09-composition-contract.json`
 * (design-time vocabulary; this file hand-transcribes it into a build-time TypeScript
 * contract, the same way `AXES` below is not fetched at runtime — see that file's own
 * doc comment). Backend counterpart: `apps/backend/src/api/store/storefront-settings/
 * route.ts`, which keeps its own transcription of the same enums/FORBIDDEN pairs —
 * there is no shared package between the two apps to import this from
 * (`pnpm-workspace.yaml` lists only `apps/**`).
 *
 * Pure module — no `"use client"` / `"use server"` — so both the SSR settings loader
 * (W3) and the client popover (W6) import it directly, the way `attributes.ts` is
 * imported by both `pre-paint.ts` and `apply.ts`.
 */

export type Mode = "light" | "dark"
export type HeaderKey = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
export type HeroKey = "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb"
export type TilesKey = "on" | "off"
export type ListingKey = "none" | "p1" | "p2" | "p3" | "p4" | "p5"
export type FooterKey = "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7"

/** The five operator-set slots, before the server stamps `updatedAt`. */
export type StorefrontSettingsInput = {
  defaultMode: Mode
  header: HeaderKey
  hero: HeroKey
  tiles: TilesKey
  listing: ListingKey
  footer: FooterKey
}

/** `store.metadata.storefrontSettings` — panel-composition-mockup.md §C1. */
export type StorefrontSettings = StorefrontSettingsInput & {
  /** ISO 8601, stamped server-side on every successful PUT — never sent by the client. */
  updatedAt: string
}

export const SCHEMA_ID = "upready.storefront-settings/v1"

export const HEADER_KEYS: readonly HeaderKey[] = ["h1", "h2", "h3", "h4", "h5", "h6"]
export const HERO_KEYS: readonly HeroKey[] = ["none", "g", "h", "j", "k", "l", "m", "ga", "gb"]
export const TILES_KEYS: readonly TilesKey[] = ["on", "off"]
export const LISTING_KEYS: readonly ListingKey[] = ["none", "p1", "p2", "p3", "p4", "p5"]
export const FOOTER_KEYS: readonly FooterKey[] = [
  "none",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
]

/**
 * Plain-language labels, one next-intl key per value (rule: never hardcode a
 * user-facing string). Each value here is a full `Namespace.key` next-intl key, not
 * display text — the English text for every one of them is listed in
 * `.ai/strings/C1.json`, {namespace, key, en}, for the Locale stage to fill into all
 * 36 catalogs. English wording matches panel-composition-mockup.md's own vocabulary
 * section verbatim (translated from the composer's Russian labels, Ivan's own example
 * wording where he supplied it).
 */
export const HEADER_LABELS: Record<HeaderKey, string> = {
  h1: "Composition.header.h1",
  h2: "Composition.header.h2",
  h3: "Composition.header.h3",
  h4: "Composition.header.h4",
  h5: "Composition.header.h5",
  h6: "Composition.header.h6",
}
export const HERO_LABELS: Record<HeroKey, string> = {
  none: "Composition.hero.none",
  g: "Composition.hero.g",
  h: "Composition.hero.h",
  j: "Composition.hero.j",
  k: "Composition.hero.k",
  l: "Composition.hero.l",
  m: "Composition.hero.m",
  ga: "Composition.hero.ga",
  gb: "Composition.hero.gb",
}
export const TILES_LABELS: Record<TilesKey, string> = {
  on: "Composition.tiles.on",
  off: "Composition.tiles.off",
}
export const LISTING_LABELS: Record<ListingKey, string> = {
  none: "Composition.listing.none",
  p1: "Composition.listing.p1",
  p2: "Composition.listing.p2",
  p3: "Composition.listing.p3",
  p4: "Composition.listing.p4",
  p5: "Composition.listing.p5",
}
export const FOOTER_LABELS: Record<FooterKey, string> = {
  none: "Composition.footer.none",
  f1: "Composition.footer.f1",
  f2: "Composition.footer.f2",
  f3: "Composition.footer.f3",
  f4: "Composition.footer.f4",
  f5: "Composition.footer.f5",
  f6: "Composition.footer.f6",
  f7: "Composition.footer.f7",
}

/** A blocking pair: saving `field: value` while `against: againstValue` 422s. */
export type ForbiddenRule = {
  field: keyof StorefrontSettingsInput
  value: string
  against: keyof StorefrontSettingsInput
  againstValue: string
  reason: string
}

/** Same shape, never blocks a save — the panel shows it, the backend still accepts it. */
export type AdvisoryRule = {
  field: keyof StorefrontSettingsInput
  values: readonly string[]
  against: keyof StorefrontSettingsInput
  againstValue: string
  reason: string
}

/**
 * Hand-transcribed from `composition-contract.json`'s `validity` array
 * (`type: "forbidden"` entries), not fetched at runtime — see the module doc comment.
 */
export const FORBIDDEN: readonly ForbiddenRule[] = [
  {
    field: "header",
    value: "h4",
    against: "hero",
    againstValue: "k",
    reason:
      "Header Accent and hero Announcement both fill their bar with the accent, nothing between.",
  },
  {
    field: "footer",
    value: "f6",
    against: "defaultMode",
    againstValue: "dark",
    reason:
      "Footer Inverted giant wordmark turns light on a dark page — reads as detached, not a foundation.",
  },
]

/** `composition-contract.json`'s one `type: "advisory"` entry — never blocks a save. */
export const ADVISORY: readonly AdvisoryRule[] = [
  {
    field: "hero",
    values: ["ga", "gb"],
    against: "tiles",
    againstValue: "on",
    reason:
      "The gallery and the category-tiles row both route into categories on the first screen — functionally redundant, not visually broken.",
  },
]

/**
 * The first blocking rule `next` violates, or null. The same check runs in three
 * places so no path bypasses it (panel-composition-mockup.md §C7): the popover greys
 * an option live, the storefront proxy re-checks the assembled document, and the
 * backend re-checks it again before writing — the one place that truly cannot be
 * skipped.
 */
export function isForbidden(next: StorefrontSettingsInput): ForbiddenRule | null {
  for (const rule of FORBIDDEN) {
    if (next[rule.field] === rule.value && next[rule.against] === rule.againstValue) {
      return rule
    }
  }
  return null
}

/** The first advisory rule `next` matches, or null. Never blocks a save. */
export function isAdvisory(next: StorefrontSettingsInput): AdvisoryRule | null {
  for (const rule of ADVISORY) {
    if (
      (rule.values as readonly string[]).includes(next[rule.field] as string) &&
      next[rule.against] === rule.againstValue
    ) {
      return rule
    }
  }
  return null
}

export type FieldError = { field: string; message: string }

const ENUMS: Record<keyof StorefrontSettingsInput, readonly string[]> = {
  defaultMode: ["light", "dark"],
  header: HEADER_KEYS,
  hero: HERO_KEYS,
  tiles: TILES_KEYS,
  listing: LISTING_KEYS,
  footer: FOOTER_KEYS,
}

/**
 * Field-level validation only (400 `invalid_field` territory): every one of the five
 * slots present, a string, and a member of its own enum. Does NOT check `FORBIDDEN` —
 * call `isForbidden()` separately once the fields validate, so a 422 response never
 * carries a misleadingly-shaped 400 body. `validate()` below runs both in order.
 */
export function validateFields(input: unknown): FieldError[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "_root", message: "Body must be a JSON object." }]
  }
  const body = input as Record<string, unknown>
  const errors: FieldError[] = []
  for (const field of Object.keys(ENUMS) as (keyof StorefrontSettingsInput)[]) {
    const value = body[field]
    const allowed = ENUMS[field]
    if (typeof value !== "string" || !allowed.includes(value)) {
      errors.push({ field, message: `${field} must be one of: ${allowed.join(", ")}.` })
    }
  }
  return errors
}

/**
 * Full validation: field shape, then the forbidden-pair check — matching what the
 * backend PUT route does (panel-composition-mockup.md §C2/§C7). `ok: false` carries
 * either `errors` (400 `invalid_field`) or `rule` (422 `forbidden_combination`), never
 * both, so a caller can render one failure frame from `kind` alone.
 */
export type ValidationResult =
  | { ok: true; value: StorefrontSettingsInput }
  | { ok: false; kind: "invalid_field"; errors: FieldError[] }
  | { ok: false; kind: "forbidden_combination"; rule: ForbiddenRule }

export function validate(input: unknown): ValidationResult {
  const errors = validateFields(input)
  if (errors.length > 0) return { ok: false, kind: "invalid_field", errors }
  const value = input as StorefrontSettingsInput
  const forbidden = isForbidden(value)
  if (forbidden) return { ok: false, kind: "forbidden_combination", rule: forbidden }
  return { ok: true, value }
}

export type ProfileId =
  | "sneakers"
  | "electronics"
  | "supplements"
  | "womens-fashion"
  | "home-goods"

/**
 * `composition-contract.json`'s `profileDefaults`, hand-transcribed, with TWO
 * deliberate changes from the source JSON. The first: sneakers' own primary default
 * names hero `l` ("In motion"), which has no storefront schema at all — zero `frames` on any
 * profile (`block-port-map.md` §4 hero-L row; `grep -c frames
 * .../profiles/sneakers/profile.json` → `0`). Ivan's fork answer F9 says to seed the
 * Kerbstone ALTERNATE composition until hero L ships — but
 * `composition-contract.json`'s own `alternates.sneakers.hero` is ALSO `"l"` (both of
 * Kerbstone's saved composer versions assume the same unbuilt asset; verified
 * directly against `artifacts/docs/composer/versions.json`, not just the contract
 * JSON's summary). Neither saved sneakers version actually supplies a hero that
 * renders today. Resolved here by falling back one level further, to hero `k`
 * (Announcement) — the only hero already fully implemented
 * (`profile-hero/index.tsx:138-165`) — which matches the stated INTENT behind F9
 * ("a default that cannot render is not a default",
 * `2026-09-09-wave1-critique-and-plan.md` §2.10) better than either saved sneakers
 * version does. Reported as a fork in this package's own report; W8 (the seed script)
 * should re-check this the moment hero L ships a real component.
 *
 * The second: supplements turns the category tiles `on`, where its saved composer
 * version (`v-20260909-scruple-apteka`) has none. Under the announcement hero, which
 * carries no picture, the tiles are the only way into the catalog's three categories
 * on the first screen (COO decision on q-scruple-home-thin-seed, 2026-09-30, task
 * t-2026-09-30-17). The contract JSON keeps the composer's own version as it was saved.
 */
export const PROFILE_DEFAULTS: Record<ProfileId, StorefrontSettingsInput> = {
  sneakers: {
    defaultMode: "dark",
    header: "h5",
    hero: "k",
    tiles: "off",
    listing: "p2",
    footer: "f3",
  },
  electronics: {
    defaultMode: "dark",
    header: "h3",
    hero: "k",
    tiles: "on",
    listing: "p3",
    footer: "f5",
  },
  supplements: {
    defaultMode: "light",
    header: "h6",
    hero: "k",
    tiles: "on",
    listing: "p3",
    footer: "f6",
  },
  "womens-fashion": {
    defaultMode: "light",
    header: "h6",
    hero: "g",
    tiles: "off",
    listing: "p4",
    footer: "f6",
  },
  "home-goods": {
    defaultMode: "light",
    header: "h2",
    hero: "h",
    tiles: "on",
    listing: "p4",
    footer: "f4",
  },
}

/**
 * A pickup point drawn from a `"pickup"`-type fulfillment set (W14 seeds these; none
 * exist on any stand today — `checkout-account-map.md` §2). Field shape confirmed
 * live against `GET /store/shipping-options` — see `.ai/probes.md` probe 2.
 */
export type PickupPoint = {
  id: string
  name: string
  /** `address_1` first, then `address_2` only when the stock location's address sets it. */
  addressLines: string[]
  city: string
  /**
   * `stock_location.metadata.opening_hours` (plain text, e.g. "Mon–Sat 10:00–20:00").
   * Null until W14 seeds it — Ivan's fork answer F6 puts opening hours in
   * `stock_location.metadata`, confirmed as the only field with nothing there today
   * (`grep -rn opening apps/backend/src` → 0 hits, `checkout-states-mockup.md` §Facts,
   * `account-mockup.md` §4a).
   */
  openingHours: string | null
}

/**
 * Cart AND order metadata keys the checkout writes/reads for a chosen pickup point —
 * one key set for both. Confirmed by probe 1 (`.ai/probes.md`): `cart.metadata` is
 * copied onto `order.metadata` verbatim by `completeCartWorkflow`
 * (`@medusajs/core-flows/dist/cart/workflows/complete-cart.js:454`,
 * `metadata: cart.metadata,`, then passed through unmodified by `createOrdersStep` —
 * `.../order/steps/create-orders.js:26`), live-measured end to end against
 * `http://localhost:9023`. So no cart-to-order translation layer is needed. Naming is
 * snake_case, matching the metadata keys `checkout-info-rows/index.tsx:47-53` already
 * reads (`contact_first_name`, `has_different_recipient`).
 */
export const PICKUP_METADATA_KEYS = {
  id: "pickup_point_id",
  name: "pickup_point_name",
  address: "pickup_point_address",
  hours: "pickup_point_hours",
} as const

export type PickupMetadataKey = (typeof PICKUP_METADATA_KEYS)[keyof typeof PICKUP_METADATA_KEYS]
