/**
 * Переходы из лендинга в ДЕМО-СЦЕНАРИИ воронки.
 *
 * Воронка (`/start`) живёт не здесь: это storefront линии MT, отдельный стенд
 * и отдельный процесс. Поэтому адрес НЕ вшивается константой — тот же класс,
 * что дыра D1 в `artifacts/docs/2026-09-13-onboarding-boundary.html`, где схема
 * `https://` оказалась зашита в код и ссылка умерла на стенде без TLS.
 * База берётся из `VITE_FUNNEL_BASE_URL`; значение по умолчанию — локальный стенд.
 */
export const FUNNEL_BASE_URL: string =
  import.meta.env.VITE_FUNNEL_BASE_URL ?? "http://localhost:8041";

export function funnelUrl(path: string): string {
  return new URL(path, FUNNEL_BASE_URL).toString();
}

export interface Scenario {
  /** Номер формы воронки: 1 прямая оплата · 2 услуга→тариф · 3 только тариф · 4 только услуга. */
  funnel: 1 | 2 | 3 | 4;
  path: string;
  /** Что открывается по ссылке — этой строкой кнопка объясняет себя в title. */
  title: string;
}

/**
 * Тариф лендинга → сценарий, который продаёт РОВНО ЭТУ цену.
 *
 * Сверено по каталогу воронки (`apps/storefront/src/lib/demo/catalog.ts`,
 * worktree feat/abstract-datasets) и замерено на живом стенде 2026-09-13:
 *   /start/pay?f=1                              → «Старт», 4 900 ₽
 *   /start/pay?f=3&s=store&p=store-business      → «Бизнес», 9 900 ₽
 *
 * Совпадает ЦЕНА, а не состав: «Бизнес» в воронке — это каталог без лимита,
 * свой домен, пять языков и приём платежей, тогда как 9 900 ₽ на лендинге —
 * оформление под бренд. Пока боевая воронка не выбрана
 * (вопрос q-homepage-funnel-variant), кнопка ведёт в сценарий той же цены.
 */
export const PLAN_SCENARIOS: Record<string, Scenario> = {
  install: {
    funnel: 1,
    path: "/start/pay?f=1",
    title: "Сценарий 1 · прямая оплата: касса сразу, тариф «Старт» 4 900 ₽",
  },
  brand: {
    funnel: 3,
    path: "/start/pay?f=3&s=store&p=store-business",
    title: "Сценарий 3 · тариф «Бизнес» 9 900 ₽ выбран, дальше касса",
  },
};

/**
 * Куда ведёт главная кнопка героя. Лендинг продаёт ОДНУ услугу — готовый
 * магазин — и два её объёма, поэтому релевантен сценарий 3: услуга
 * подразумевается, посетитель выбирает только тариф.
 */
export const HERO_SCENARIO: Scenario = {
  funnel: 3,
  path: "/start/plan?f=3",
  title: "Сценарий 3 · выбор тарифа, затем касса и онбординг",
};

/** Список всех четырёх сценариев — на случай, если тариф не сопоставлен. */
export const SCENARIO_INDEX_PATH = "/start";
