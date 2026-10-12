import type { BlockEntry } from "../../types"

import ImageBanner from "."
import { parseImageBannerProps, type ImageBannerProps } from "./props"

/** The registry entry of `banner/image`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const image: BlockEntry<ImageBannerProps> = {
  id: "banner/image",
  category: "banner",
  variant: "image",
  title: "Image banner",
  roles: ["hero-image", "headline", "description", "cta-group", "cta-primary", "cta-secondary"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: ImageBanner,
  parseProps: parseImageBannerProps,
  fixtures: {
    empty: {
      image: null,
      imageMobile: null,
      heading: {},
      text: {},
      primary: null,
      secondary: null,
      height: "medium",
      overlay: 0,
      contentPosition: "center",
      textBox: true,
      stackOnMobile: true,
    },
    sample: {
      image: { category: "the-kitchen", alt: { ru: "Сотейник из эмалированного чугуна", en: "An enamelled cast-iron braiser" } },
      imageMobile: { product: "skillet", index: 0, alt: { ru: "Сковорода из шлифованного чугуна", en: "A sand-polished cast-iron skillet" } },
      heading: { ru: "Чугун, который переживёт нас", en: "Cast iron that will outlast us" },
      text: {
        ru: "Сотейники, сковороды и жаровни из эмалированного и шлифованного чугуна. По Москве привезём завтра, по России за 2–7 дней.",
        en: "Braisers, skillets and pots in enamelled and sand-polished cast iron. Tomorrow in Moscow, 2 to 7 days across Russia.",
      },
      primary: { label: { ru: "Смотреть посуду", en: "Shop cookware" }, href: "/categories/cookware" },
      secondary: { label: { ru: "Доставка и оплата", en: "Delivery and payment" }, href: "/shipping" },
      height: "medium",
      overlay: 65,
      contentPosition: "center-left",
      textBox: false,
      stackOnMobile: true,
    },
  },
}
