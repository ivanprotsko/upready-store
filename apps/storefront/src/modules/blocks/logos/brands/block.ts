import type { BlockEntry } from "../../types"

import LogosBrands from "."
import { parseLogosBrandsProps, type BrandLogo, type LogosBrandsProps } from "./props"

/**
 * A made-up brand of the sample: its logo, drawn for us as `public/templates/sample-brands/<file>.svg` and
 * rendered beside it as a PNG (`ImageRef` takes raster files only). No real brand's logo is ever committed.
 */
const sampleBrand = (file: string, name: BrandLogo["name"], href: string | null): BrandLogo => ({
  image: { src: `/templates/sample-brands/${file}.png`, alt: {} },
  name,
  href,
})

/** The registry entry of `logos/brands`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const brands: BlockEntry<LogosBrandsProps> = {
  id: "logos/brands",
  category: "logos",
  variant: "brands",
  title: "Brand logos",
  roles: ["section-header", "logo", "media"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: LogosBrands,
  parseProps: parseLogosBrandsProps,
  fixtures: {
    // Two brands whose pictures the shop does not have: fewer than two logos are left, and the block draws nothing.
    empty: {
      header: null,
      logos: [
        { image: { product: "no-such-brand-a", index: 0, alt: {} }, name: { ru: "Нет такого бренда", en: "No such brand" }, href: null },
        { image: { product: "no-such-brand-b", index: 0, alt: {} }, name: { ru: "И такого нет", en: "Nor this one" }, href: null },
      ],
      style: "cards",
      columns: 6,
      monochrome: false,
    },
    // Six brands of a kitchen shop, of every proportion a logo comes in: 4 : 1, 5 : 1, 3 : 1, 1 : 1 and 5 : 6.
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Бренды в нашем магазине", en: "Brands we carry" },
        description: {},
        seeAll: null,
      },
      logos: [
        sampleBrand("kilnhouse", { ru: "Kilnhouse", en: "Kilnhouse" }, "/store"),
        sampleBrand("olkha", { ru: "Ольха", en: "Olkha" }, "/store"),
        sampleBrand("brightpan", { ru: "Brightpan", en: "Brightpan" }, "/store"),
        sampleBrand("medny-kovsh", { ru: "Медный ковш", en: "Medny Kovsh" }, null),
        sampleBrand("vettla", { ru: "Vettla", en: "Vettla" }, "/store"),
        sampleBrand("brumlo", { ru: "Brumlo", en: "Brumlo" }, null),
      ],
      style: "cards",
      columns: 6,
      monochrome: false,
    },
  },
}
