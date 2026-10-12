import type { BlockEntry } from "../../types"

import NewsletterSignup from "."
import { HEADING, TEXT, parseNewsletterSignupProps, type NewsletterSignupProps } from "./props"

/** The registry entry of `newsletter/signup`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const newsletterSignup: BlockEntry<NewsletterSignupProps> = {
  id: "newsletter/signup",
  category: "newsletter",
  variant: "signup",
  title: "Newsletter signup",
  roles: ["section-header", "heading", "description", "cta-primary", "cta-secondary", "icon"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: NewsletterSignup,
  parseProps: parseNewsletterSignupProps,
  fixtures: {
    empty: {
      heading: HEADING,
      text: TEXT,
      mode: "channels",
      channels: [
        { network: "telegram", href: null, label: { ru: "Telegram", en: "Telegram" } },
        { network: "vk", href: null, label: { ru: "ВКонтакте", en: "VK" } },
      ],
      align: "center",
      tone: "muted",
    },
    sample: {
      heading: { ru: "Узнавайте о поступлениях первыми", en: "Hear of new arrivals first" },
      text: {
        ru: "Раз в неделю рассказываем в канале о новинках, скидках для подписчиков и закрытых распродажах.",
        en: "Once a week our channel brings new arrivals, subscriber discounts and private sales.",
      },
      mode: "channels",
      channels: [
        { network: "telegram", href: "https://t.me/example_shop", label: { ru: "Telegram", en: "Telegram" } },
        { network: "vk", href: "https://vk.com/example_shop", label: { ru: "ВКонтакте", en: "VK" } },
        { network: "max", href: "https://max.ru/example_shop", label: { ru: "MAX", en: "MAX" } },
      ],
      align: "center",
      tone: "muted",
    },
  },
}
