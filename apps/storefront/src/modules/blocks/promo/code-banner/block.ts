import type { BlockEntry } from "../../types"

import PromoCodeBanner from "."
import {
  BUTTON_LABEL,
  CODE_LABEL,
  COPIED_LABEL,
  COPY_LABEL,
  EXPIRES_LABEL,
  HEADLINE,
  SELECTED_LABEL,
  parsePromoCodeBannerProps,
  type PromoCodeBannerProps,
} from "./props"

const CHROME = {
  copyLabel: COPY_LABEL,
  copiedLabel: COPIED_LABEL,
  selectedLabel: SELECTED_LABEL,
  codeLabel: CODE_LABEL,
  expiresLabel: EXPIRES_LABEL,
}

/**
 * The registry entry of `promo/code-banner`: `docs/templates/BLOCK-CONTRACT.md` §1. The title carries the
 * note the playground prints in its caption: the block shows a code, and the shop's promotion with that code
 * is the owner's to create in the panel.
 */
export const codeBanner: BlockEntry<PromoCodeBannerProps> = {
  id: "promo/code-banner",
  category: "promo",
  variant: "code-banner",
  title: "Promo code banner (the code must exist among the promotions in the panel)",
  roles: ["badge", "headline", "description", "promo-text", "cta-primary", "cta-secondary", "legal", "media"],
  data: ["static"],
  status: "lab",
  placement: "home",
  component: PromoCodeBanner,
  parseProps: parsePromoCodeBannerProps,
  fixtures: {
    empty: {
      code: null,
      headline: HEADLINE,
      text: {},
      badge: {},
      terms: {},
      expires: null,
      button: null,
      image: null,
      tone: "plain",
      layout: "card",
      ...CHROME,
    },
    // No expiry, so the playground's sample never runs out; `tableware` is a category of the home-goods
    // profile, the default build's catalogue.
    sample: {
      code: "MORNING10",
      headline: { ru: "−10 % на первый заказ", en: "10% off your first order" },
      text: {
        ru: "Введите промокод при оформлении, и скидка ляжет на всю корзину.",
        en: "Enter the code at checkout and the discount covers the whole cart.",
      },
      badge: { ru: "Новым покупателям", en: "New customers" },
      terms: {
        ru: "Один раз на покупателя, от 3 000 ₽. Не суммируется с другими акциями.",
        en: "Once per customer, on orders from 3,000 ₽. Not combined with other offers.",
      },
      expires: null,
      button: { label: BUTTON_LABEL, href: "/store" },
      image: { category: "tableware", alt: { ru: "Стопка керамических тарелок", en: "A stack of ceramic plates" } },
      tone: "accent",
      layout: "card",
      ...CHROME,
    },
  },
}
