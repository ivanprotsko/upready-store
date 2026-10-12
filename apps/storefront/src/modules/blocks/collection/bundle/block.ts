import type { BlockEntry } from "../../types"

import Bundle from "."
import {
  BUTTON_LABEL,
  CHOOSE_HINT,
  CHOOSE_LABEL,
  OUT_OF_STOCK_LABEL,
  parseBundleProps,
  TITLE,
  TOTAL_LABEL,
  type BundleProps,
} from "./props"

const CHROME = {
  totalLabel: TOTAL_LABEL,
  buttonLabel: BUTTON_LABEL,
  chooseLabel: CHOOSE_LABEL,
  outOfStockLabel: OUT_OF_STOCK_LABEL,
  chooseHint: CHOOSE_HINT,
}

/** The registry entry of `collection/bundle`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const bundle: BlockEntry<BundleProps> = {
  id: "collection/bundle",
  category: "collection",
  variant: "bundle",
  title: "Bundle",
  roles: ["section-header", "product-card", "price", "cta-primary", "card"],
  data: ["products"],
  status: "lab",
  placement: "home",
  component: Bundle,
  parseProps: parseBundleProps,
  fixtures: {
    // Handles no shop has: nothing is found, so the block draws nothing.
    empty: {
      header: null,
      title: TITLE,
      note: {},
      products: ["no-such-product-a", "no-such-product-b"],
      ...CHROME,
    },
    // Three products of the globex shop: two with one variant, the mug with four.
    sample: {
      header: { eyebrow: {}, heading: { ru: "Купить комплектом", en: "Buy as a set" }, description: {}, seeAll: null },
      title: { ru: "Тихий вечер", en: "A quiet evening" },
      note: { ru: "Вместе удобнее", en: "Easier together" },
      products: ["candle-holder", "hook-rail", "mug"],
      ...CHROME,
    },
  },
}
