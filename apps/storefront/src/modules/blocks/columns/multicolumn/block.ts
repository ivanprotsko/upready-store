import type { BlockEntry } from "../../types"

import Multicolumn from "."
import { parseMulticolumnProps, type MulticolumnProps } from "./props"

/**
 * The second sample the brief asks for, `cards` mode over the shop's own category pictures. The
 * playground draws `fixtures.sample` only, so this one is held by the block's test, and its shots are
 * taken with it set as the sample for one run (the PR says so).
 */
export const CARDS_SAMPLE: MulticolumnProps = {
  header: {
    eyebrow: {},
    heading: { ru: "С чего начать кухню", en: "Where to start a kitchen" },
    description: {},
    seeAll: null,
  },
  items: [
    {
      image: { category: "cookware", alt: { ru: "Чугунная жаровня на плите", en: "A cast-iron braiser on the stove" } },
      icon: null,
      title: { ru: "Посуда для плиты", en: "Pots and pans" },
      text: {
        ru: "Чугун и сталь, которые служат десятилетиями и не боятся духовки.",
        en: "Cast iron and steel that last for decades and go in the oven.",
      },
      link: { href: "/categories/cookware", label: { ru: "В каталог", en: "Shop the range" } },
    },
    {
      image: { category: "tableware", alt: { ru: "Стопка керамических тарелок", en: "A stack of ceramic plates" } },
      icon: null,
      title: { ru: "Сервировка", en: "Tableware" },
      text: {
        ru: "Тарелки и чашки из керамики ручной работы, их можно мыть в посудомойке.",
        en: "Handmade ceramic plates and cups that go in the dishwasher.",
      },
      link: { href: "/categories/tableware", label: { ru: "В каталог", en: "Shop the range" } },
    },
    {
      image: { category: "kitchen-textiles", alt: { ru: "Вафельные полотенца на крючке", en: "Waffle towels on a hook" } },
      icon: null,
      title: { ru: "Кухонный текстиль", en: "Kitchen textiles" },
      text: {
        ru: "Вафельные полотенца и фартуки из льна и хлопка, мягкие с первой стирки.",
        en: "Waffle towels and aprons in linen and cotton, soft from the first wash.",
      },
      link: { href: "/categories/kitchen-textiles", label: { ru: "В каталог", en: "Shop the range" } },
    },
  ],
  mode: "cards",
  columns: 3,
  mobile: "swipe",
  align: "left",
  tone: "plain",
}

/** The registry entry of `columns/multicolumn`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const multicolumn: BlockEntry<MulticolumnProps> = {
  id: "columns/multicolumn",
  category: "columns",
  variant: "multicolumn",
  title: "Multicolumn",
  roles: ["section-header", "feature-card", "card-image", "card-title", "description", "cta-secondary", "icon-wrapper", "icon"],
  // Its words are props; a picture given as `{ category }` or `{ product }` is read through `resolveImageRef`.
  data: ["static", "categories", "products"],
  status: "lab",
  placement: "home",
  component: Multicolumn,
  parseProps: parseMulticolumnProps,
  fixtures: {
    // Two items with no title in any language: both are skipped, and nothing is left to draw.
    empty: {
      header: null,
      items: [
        { image: null, icon: "truck", title: {}, text: { ru: "Привезём за 1–5 дней" }, link: null },
        { image: null, icon: "credit-card", title: {}, text: {}, link: null },
      ],
      mode: "icons",
      columns: 4,
      mobile: "two",
      align: "center",
      tone: "plain",
    },
    // The trust row of a Russian shop: delivery, payment, returns, a guarantee.
    sample: {
      header: null,
      items: [
        {
          image: null,
          icon: "truck",
          title: { ru: "Доставка СДЭК и Почтой", en: "Delivery by CDEK and post" },
          text: {
            ru: "В пункт выдачи или курьером, за 1–5 дней по всей России.",
            en: "To a pick-up point or by courier, in 1–5 days across Russia.",
          },
          link: { href: "/shipping", label: { ru: "Условия доставки", en: "Delivery terms" } },
        },
        {
          image: null,
          icon: "credit-card",
          title: { ru: "Оплата картой и СБП", en: "Pay by card or SBP" },
          text: {
            ru: "Карты Мир, Visa и Mastercard или перевод по QR-коду из банка.",
            en: "Mir, Visa and Mastercard, or a transfer by QR code from your bank.",
          },
          link: null,
        },
        {
          image: null,
          icon: "rotate-ccw",
          title: { ru: "Возврат 14 дней", en: "14-day returns" },
          text: {
            ru: "Не подошло — вернём деньги, обратную доставку оплатим сами.",
            en: "Not right? We refund you and pay for the return shipping.",
          },
          link: { href: "/returns", label: { ru: "Как вернуть", en: "How to return" } },
        },
        {
          image: null,
          icon: "shield-check",
          title: { ru: "Гарантия год", en: "One-year guarantee" },
          text: {
            ru: "На всё, что продаём. Починим или заменим без долгих споров.",
            en: "On everything we sell. We repair or replace it, no arguing.",
          },
          link: null,
        },
      ],
      mode: "icons",
      columns: 4,
      mobile: "two",
      align: "center",
      tone: "plain",
    },
  },
}
