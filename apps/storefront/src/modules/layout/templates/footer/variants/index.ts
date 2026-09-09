import type { ComponentType } from "react"

import type { FooterKey } from "@lib/theme/composition"

import FooterF1 from "./f1"

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
 * Only F1 is built (`block-port-map.md` §7: F2-F6 are net-new, ~60-100 lines each,
 * priced but not built). Every other key maps to `FooterF1` as a placeholder — W13
 * (footer F2/F3/F5/F6) replaces exactly the entries it ships, leaving this shape and
 * every still-placeholder key untouched. F4 additionally needs a newsletter endpoint
 * that does not exist yet (block-port-map.md §7 f4 row) — out of scope here either way.
 */
export const FOOTER_VARIANTS: Record<Exclude<FooterKey, "none">, ComponentType> = {
  f1: FooterF1,
  f2: FooterF1,
  f3: FooterF1,
  f4: FooterF1,
  f5: FooterF1,
  f6: FooterF1,
}

/**
 * `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline.
 * Typed as the registry's own key type (not the full `FooterKey`, which still carries
 * `"none"`) so `FOOTER_VARIANTS[DEFAULT_FOOTER]` indexes without a cast.
 */
export const DEFAULT_FOOTER: Exclude<FooterKey, "none"> = "f1"
