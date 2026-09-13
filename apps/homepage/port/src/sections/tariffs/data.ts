// «Тарифы» — два тарифа, тексты дословно из кассы воронки
// (`apps/storefront/src/lib/demo/catalog.ts`), см. концепция §3 «Тарифы» и
// прототип строки 367-374.
//
// Период «разово» — решение концепции §7 п.1: касса периода не называет,
// прежняя страница писала «разово», формулировка сохранена.

export const EYEBROW = "Тарифы";

export const HEADING = "Два тарифа. Цена та же, что в кассе";

export interface Plan {
  /** Ключ сценария воронки в `src/lib/funnel.ts`. */
  scenario: "start" | "business";
  name: string;
  price: string;
  period: string;
  summary: string;
  cta: string;
}

export const PLANS: Plan[] = [
  {
    scenario: "start",
    name: "Старт",
    price: "4 900 ₽",
    period: "разово",
    summary: "До 50 товаров, один язык витрины, домен третьего уровня.",
    cta: "Выбрать «Старт»",
  },
  {
    scenario: "business",
    name: "Бизнес",
    price: "9 900 ₽",
    period: "разово",
    summary: "Без лимита каталога, свой домен, пять языков, приём платежей.",
    cta: "Выбрать «Бизнес»",
  },
];

export const PRO_LINE =
  "Нужны интеграции складов и выделенная поддержка — тариф «Про», 19 900 ₽, в кассе.";
