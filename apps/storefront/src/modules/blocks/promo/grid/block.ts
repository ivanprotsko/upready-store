import type { BlockEntry } from "../../types"

import PromoGrid from "."
import { parsePromoGridProps, type PromoGridProps } from "./props"

/** The registry entry of `promo/grid`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const grid: BlockEntry<PromoGridProps> = {
  id: "promo/grid",
  category: "promo",
  variant: "grid",
  title: "Promo grid",
  roles: ["card", "card-image", "badge", "headline", "description", "cta-primary"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: PromoGrid,
  parseProps: parsePromoGridProps,
  fixtures: {
    empty: {
      tiles: [
        { image: { product: "braiser", index: 0, alt: {} }, badge: { ru: "−20\u00a0%", en: "−20%" }, heading: {}, text: {}, button: null },
        { image: { category: "tableware", alt: {} }, badge: {}, heading: {}, text: {}, button: null },
      ],
      layout: "equal",
      textPosition: "overlay",
      gap: "normal",
    },
    sample: {
      tiles: [
        {
          image: { product: "braiser", index: 0, alt: { ru: "Жаровня из эмалированного чугуна", en: "An enamelled cast-iron braiser" } },
          badge: { ru: "−20\u00a0%", en: "−20%" },
          heading: { ru: "Чугун со скидкой до воскресенья", en: "Cast iron on sale until Sunday" },
          text: {
            ru: "Жаровни, сотейники и сковороды из эмалированного и шлифованного чугуна.",
            en: "Braisers, sauté pans and skillets in enamelled and sand-polished cast iron.",
          },
          button: { label: { ru: "Смотреть посуду", en: "Shop cookware" }, href: "/categories/cookware" },
        },
        {
          image: { category: "tableware", alt: { ru: "Стопка керамических тарелок", en: "A stack of ceramic plates" } },
          badge: { ru: "2 по цене 1", en: "2 for 1" },
          heading: { ru: "Вторая тарелка в подарок", en: "The second plate is on us" },
          text: { ru: "На всю керамику ручной работы, пока она есть.", en: "On all handmade ceramics, while it lasts." },
          button: { label: { ru: "К тарелкам", en: "See the plates" }, href: "/categories/tableware" },
        },
        {
          image: { product: "mug", index: 0, alt: {} },
          badge: { ru: "Новинка", en: "New" },
          heading: { ru: "Кружки из новой партии", en: "Mugs from the new batch" },
          text: {},
          button: { label: { ru: "Смотреть", en: "Shop now" }, href: "/products/mug" },
        },
        {
          image: { category: "kitchen-textiles", alt: { ru: "Вафельные полотенца на крючке", en: "Waffle towels on a hook" } },
          badge: { ru: "−15\u00a0%", en: "−15%" },
          heading: { ru: "Лён и хлопок для кухни", en: "Linen and cotton for the kitchen" },
          text: {},
          button: { label: { ru: "Смотреть", en: "Shop now" }, href: "/categories/kitchen-textiles" },
        },
        {
          image: { product: "candle-holder", index: 0, alt: {} },
          badge: { ru: "Подарок", en: "Gift" },
          // A no-break space inside the sum and before ₽, as the shop's prices (QR-PRICE).
          heading: { ru: "Подсвечник к заказу от 5 000 ₽", en: "A candle holder with orders over 5,000 ₽" },
          text: {},
          button: { label: { ru: "Подробнее", en: "Learn more" }, href: "/products/candle-holder" },
        },
      ],
      layout: "feature",
      textPosition: "overlay",
      gap: "normal",
    },
  },
}
