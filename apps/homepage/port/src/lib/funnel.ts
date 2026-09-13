/**
 * funnel.ts — единственное место, где страница знает адреса воронки.
 *
 * Концепция (`artifacts/docs/2026-09-13-homepage-concept.md` §2): один призыв
 * «Создать магазин» ведёт в сценарий 3 воронки, а кнопки тарифов входят в тот
 * же сценарий с уже выбранным тарифом и сразу ведут в кассу.
 *
 * База адреса берётся из `VITE_FUNNEL_BASE_URL`. Переменной нет — остаётся
 * относительный путь `/start/…`: он работает и на dev-сервере, и когда воронка
 * стоит на том же домене, что страница. Пустая строка переменной — это НЕ
 * значение (правило 20a), она трактуется как «база не задана».
 */

export interface FunnelScenario {
  /** Путь с параметрами сценария, всегда начинается с `/start/`. */
  path: string;
  /** Человеческая расшифровка — уезжает в `title` ссылки. */
  title: string;
}

const rawBase: unknown = import.meta.env.VITE_FUNNEL_BASE_URL;

/** База без хвостового слэша либо пустая строка. */
export const FUNNEL_BASE: string =
  typeof rawBase === "string" && rawBase.trim() !== ""
    ? rawBase.trim().replace(/\/+$/, "")
    : "";

/** Кнопка «Создать магазин»: шапка, герой, блок «Почему сейчас», финал. */
export const HERO_SCENARIO: FunnelScenario = {
  path: "/start/plan?f=3",
  title: "Сценарий 3 · выбор тарифа, дальше касса",
};

export const PLAN_SCENARIOS: Record<"start" | "business", FunnelScenario> = {
  start: {
    path: "/start/pay?f=3&s=store&p=store-start",
    title: "Сценарий 3 · тариф «Старт» 4 900 ₽ выбран, дальше касса",
  },
  business: {
    path: "/start/pay?f=3&s=store&p=store-business",
    title: "Сценарий 3 · тариф «Бизнес» 9 900 ₽ выбран, дальше касса",
  },
};

/** Адрес для href. Каждый CTA страницы проходит через эту функцию. */
export function funnelUrl(scenario: FunnelScenario): string {
  return `${FUNNEL_BASE}${scenario.path}`;
}
