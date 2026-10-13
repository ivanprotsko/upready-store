import type { BlockEntry } from "../../types"

import { SEE_ALL_LABEL } from "../../shared/section-header"
import { NEWEST_HEADING, NEXT_LABEL, PREVIOUS_LABEL } from "../featured/props"
import CollectionTabs from "."
import { parseCollectionTabsProps, type CollectionTabsProps } from "./props"

/** The registry entry of `collection/tabs`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const tabs: BlockEntry<CollectionTabsProps> = {
  id: "collection/tabs",
  category: "collection",
  variant: "tabs",
  title: "Collection tabs",
  roles: ["section-header", "tab-list", "tab-trigger", "tab-content", "product-card", "price", "badge", "cta-secondary"],
  data: ["products", "categories"],
  status: "lab",
  placement: "home",
  component: CollectionTabs,
  parseProps: parseCollectionTabsProps,
  fixtures: {
    // Sources no shop has: every tab is dropped, and the section is not drawn.
    empty: {
      header: null,
      tabs: [
        { label: { ru: "Хиты", en: "Bestsellers" }, source: { category: "empty-selection" }, limit: 8 },
        { label: { ru: "Скидки", en: "On sale" }, source: { collection: "empty-selection" }, limit: 8 },
      ],
      columns: 4,
      seeAllLabel: SEE_ALL_LABEL,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    },
    // The playground's shop, globex: a parent category, the newest of the catalogue and a collection.
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Популярное в магазине", en: "Popular in the shop" },
        description: {},
        seeAll: null,
      },
      tabs: [
        { label: { ru: "Для кухни", en: "For the kitchen" }, source: { category: "the-kitchen" }, limit: 8 },
        { label: NEWEST_HEADING, source: { sort: "newest" }, limit: 8 },
        { label: { ru: "Утренний стол", en: "Morning table" }, source: { collection: "the-morning-table" }, limit: 8 },
      ],
      columns: 4,
      seeAllLabel: SEE_ALL_LABEL,
      previousLabel: PREVIOUS_LABEL,
      nextLabel: NEXT_LABEL,
    },
  },
}
