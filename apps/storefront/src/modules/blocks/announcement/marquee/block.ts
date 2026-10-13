import type { BlockEntry } from "../../types"

import Marquee from "."
import { REGION_LABEL, parseMarqueeProps, type MarqueeProps } from "./props"

/** The registry entry of `announcement/marquee`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const marquee: BlockEntry<MarqueeProps> = {
  id: "announcement/marquee",
  category: "announcement",
  variant: "marquee",
  title: "Marquee",
  roles: ["bonus-badge", "description", "marquee", "nav-link"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: Marquee,
  parseProps: parseMarqueeProps,
  fixtures: {
    empty: {
      items: [{ text: {}, icon: null, href: null }],
      speed: "normal",
      direction: "left",
      separator: "dot",
      tone: "plain",
      label: REGION_LABEL,
    },
    sample: {
      items: [
        {
          text: {
            ru: "Дарим 500 бонусов на первую покупку",
            en: "500 bonus points on your first order",
          },
          icon: "gift",
          href: null,
        },
        {
          text: {
            ru: "Бесплатная доставка от 3000 ₽",
            en: "Free delivery on orders over 3000 ₽",
          },
          icon: "truck",
          href: "/store",
        },
        {
          text: {
            ru: "Обмен и возврат в течение 30 дней",
            en: "Exchange or return within 30 days",
          },
          icon: "rotate-ccw",
          href: null,
        },
      ],
      speed: "normal",
      direction: "left",
      separator: "dot",
      tone: "plain",
      label: REGION_LABEL,
    },
  },
}
