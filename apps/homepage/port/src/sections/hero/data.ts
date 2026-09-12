/**
 * Copy and props for the hero section, extracted verbatim from
 * reference/props.json + reference/dc-script.js (renderVals / resolveAudience).
 *
 * The legacy component picks one of three headline+paragraph variants by
 * "audience" (cold / warm / price), resolved from the `v` or `utm_content`
 * query param, falling back to a 30-minute sessionStorage value, falling
 * back to `defaultAudience` (props.json default: "cold").
 */

export type Audience = "cold" | "warm" | "price";

export const AUDIENCE_IDS: Audience[] = ["cold", "warm", "price"];

/** props.json `defaultAudience.default` */
export const defaultAudience: Audience = "cold";

export interface HeroVariant {
  heading: string;
  /** matches the per-variant `max-width` on the <h1> in reference/rendered/01-hero.html */
  headingMaxWidth: "15ch" | "16ch";
  paragraph: string;
}

export const heroVariants: Record<Audience, HeroVariant> = {
  cold: {
    heading:
      "Сколько вы потеряете, если ваш склад Wildberries остановится завтра?",
    headingMaxWidth: "15ch",
    paragraph:
      "С 7 июля 2026 потеря товара на складе — форс-мажор по оферте. Свой магазин — единственный канал продаж, который остаётся вашим при любом сценарии.",
  },
  warm: {
    heading: "Ваш план Б — за два дня и 4 900 ₽",
    headingMaxWidth: "16ch",
    paragraph:
      "Разворачиваем готовое решение на вашем домене и настраиваем под ваш товар — вы получаете работающий магазин, а не конструктор.",
  },
  price: {
    heading: "Готовый интернет-магазин за 4 900 ₽. Запуск за 24 часа",
    headingMaxWidth: "16ch",
    paragraph: "Выбираете пример из списка — разворачиваем его на вашем домене.",
  },
};

/** `heroNote` in renderVals(), constant across audiences */
export const heroNote =
  "Не подойдёт — вернём деньги в течение 7 дней после запуска.";

/** href is static on the raw template regardless of audience */
export const heroCtaHref = "https://t.me/vladupready";

/** `heroCta` in renderVals(): `a === 'price' ? 'Написать в телеграм' : 'Поставить магазин'` */
export function heroCtaLabel(audience: Audience): string {
  return audience === "price" ? "Написать в телеграм" : "Поставить магазин";
}

/** sessionStorage key + TTL used by resolveAudience()/persist() in dc-script.js */
export const AUDIENCE_STORAGE_KEY = "upready_v";
export const AUDIENCE_STORAGE_TTL_MS = 30 * 60 * 1000;
