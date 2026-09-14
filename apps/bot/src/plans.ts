/**
 * plans.ts — ЕДИНСТВЕННОЕ место, где бот знает содержание тарифов.
 *
 * Источник — не голова, а страница (правило 17a): всё ниже списано с
 * `apps/homepage/port/src/sections/tariffs/data.ts` ветки `feature/pricing-copy`
 * (PR #6), прочитанной 2026-09-14 через
 * `git show origin/feature/pricing-copy:apps/homepage/port/src/sections/tariffs/data.ts`.
 * Переименование тарифа на странице = одна правка здесь.
 *
 * Payload диплинка — `plan_1|plan_2|plan_3` — это ПОРЯДОК КАРТОЧКИ на
 * странице, а не ключ плана: так решено в `src/lib/funnel.ts` страницы, потому
 * что имена планов за сутки менялись дважды, а порядок «от дешёвого к
 * дорогому» — ни разу. Ключи (`free|pro|ultra`) держим рядом: по ним
 * страница ведёт свою воронку, и они же читаются в логе оператора.
 */

/** Ключ плана — он же ключ сценария воронки страницы. */
export type PlanKey = "free" | "pro" | "ultra";

/** Payload команды `/start`, он же `callback_data` кнопки выбора тарифа. */
export type PlanPayload = "plan_1" | "plan_2" | "plan_3";

/** Способ оплаты. Оба ведут в Tribute, различаются картой плательщика. */
export type PaymentMethod = "ru_mir" | "visa_mc";

/** Подписи кнопок заданы Иваном дословно — менять нельзя. */
export const METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  ru_mir: "Оплатить картой РФ или МИР",
  visa_mc: "Оплатить картой Visa/MasterCard",
};

/** Порядок кнопок в сообщении. */
export const METHOD_ORDER: readonly PaymentMethod[] = ["ru_mir", "visa_mc"];

export interface Plan {
  /** Номер карточки на странице, он же цифра в payload. */
  readonly number: 1 | 2 | 3;
  readonly payload: PlanPayload;
  readonly key: PlanKey;
  readonly name: string;
  /**
   * Цена одной строкой, как её произносит страница.
   * `annual` — крупная цифра страницы (период по умолчанию — годовой),
   * `monthly` — цена при помесячной оплате. Совпадают — в сообщении
   * останется одна строка.
   */
  readonly priceAnnual: string;
  readonly priceMonthly: string;
  /**
   * `true` только у тарифа, чья цена на странице — «Бесплатно».
   * Не догадка: у такого тарифа платить нечего, и отсутствие платёжной
   * ссылки у него — норма, а не дырка в конфиге (правило 20a).
   */
  readonly free: boolean;
  /** Что входит — пять значений карточки в том же порядке. */
  readonly includes: readonly string[];
  /** Пробный период; `null` — его у тарифа нет. */
  readonly trial: { readonly lead: string; readonly terms: string } | null;
}

export const PLANS: readonly Plan[] = [
  {
    number: 1,
    payload: "plan_1",
    key: "free",
    name: "Новичок",
    priceAnnual: "бесплатно навсегда",
    priceMonthly: "бесплатно навсегда",
    free: true,
    includes: [
      "15 товаров",
      "выбор из шаблонов оформления",
      "стандартная поддержка",
      "один язык витрины",
      "Telegram Mini App",
    ],
    trial: null,
  },
  {
    number: 2,
    payload: "plan_2",
    key: "pro",
    name: "Профи",
    priceAnnual: "458 ₽ в месяц при оплате за год",
    priceMonthly: "699 ₽ в месяц",
    free: false,
    includes: [
      "100 товаров",
      "редактор дизайна",
      "приоритетная поддержка",
      "две языковых версии",
      "Telegram Mini App включён",
    ],
    trial: {
      lead: "3 дня бесплатно",
      terms:
        "пробный период начинается, когда вы привяжете платёжную карту; через 3 дня оплата спишется автоматически, если до конца периода не отменить подписку",
    },
  },
  {
    number: 3,
    payload: "plan_3",
    key: "ultra",
    name: "Мастер",
    priceAnnual: "4 499 ₽ в месяц",
    priceMonthly: "4 499 ₽ в месяц",
    free: false,
    includes: [
      "неограниченное количество товаров (500 входят в тариф, каждый следующий оплачивается отдельно)",
      "брендированный дизайн",
      "персональный менеджер",
      "любое количество языков витрины",
      "Telegram Mini App включён",
    ],
    trial: {
      lead: "7 дней бесплатно",
      terms:
        "пробный период начинается, когда вы привяжете платёжную карту; через 7 дней оплата спишется автоматически, если до конца периода не отменить подписку",
    },
  },
];

/** Разбор payload'а. Неизвестное значение — это `null`, а не первый тариф. */
export function planByPayload(payload: string): Plan | null {
  return PLANS.find((plan) => plan.payload === payload) ?? null;
}
