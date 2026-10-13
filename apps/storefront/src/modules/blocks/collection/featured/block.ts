import type { BlockEntry } from "../../types"

import FeaturedCollection from "."
import { NEXT_LABEL, PREVIOUS_LABEL, parseFeaturedCollectionProps, type FeaturedCollectionProps } from "./props"

/** The registry entry of `collection/featured`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const featured: BlockEntry<FeaturedCollectionProps> = {
  id: "collection/featured",
  category: "collection",
  variant: "featured",
  title: "Featured collection",
  roles: ["section-header", "product-card", "price", "badge", "cta-secondary"],
  data: ["products", "categories"],
  status: "lab",
  placement: "home",
  component: FeaturedCollection,
  parseProps: parseFeaturedCollectionProps,
  fixtures: {
    // A category no shop has: the source holds no product, and the section is not drawn.
    empty: {
      header: null,
      source: { category: "empty-selection" },
      limit: 8,
      layout: "grid",
      columns: 4,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    },
    // The playground's shop, globex: a parent category, its products on the leaves, under its own name.
    sample: {
      header: {
        eyebrow: { ru: "Для кухни", en: "For the kitchen" },
        heading: {},
        description: {},
        seeAll: null,
      },
      source: { category: "the-kitchen" },
      limit: 8,
      layout: "carousel",
      columns: 4,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    },
  },
}
