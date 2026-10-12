import type { BlockEntry } from "../../types"

import Mosaic from "."
import { parseMosaicProps, type MosaicProps } from "./props"

/** The registry entry of `collage/mosaic`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const mosaic: BlockEntry<MosaicProps> = {
  id: "collage/mosaic",
  category: "collage",
  variant: "mosaic",
  title: "Collage mosaic",
  roles: ["section-header", "card", "card-image", "product-card"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: Mosaic,
  parseProps: parseMosaicProps,
  fixtures: {
    empty: { header: null, tiles: [], largeSide: "left", mobile: "stack" },
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Для кухни, где готовят каждый день", en: "For a kitchen that cooks every day" },
        description: {},
        seeAll: null,
      },
      tiles: [
        { category: "cookware" },
        { product: "skillet" },
        { category: "tableware" },
      ],
      largeSide: "left",
      mobile: "stack",
    },
  },
}
