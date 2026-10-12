import type { BlockEntry } from "../../types"

import HeroType from "."
import { PRIMARY_LABEL, parseHeroTypeProps, type HeroTypeProps } from "./props"

/** The registry entry of `hero/type`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const heroType: BlockEntry<HeroTypeProps> = {
  id: "hero/type",
  category: "hero",
  variant: "type",
  title: "Type: a display headline as the first screen",
  roles: ["label", "headline", "description", "cta-primary", "media"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: HeroType,
  parseProps: parseHeroTypeProps,
  fixtures: {
    // What a shop without the template's pictures shows: the headline alone, centred.
    empty: {
      eyebrow: {},
      title: { ru: "Коллекция осень-зима", en: "The autumn-winter collection" },
      lead: {},
      primary: null,
      images: [],
      align: "center",
      scale: "large",
      rule: false,
    },
    // `braiser`, `mug` and `candle-holder` are products of the home-goods profile, the default build's catalogue.
    sample: {
      eyebrow: { ru: "Осень — зима 2026", en: "Autumn — winter 2026" },
      title: { ru: "Коллекция осень-зима", en: "The autumn-winter collection" },
      lead: {
        ru: "Чугун, глина и дерево для долгих вечеров: вещи, которые сочетаются друг с другом.",
        en: "Cast iron, clay and wood for long evenings: pieces that go with one another.",
      },
      primary: { href: "/store", label: PRIMARY_LABEL },
      images: [
        { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "Enamelled cast-iron braiser" } },
        { product: "mug", index: 0, alt: { ru: "Кружка с упором для большого пальца", en: "Mug with a thumb-notch handle" } },
        { product: "candle-holder", index: 0, alt: { ru: "Подсвечник из точёного дуба", en: "Turned oak candle holder" } },
      ],
      align: "left",
      scale: "huge",
      rule: true,
    },
  },
}
