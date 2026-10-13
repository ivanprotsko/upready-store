import type { BlockEntry } from "../../types"

import Steps from "."
import { parseStepsProps, type StepsProps } from "./props"

/**
 * The second sample, `list` on a `muted` panel with an icon a step and no button: ordering without the cart, by a
 * call or a message. The playground draws `fixtures.sample` only, so this one is held by the block's test, and its
 * shots are taken with it set as the sample for one run (the PR says so).
 */
export const LIST_SAMPLE: StepsProps = {
  header: {
    eyebrow: { ru: "Без корзины", en: "No cart needed" },
    heading: { ru: "Закажите звонком или сообщением", en: "Order by phone or message" },
    description: {},
    seeAll: null,
  },
  steps: [
    {
      title: { ru: "Позвоните или напишите", en: "Call or write to us" },
      text: {
        ru: "По телефону с 9 до 21 или в мессенджер в любое время, назовите товар или пришлите ссылку на него.",
        en: "By phone from 9 to 21, or in a messenger at any time: name the item or send us its link.",
      },
      icon: "phone",
    },
    {
      title: { ru: "Подтвердим заказ", en: "We confirm the order" },
      text: {
        ru: "Ответим за 15 минут: проверим наличие, назовём сумму с доставкой и пришлём ссылку на оплату.",
        en: "We answer within 15 minutes: we check the stock, name the total with delivery and send a payment link.",
      },
      icon: "message-circle",
    },
    {
      title: { ru: "Привезём в удобное время", en: "We deliver when it suits you" },
      text: {
        ru: "Курьером по городу или в пункт выдачи по всей России, трек-номер придёт в том же чате.",
        en: "By courier in town or to a pick-up point anywhere in Russia; the tracking number comes in the same chat.",
      },
      icon: "truck",
    },
  ],
  button: null,
  layout: "list",
  tone: "muted",
}

/** The registry entry of `columns/steps`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const steps: BlockEntry<StepsProps> = {
  id: "columns/steps",
  category: "columns",
  variant: "steps",
  title: "Steps",
  roles: ["section-header", "step", "card-title", "description", "icon", "cta-primary"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: Steps,
  parseProps: parseStepsProps,
  fixtures: {
    // One step with a title and one without: a single step is not a sequence, so nothing is drawn.
    empty: {
      header: null,
      steps: [
        { title: { ru: "Выберите товар" }, text: {}, icon: null },
        { title: {}, text: { ru: "Укажите адрес доставки" }, icon: null },
      ],
      button: null,
      layout: "row",
      tone: "plain",
    },
    // «Как сделать заказ» of a Russian shop: choose, check out on the site or by message, confirm, receive.
    sample: {
      header: {
        eyebrow: {},
        heading: { ru: "Как сделать заказ", en: "How to order" },
        description: {
          ru: "На сайте, по телефону или в мессенджере — как вам удобнее. Остальное мы берём на себя.",
          en: "On the site, by phone or in a messenger, whichever suits you. We take care of the rest.",
        },
        seeAll: null,
      },
      steps: [
        {
          title: { ru: "Выберите товар", en: "Choose what you like" },
          text: {
            ru: "Добавьте в корзину всё, что понравилось, или просто запишите названия.",
            en: "Put everything you like in the cart, or simply note the names down.",
          },
          icon: null,
        },
        {
          title: { ru: "Оформите заказ", en: "Place the order" },
          text: {
            ru: "На сайте за пару минут, звонком или сообщением в мессенджер.",
            en: "On the site in a couple of minutes, by a call or a message in a messenger.",
          },
          icon: null,
        },
        {
          title: { ru: "Мы всё подтвердим", en: "We confirm it all" },
          text: {
            ru: "Перезвоним или напишем, уточним адрес и удобное время доставки.",
            en: "We call or write back to check the address and a delivery time that suits you.",
          },
          icon: null,
        },
        {
          title: { ru: "Получите заказ", en: "Receive your order" },
          text: {
            ru: "Курьером, в пункте выдачи или почтой; оплата картой или по СБП.",
            en: "By courier, at a pick-up point or by post; pay by card or SBP.",
          },
          icon: null,
        },
      ],
      button: { label: { ru: "Перейти в каталог", en: "Go to the catalogue" }, href: "/store" },
      layout: "row",
      tone: "plain",
    },
  },
}
