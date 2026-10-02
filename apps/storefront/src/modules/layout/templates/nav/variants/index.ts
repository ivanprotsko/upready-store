import type { ComponentType } from "react"

import type { HeaderKey } from "@lib/theme/composition"

import NavH1 from "./h1"
import NavH2 from "./h2"
import NavH3 from "./h3"
import NavH4 from "./h4"
import NavH5 from "./h5"
import NavH6 from "./h6"
import NavH7 from "./h7"

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
 * All six keys are built as of W9/W10 (header H2-H4, H5/H6 + the category-count
 * loader in `lib/data/categories.ts`), each ported from the composer's own markup and
 * CSS — see each variant file's own doc comment for its `blocks.js`/`blocks.css`
 * source lines.
 */
export const NAV_VARIANTS: Record<NavVariantKey, ComponentType> = {
  h1: NavH1,
  h2: NavH2,
  h3: NavH3,
  h4: NavH4,
  h5: NavH5,
  h6: NavH6,
  h7: NavH7,
}

/** `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline. */
export const DEFAULT_HEADER: HeaderKey = "h1"

/**
 * `h7` is the Olavka redesign header (`./h7.tsx`, Ivan's Figma node 227-8180). It is NOT
 * part of the composition contract (`lib/theme/composition.ts` `HeaderKey`, the panel
 * picker, the backend enum and `composition-contract.json` all still end at `h6`), so no
 * tenant can save it and no existing document changes meaning. `nav/index.tsx` renders it
 * for the Olavka shop only (`isOlavkaShop()`, `@lib/data/olavka-shop`), ahead of that
 * shop's saved `settings.header` — the same precedence `footer/index.tsx` already gives
 * `FooterOlavka`. A future panel key replaces this with a real `HeaderKey` member.
 */
export type NavVariantKey = HeaderKey | "h7"
