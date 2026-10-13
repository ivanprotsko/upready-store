import type { BlockEntry } from "../../types"

import TextBar from "."
import { parseTextBarProps, type TextBarProps } from "./props"

/** The registry entry of `announcement/text-bar`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const textBar: BlockEntry<TextBarProps> = {
  id: "announcement/text-bar",
  category: "announcement",
  variant: "text-bar",
  title: "Text bar",
  roles: ["promo-text"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: TextBar,
  parseProps: parseTextBarProps,
  fixtures: {
    empty: { text: {} },
    sample: {
      text: {
        ru: "Доставка по городу за два часа, самовывоз бесплатно",
        en: "Delivery across town in two hours, pick-up is free",
      },
      href: "/store",
    },
  },
}
