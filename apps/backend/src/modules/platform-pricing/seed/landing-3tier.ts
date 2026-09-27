import type { PricingCellValue, PricingDocument, PricingSection, PricingTier } from "../schema";
import { OKSANA_3TIER_PRICING } from "./oksana-3tier";

/**
 * The platform's three tariffs (t-2026-09-27-05, order o-20260921-01 answer
 * 7a: «тарифы лендинга становятся тарифами платформы... в магазине сохраняется
 * один из них. Один список тарифов везде»). Names, prices (monthly and
 * yearly), features, hints and trial lengths are the landing's own —
 * `apps/homepage/port/src/sections/tariffs/data.ts` `PLANS`, read from
 * `origin/dev` on 2026-09-27 — transcribed field for field into this schema's
 * shape; `__tests__/seed-is-landing-tariffs.unit.spec.ts` checks the two never
 * drift.
 *
 * The rest of the page (hero, highlights, the comparison table's rows and
 * texts, the drawer, the explainers) is the Oksana template UNCHANGED (Ivan:
 * it is only a structural template and will be rewritten later). Only the
 * comparison table's per-tier VALUES are remapped, by order: Старт → Новичок,
 * Рост → Профи, Масштаб → Мастер; the «Глобализация» column is dropped.
 */

const TELEGRAM_HINT =
  "Витрина открывается прямо в Telegram: каталог, корзина и оплата внутри мессенджера — покупателю не нужно ставить отдельное приложение.";
const CATALOG_HINT = "Столько карточек товара можно держать в каталоге витрины одновременно.";

const TIERS: PricingTier[] = [
  {
    id: "novice",
    name: "Новичок",
    short_name: "",
    price: "Бесплатно",
    price_note: "навсегда",
    price_annual: null,
    recommended: false,
    description: "",
    plus: "",
    features: [
      { text: "15 товаров", tip: CATALOG_HINT, note: "" },
      {
        text: "выбор из шаблонов",
        tip: "Оформление витрины выбирается из готовых тем: своя вёрстка и редактор блоков в этом тарифе недоступны.",
        note: "",
      },
      {
        text: "стандартная поддержка",
        tip: "Обращения обрабатываются в общей очереди поддержки, без приоритета.",
        note: "",
      },
      {
        text: "один язык витрины",
        tip: "Каталог и страницы витрины ведутся на одном языке — второй языковой версии нет.",
        note: "",
      },
      { text: "Telegram Mini App", tip: TELEGRAM_HINT, note: "1" },
    ],
    button: { label: "Создать магазин", style: "solid", action: { type: "onboarding_free" } },
    trial_days: null,
  },
  {
    id: "pro",
    name: "Профи",
    short_name: "",
    price: "699 ₽",
    price_note: "в месяц",
    price_annual: { amount: "458 ₽", period: "в месяц", note: "при оплате за год" },
    recommended: false,
    description: "",
    plus: "",
    features: [
      { text: "100 товаров", tip: CATALOG_HINT, note: "" },
      {
        text: "редактор дизайна",
        tip: "Кроме готовых тем доступен редактор: блоки страницы, шрифты и цвета настраиваются вручную.",
        note: "",
      },
      {
        text: "приоритетная поддержка",
        tip: "Обращения этого тарифа поднимаются в очереди поддержки выше обычных.",
        note: "",
      },
      {
        text: "две языковых версии",
        tip: "Каталог и страницы витрины можно вести на двух языках; покупатель переключает язык сам.",
        note: "",
      },
      { text: "Telegram Mini App включён", tip: TELEGRAM_HINT, note: "" },
    ],
    button: { label: "Попробовать бесплатно", style: "solid", action: { type: "onboarding_trial", trial_days: 3 } },
    trial_days: 3,
  },
  {
    id: "master",
    name: "Мастер",
    short_name: "",
    price: "4 499 ₽",
    price_note: "в месяц",
    price_annual: { amount: "4 499 ₽", period: "в месяц", note: "при оплате за год" },
    recommended: false,
    description: "",
    plus: "",
    features: [
      {
        text: "Неограниченное количество товаров",
        tip: "Ограничения по числу карточек нет. В тариф входит 500 товаров, каждый следующий оплачивается отдельно.",
        note: "4",
      },
      {
        text: "брендированный дизайн",
        tip: "Витрина собирается под ваш бренд — фирменные цвета, шрифты и логотип, а не готовая тема.",
        note: "",
      },
      {
        text: "персональный менеджер",
        tip: "За магазином закреплён сотрудник: он ведёт запуск и отвечает напрямую, без общей очереди.",
        note: "",
      },
      {
        text: "любое количество языков витрины",
        tip: "Языковых версий каталога и страниц можно завести столько, сколько нужно.",
        note: "",
      },
      { text: "Telegram Mini App включён", tip: TELEGRAM_HINT, note: "" },
    ],
    button: { label: "Попробовать бесплатно", style: "solid", action: { type: "onboarding_trial", trial_days: 7 } },
    trial_days: 7,
  },
];

/** Старт → Новичок, Рост → Профи, Масштаб → Мастер; Глобализация is dropped. */
const COLUMN_REMAP: Record<string, string | undefined> = {
  start: "novice",
  growth: "pro",
  scale: "master",
  global: undefined,
};

function remapValues(values: Record<string, PricingCellValue>): Record<string, PricingCellValue> {
  const out: Record<string, PricingCellValue> = {};
  for (const [oldId, value] of Object.entries(values)) {
    const newId = COLUMN_REMAP[oldId];
    if (newId) out[newId] = value;
  }
  return out;
}

const SECTIONS: PricingSection[] = OKSANA_3TIER_PRICING.sections.map((section) => ({
  ...section,
  rows: section.rows.map((row) => ({ ...row, values: remapValues(row.values) })),
}));

export const LANDING_3TIER_PRICING: PricingDocument = {
  ...OKSANA_3TIER_PRICING,
  tiers: TIERS,
  sections: SECTIONS,
  final: { ...OKSANA_3TIER_PRICING.final, tier_id: "novice" },
};
