import type { ComponentType } from "react"

import type { HeaderKey } from "@lib/theme/composition"

import NavH1 from "./h1"

/**
 * Header composition registry: every operator-set `header` key (H1-H6,
 * `lib/theme/composition.ts` `HeaderKey`) maps to the zero-prop server component
 * `nav/index.tsx`'s switch renders for it. Every entry fetches its own data the way
 * `NavH1` always has (`listRegions()`, `getCountryCode()`) — nothing here prop-drills
 * beyond the single `header` key that selected it, and none of them takes `ModeToggle`
 * as a prop; a variant that wants the visitor mode toggle imports it directly, the way
 * `NavH1` does (panel-composition-mockup.md §S11: first in the utility cluster, before
 * Search, `lg:` only).
 *
 * Only H1 is built (`block-port-map.md` §3: H2-H6 are net-new components, ~90-130 lines
 * each, priced but not built). Every other key maps to `NavH1` as a placeholder —
 * W9/W10 (header H2-H4, H5/H6 + the category-count loader) replace exactly the one
 * entry each ships, leaving this shape and every still-placeholder key untouched.
 */
export const NAV_VARIANTS: Record<HeaderKey, ComponentType> = {
  h1: NavH1,
  h2: NavH1,
  h3: NavH1,
  h4: NavH1,
  h5: NavH1,
  h6: NavH1,
}

/** `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline. */
export const DEFAULT_HEADER: HeaderKey = "h1"
