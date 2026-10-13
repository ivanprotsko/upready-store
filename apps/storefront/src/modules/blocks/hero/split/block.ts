import type { BlockEntry } from "../../types"

import HeroSplit from "."
import { PRIMARY_LABEL, parseHeroSplitProps, type HeroSplitProps } from "./props"

/** The registry entry of `hero/split`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const heroSplit: BlockEntry<HeroSplitProps> = {
  id: "hero/split",
  category: "hero",
  variant: "split",
  title: "Split: text beside a picture",
  roles: ["label", "heading", "description", "cta-group", "cta-primary", "cta-secondary", "hero-image", "icon"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: HeroSplit,
  parseProps: parseHeroSplitProps,
  fixtures: {
    // What a shop without the template's picture shows: the template's words alone, full width.
    empty: {
      eyebrow: {},
      title: {
        ru: "Натуральные вещи для кухни, которыми пользуются каждый день",
        en: "Honest kitchen things, made to be used every day",
      },
      lead: {
        ru: "Чугун, глина, лён и дерево от небольших мастерских.",
        en: "Cast iron, clay, linen and wood from small workshops.",
      },
      primary: { href: "/store", label: PRIMARY_LABEL },
      secondary: null,
      facts: [],
      image: null,
      imageSide: "right",
      imageFit: "cover",
      tone: "plain",
      height: "auto",
    },
    // `braiser` is a product of the home-goods profile, the default build's catalogue.
    sample: {
      eyebrow: { ru: "Мастерская с 2014 года", en: "A workshop since 2014" },
      title: {
        ru: "Натуральные вещи для кухни, которыми пользуются каждый день",
        en: "Honest kitchen things, made to be used every day",
      },
      lead: {
        ru: "Чугун, глина, лён и дерево от небольших мастерских. Каждую вещь мы сначала пробуем на своей кухне.",
        en: "Cast iron, clay, linen and wood from small workshops. We try every piece in our own kitchen first.",
      },
      primary: { href: "/store", label: PRIMARY_LABEL },
      secondary: { href: "/journal", label: { ru: "Как мы выбираем", en: "How we choose" } },
      facts: [
        { ru: "Доставка за 1–3 дня", en: "Delivery in 1–3 days" },
        { ru: "Возврат 30 дней", en: "30-day returns" },
        { ru: "Проверено на нашей кухне", en: "Tried in our kitchen" },
      ],
      image: { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "Enamelled cast-iron braiser" } },
      imageSide: "right",
      imageFit: "cover",
      tone: "plain",
      height: "auto",
    },
  },
}
