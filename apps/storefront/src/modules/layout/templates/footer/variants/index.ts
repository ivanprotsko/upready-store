import type { ComponentType } from "react"

import type { FooterKey } from "@lib/theme/composition"

import FooterF1 from "./f1"
import FooterF2 from "./f2"
import FooterF3 from "./f3"
import FooterF5 from "./f5"
import FooterF6 from "./f6"
import FooterF7 from "./f7"

/**
 * Footer composition registry: every non-"none" `footer` key (F1-F6,
 * `lib/theme/composition.ts` `FooterKey`) maps to the zero-prop server component
 * `footer/index.tsx`'s switch renders for it. `"none"` is not a member of this record —
 * `footer/index.tsx` guards it before ever consulting the registry, the same way
 * `ProfileHero`/`CategoryTiles` already self-suppress rather than being gated from
 * outside (block-port-map.md §4/§5), so this footer keeps that same idiom instead of the
 * map's own literal "gate `<Footer/>` in `(main)/layout.tsx`" suggestion — see this
 * package's report.
 *
 * W13 (footer F2/F3/F5/F6) ships F2, F3, F5 and F6 (giant-wordmark auto-shrink via CSS
 * `clamp()`, F6 additionally on the fixed-dark contrast surface). F4 stays mapped to
 * `FooterF1` as a placeholder — it needs a newsletter subscribe endpoint that does not
 * exist in this storefront (`block-port-map.md` §7 f4 row), out of this package's scope.
 * A future F4 package replaces exactly that one entry.
 *
 * F7 (t-2026-09-22-01 unit C) is Ivan's Figma footer: three columns inside one bordered
 * panel, a row of delivery and payment pills, then the copyright and the seller's
 * requisites. It is a NEW key rather than a rewrite of F4, so every tenant that saved F4
 * keeps the F1 markup it renders today.
 */
export const FOOTER_VARIANTS: Record<
  Exclude<FooterKey, "none">,
  ComponentType
> = {
  f1: FooterF1,
  f2: FooterF2,
  f3: FooterF3,
  f4: FooterF1,
  f5: FooterF5,
  f6: FooterF6,
  f7: FooterF7,
}

/**
 * `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline.
 * Typed as the registry's own key type (not the full `FooterKey`, which still carries
 * `"none"`) so `FOOTER_VARIANTS[DEFAULT_FOOTER]` indexes without a cast.
 */
export const DEFAULT_FOOTER: Exclude<FooterKey, "none"> = "f1"
