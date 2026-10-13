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
    // Five of the shop's own product photos, as a gallery of its social feed: no caption, no link.
    five: {
      header: {
        eyebrow: {},
        heading: { ru: "Мы в соцсетях", en: "We are on social media" },
        description: {
          ru: "Снимаем свою посуду в деле: что готовим на выходных и как она выглядит через год. Новые фото каждую неделю.",
          en: "We photograph our cookware at work: what we cook at the weekend and how it looks a year on. New photos every week.",
        },
        seeAll: null,
      },
      tiles: [
        { image: { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "Enamelled cast-iron braiser" } }, title: {}, href: null },
        { image: { product: "skillet", index: 0, alt: { ru: "Чугунная сковорода", en: "Cast-iron skillet" } }, title: {}, href: null },
        { image: { product: "mug", index: 0, alt: { ru: "Кружка с упором для большого пальца", en: "Mug with a thumb-notch handle" } }, title: {}, href: null },
        { image: { product: "serving-board", index: 0, alt: { ru: "Сервировочная доска из оливы", en: "Olive-wood serving board" } }, title: {}, href: null },
        { image: { product: "candle-holder", index: 0, alt: { ru: "Подсвечник из точёного дуба", en: "Turned oak candle holder" } }, title: {}, href: null },
      ],
      largeSide: "left",
      mobile: "stack",
    },
  },
}
