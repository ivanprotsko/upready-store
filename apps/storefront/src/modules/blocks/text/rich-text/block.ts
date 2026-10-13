import type { BlockEntry } from "../../types"

import RichText from "."
import { parseRichTextProps, type RichTextProps } from "./props"

/** The registry entry of `text/rich-text`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const richText: BlockEntry<RichTextProps> = {
  id: "text/rich-text",
  category: "text",
  variant: "rich-text",
  title: "Rich text",
  roles: ["section-header", "label", "heading", "description", "cta-primary", "cta-secondary"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: RichText,
  parseProps: parseRichTextProps,
  fixtures: {
    empty: {
      eyebrow: {},
      heading: {},
      paragraphs: [],
      primary: null,
      secondary: null,
      align: "left",
      width: "narrow",
      tone: "plain",
    },
    sample: {
      eyebrow: { ru: "О магазине", en: "About the shop" },
      heading: {
        ru: "Небольшой магазин, где каждую вещь сначала пробуем сами",
        en: "A small shop where we try every item ourselves first",
      },
      paragraphs: [
        {
          ru: "Мы начинали с одной полки в шоуруме. Сейчас в каталоге больше трёхсот товаров, но правило осталось прежним: в продажу идёт только то, чем мы сами пользовались хотя бы месяц.",
          en: "We started with one shelf in a showroom. The catalogue now holds more than three hundred items, and the rule has not changed: only what we have used ourselves for at least a month goes on sale.",
        },
        {
          ru: "Заказы до 14:00 отправляем в тот же день.\nПо Москве привезёт курьер на следующий день, по России — СДЭК или Почта России, от 2 до 7 дней.",
          en: "Orders placed before 2 pm leave the same day.\nIn Moscow a courier brings them the next day; across Russia, CDEK or Russian Post, 2 to 7 days.",
        },
      ],
      primary: { label: { ru: "Перейти в каталог", en: "Browse the catalogue" }, href: "/store" },
      secondary: { label: { ru: "Доставка и оплата", en: "Delivery and payment" }, href: "/shipping" },
      align: "center",
      width: "narrow",
      tone: "muted",
    },
  },
}
