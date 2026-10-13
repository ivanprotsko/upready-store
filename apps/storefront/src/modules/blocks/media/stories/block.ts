import type { BlockEntry } from "../../types"

import MediaStories from "."
import {
  CLOSE_LABEL,
  NEXT_LABEL,
  PAUSE_LABEL,
  PLAY_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  SLIDE_LABEL,
  parseMediaStoriesProps,
  type MediaStoriesProps,
} from "./props"

const chrome = {
  label: REGION_LABEL,
  slideLabel: SLIDE_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  closeLabel: CLOSE_LABEL,
  pauseLabel: PAUSE_LABEL,
  playLabel: PLAY_LABEL,
}

/**
 * The registry entry of `media/stories`: `docs/templates/BLOCK-CONTRACT.md` §1. The sample's pictures are
 * products and categories of the home-goods profile, the default build's catalogue.
 */
export const mediaStories: BlockEntry<MediaStoriesProps> = {
  id: "media/stories",
  category: "media",
  variant: "stories",
  title: "Story circles",
  roles: ["section-header", "story-circle", "card-image", "dialog", "close-button", "trigger", "cta-primary"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: MediaStories,
  parseProps: parseMediaStoriesProps,
  fixtures: {
    // A template whose stories name pictures this shop does not have: every slide, then every story is dropped.
    empty: {
      header: null,
      stories: [
        {
          title: { ru: "Новинки", en: "New in" },
          cover: { product: "no-such-story", index: 0, alt: {} },
          slides: [{ image: { product: "no-such-story", index: 0, alt: {} }, text: {}, button: null }],
        },
        {
          title: { ru: "Скидки", en: "Sale" },
          cover: null,
          slides: [{ image: { category: "no-such-category", alt: {} }, text: { ru: "До −30 %", en: "Up to 30 % off" }, button: null }],
        },
      ],
      ...chrome,
    },
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Истории", en: "Stories" },
        description: {},
        seeAll: null,
      },
      stories: [
        {
          title: { ru: "Новинки", en: "New in" },
          cover: { product: "braiser", index: 0, alt: { ru: "Жаровня", en: "Braiser" } },
          slides: [
            {
              image: { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "Enamelled cast-iron braiser" } },
              text: { ru: "Жаровня из эмалированного чугуна: греется ровно и держит тепло.", en: "An enamelled cast-iron braiser: it heats evenly and holds the heat." },
              button: { href: "/products/braiser", label: { ru: "К жаровне", en: "See the braiser" } },
            },
            {
              image: { product: "skillet", index: 0, alt: { ru: "Чугунная сковорода", en: "Cast-iron skillet" } },
              text: { ru: "И сковорода к ней — на каждый день.", en: "And a skillet to go with it, for every day." },
              button: null,
            },
          ],
        },
        {
          title: { ru: "Посуда для готовки", en: "Cookware" },
          // The category's own picture is the braiser, the first story's cover: the skillet tells the two apart.
          cover: { product: "skillet", index: 0, alt: { ru: "Чугунная сковорода", en: "Cast-iron skillet" } },
          slides: [
            {
              image: { category: "cookware", alt: { ru: "Посуда для готовки", en: "Cookware" } },
              text: { ru: "Чугун, сталь и керамика: всё, на чём готовят каждый день.", en: "Cast iron, steel and ceramics: all you cook on every day." },
              button: { href: "/categories/cookware", label: { ru: "Смотреть посуду", en: "See the cookware" } },
            },
          ],
        },
        {
          title: { ru: "Сервировка", en: "Tableware" },
          cover: { category: "tableware", alt: { ru: "Сервировка", en: "Tableware" } },
          slides: [
            {
              image: { category: "tableware", alt: { ru: "Тарелки и приборы", en: "Plates and cutlery" } },
              text: { ru: "Стол к выходным: тарелки, доски и льняные дорожки.", en: "A table for the weekend: plates, boards and linen runners." },
              button: { href: "/categories/tableware", label: { ru: "К сервировке", en: "Lay the table" } },
            },
            {
              image: { product: "serving-board", index: 0, alt: { ru: "Сервировочная доска из оливы", en: "Olive-wood serving board" } },
              text: {},
              button: null,
            },
          ],
        },
        {
          title: { ru: "Доставка за 1–3 дня", en: "Delivery in 1–3 days" },
          cover: { product: "mug", index: 0, alt: { ru: "Кружка", en: "Mug" } },
          slides: [
            {
              image: { product: "mug", index: 0, alt: { ru: "Кружка", en: "Mug" } },
              text: {
                ru: "Соберём заказ сегодня и привезём за три дня. Вернуть вещь можно в течение 30 дней.",
                en: "We pack your order today and deliver it within three days. Returns within 30 days.",
              },
              button: { href: "/store", label: { ru: "В каталог", en: "Shop now" } },
            },
          ],
        },
        {
          title: { ru: "Текстиль", en: "Textiles" },
          cover: null,
          slides: [
            {
              image: { product: "waffle-towels", index: 0, alt: { ru: "Вафельные полотенца", en: "Waffle towels" } },
              text: { ru: "Вафельные полотенца из льна и хлопка.", en: "Waffle towels of linen and cotton." },
              button: { href: "/products/waffle-towels", label: { ru: "К полотенцам", en: "See the towels" } },
            },
          ],
        },
      ],
      ...chrome,
    },
  },
}
