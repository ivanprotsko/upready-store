import type { BlockEntry } from "../../types"

import SlideshowBanners from "."
import {
  BUTTON_LABEL,
  NEXT_LABEL,
  PAUSE_LABEL,
  PLAY_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  SLIDE_LABEL,
  parseSlideshowBannersProps,
  type SlideshowBannersProps,
} from "./props"

const chrome = {
  label: REGION_LABEL,
  slideLabel: SLIDE_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  pauseLabel: PAUSE_LABEL,
  playLabel: PLAY_LABEL,
}

/**
 * The registry entry of `slideshow/banners`: `docs/templates/BLOCK-CONTRACT.md` §1. The sample's pictures
 * are products and a category of the home-goods profile, the default build's catalogue; the wide, low ones
 * (a braiser, a board, a skillet) keep their shape in a landscape frame.
 */
export const slideshowBanners: BlockEntry<SlideshowBannersProps> = {
  id: "slideshow/banners",
  category: "slideshow",
  variant: "banners",
  title: "Banner slideshow",
  roles: ["hero-image", "headline", "description", "cta-primary", "trigger"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: SlideshowBanners,
  parseProps: parseSlideshowBannersProps,
  fixtures: {
    // A template whose banners name pictures this shop does not have: every banner is dropped.
    empty: {
      slides: [
        { image: { product: "no-such-banner", index: 0, alt: {} }, imageMobile: null, heading: { ru: "Распродажа", en: "Sale" }, text: {}, button: null },
        { image: { category: "no-such-category", alt: {} }, imageMobile: null, heading: {}, text: {}, button: null },
      ],
      height: "medium",
      autoplay: null,
      controls: "both",
      ...chrome,
    },
    sample: {
      slides: [
        {
          image: { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "Enamelled cast-iron braiser" } },
          imageMobile: { category: "cookware", alt: { ru: "Чугунная посуда", en: "Cast-iron cookware" } },
          heading: { ru: "Чугун, который переживёт нас", en: "Cast iron that will outlive us" },
          text: {
            ru: "Жаровни и сковороды из эмалированного чугуна: греются ровно и служат десятилетиями.",
            en: "Enamelled cast-iron braisers and skillets: they heat evenly and last for decades.",
          },
          button: { href: "/categories/cookware", label: { ru: "Смотреть посуду", en: "See the cookware" } },
        },
        {
          image: { product: "serving-board", index: 0, alt: { ru: "Сервировочная доска из оливы", en: "Olive-wood serving board" } },
          imageMobile: null,
          heading: { ru: "Стол к выходным", en: "A table for the weekend" },
          text: {
            ru: "Доски из оливы, тарелки и льняные дорожки — всё, чтобы собрать гостей.",
            en: "Olive-wood boards, plates and linen runners: all you need to gather friends.",
          },
          button: { href: "/categories/tableware", label: { ru: "К сервировке", en: "Lay the table" } },
        },
        {
          image: { product: "skillet", index: 0, alt: { ru: "Чугунная сковорода", en: "Cast-iron skillet" } },
          imageMobile: null,
          heading: { ru: "Доставка за 1–3 дня", en: "Delivery in 1–3 days" },
          text: {
            ru: "Соберём заказ сегодня и привезём за три дня. Вернуть вещь можно в течение 30 дней.",
            en: "We pack your order today and deliver it within three days. Returns within 30 days.",
          },
          button: { href: "/store", label: BUTTON_LABEL },
        },
      ],
      height: "medium",
      autoplay: 6,
      controls: "both",
      ...chrome,
    },
  },
}
