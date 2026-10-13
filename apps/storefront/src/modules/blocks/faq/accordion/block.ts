import type { BlockEntry } from "../../types"

import FaqAccordion from "."
import { parseFaqAccordionProps, type FaqAccordionProps } from "./props"

/**
 * The registry entry of `faq/accordion`: `docs/templates/BLOCK-CONTRACT.md` §1. The sample is a
 * Russian shop's delivery, payment and return questions; `waffle-towels` is a product of the
 * home-goods profile, the default build's catalogue.
 */
export const faqAccordion: BlockEntry<FaqAccordionProps> = {
  id: "faq/accordion",
  category: "faq",
  variant: "accordion",
  title: "FAQ accordion",
  roles: ["section-header", "heading", "trigger", "content", "media"],
  data: ["products", "categories", "static"],
  status: "lab",
  placement: "home",
  component: FaqAccordion,
  parseProps: parseFaqAccordionProps,
  fixtures: {
    empty: { header: null, items: [], image: null, layout: "single", openFirst: false },
    sample: {
      header: {
        eyebrow: { ru: "Вопросы и ответы", en: "Questions" },
        heading: { ru: "Доставка, оплата и возврат", en: "Delivery, payment and returns" },
        description: {
          ru: "Не нашли ответа — напишите в чат на сайте, отвечаем каждый день с 9 до 21 по Москве.",
          en: "Did not find the answer? Write to the chat on the site, we reply every day from 9 to 21 Moscow time.",
        },
        seeAll: null,
      },
      items: [
        {
          question: { ru: "Сколько идёт доставка?", en: "How long does delivery take?" },
          answer: {
            ru: "По Москве и Петербургу — 1–2 дня, в другие города — от 3 до 7 дней. Срок для вашего адреса видно в корзине до оплаты.\nЗаказ, оформленный до 14:00, отправляем в тот же день.",
            en: "Moscow and St Petersburg: 1–2 days; other cities: 3 to 7 days. The cart shows the time for your address before you pay.\nAn order placed before 14:00 leaves the same day.",
          },
        },
        {
          question: { ru: "Какие есть способы доставки?", en: "Which delivery options are there?" },
          answer: {
            ru: "Курьер до двери, пункты выдачи СДЭК и Boxberry, Почта России. Стоимость считается в корзине по адресу и весу заказа.",
            en: "A courier to your door, CDEK and Boxberry pick-up points, or Russian Post. The cart works out the price from your address and the parcel's weight.",
          },
        },
        {
          question: { ru: "Доставка бесплатная?", en: "Is delivery free?" },
          answer: {
            ru: "Да, при заказе от 5 000 ₽ — в пункт выдачи и курьером по Москве. В остальных случаях стоимость видна в корзине.",
            en: "Yes, for orders from 5,000 ₽: to a pick-up point, or by courier in Moscow. Otherwise the cart shows the price.",
          },
        },
        {
          question: { ru: "Как оплатить заказ?", en: "How can I pay?" },
          answer: {
            ru: "Картой «Мир», Visa или Mastercard, через СБП — или при получении, картой либо наличными.\nЧек приходит на почту сразу после оплаты.",
            en: "By Mir, Visa or Mastercard, by SBP, or on delivery, by card or in cash.\nThe receipt comes to your e-mail as soon as you pay.",
          },
        },
        {
          question: { ru: "Как вернуть товар?", en: "How do I return an item?" },
          answer: {
            ru: "В течение 14 дней после получения, если вещью не пользовались и сохранились её вид и упаковка. Напишите нам в чат — пришлём адрес пункта приёма.\nДеньги вернём на карту в течение 10 дней после того, как товар придёт к нам.",
            en: "Within 14 days of delivery, if the item is unused and keeps its look and packaging. Write to us in the chat and we will send the drop-off address.\nThe money goes back to your card within 10 days of the item reaching us.",
          },
        },
        {
          question: { ru: "Что делать, если товар пришёл повреждённым?", en: "What if the item arrives damaged?" },
          answer: {
            ru: "Сфотографируйте повреждение, не выбрасывайте упаковку и напишите нам в течение 7 дней. Заменим товар или вернём деньги, обратную доставку оплатим сами.",
            en: "Take a photo of the damage, keep the packaging and write to us within 7 days. We will replace the item or refund it, and pay for the return ourselves.",
          },
        },
      ],
      image: {
        product: "waffle-towels",
        index: 0,
        alt: { ru: "Вафельные полотенца, набор из трёх", en: "Waffle towels, a set of three" },
      },
      layout: "two-column",
      openFirst: true,
    },
  },
}
