import type { BlockEntry } from "../../types"

import Rotator from "."
import {
  CLOSE_LABEL,
  NEXT_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  parseRotatorProps,
  type RotatorProps,
} from "./props"

const chrome = {
  label: REGION_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  closeLabel: CLOSE_LABEL,
}

/** The registry entry of `announcement/rotator`: `docs/templates/BLOCK-CONTRACT.md` §1. */
export const rotator: BlockEntry<RotatorProps> = {
  id: "announcement/rotator",
  category: "announcement",
  variant: "rotator",
  title: "Rotating announcements",
  roles: ["close-button", "description", "nav-link", "trigger"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: Rotator,
  parseProps: parseRotatorProps,
  fixtures: {
    empty: {
      messages: [
        { text: {}, href: null },
        { text: {}, href: null },
      ],
      interval: 5,
      dismissible: false,
      ...chrome,
    },
    sample: {
      messages: [
        {
          text: {
            ru: "Доставка по городу за два часа",
            en: "Delivery across town in two hours",
          },
          href: "/store",
        },
        {
          text: {
            ru: "Самовывоз из магазина бесплатно",
            en: "Pick-up from the shop is free",
          },
          href: null,
        },
        {
          text: {
            ru: "Обмен и возврат в течение 30 дней",
            en: "Exchange or return within 30 days",
          },
          href: null,
        },
      ],
      interval: 5,
      dismissible: true,
      ...chrome,
    },
  },
}
