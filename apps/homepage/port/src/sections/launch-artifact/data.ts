// Verbatim copy from reference/rendered/02-launch-artifact.html (source of truth per §3.3
// of the port brief). `nPlans` and `count` mirror props.json / dc-script.js (`num.plans`,
// `gridPlans: gfit(300, 2)`) but the value here is just "2" written out — there is no runtime
// state for this section, see NOTES.md.

export interface PlanFeature {
  icon: "clock" | "compass" | "card" | "receipt" | "shield" | "layers" | "palette" | "type" | "shield-off";
  text: string;
  muted?: boolean;
}

export interface Plan {
  kicker: string; // small uppercase label, e.g. "установка"
  index: string; // "01" / "02"
  title: string;
  description: string;
  price: string;
  priceUnit: string;
  features: PlanFeature[];
  cta: {
    label: string;
    href: string;
    variant: "primary" | "outline";
  };
  highlighted: boolean; // top inset box-shadow marker on the first plan
}

export const stepLabel = "01 · тарифы";

export const plans: Plan[] = [
  {
    kicker: "установка",
    index: "01",
    title: "Установим готовый магазин",
    description: "Разворачиваем выбранный пример на вашем домене.",
    price: "4 900 ₽",
    priceUnit: "разово",
    features: [
      { icon: "clock", text: "24 часа" },
      { icon: "compass", text: "Домен ваш или подберём" },
      { icon: "card", text: "Приём оплаты подключён" },
      { icon: "receipt", text: "Чеки в налоговую по 54-ФЗ" },
      { icon: "shield", text: "Возврат в течение 7 дней" },
    ],
    cta: {
      label: "Поставить магазин",
      href: "https://t.me/vladupready",
      variant: "primary",
    },
    highlighted: true,
  },
  {
    kicker: "оформление",
    index: "02",
    title: "Оформим под ваш бренд",
    description: "Всё из установки плюс фирменный вид магазина.",
    price: "9 900 ₽",
    priceUnit: "разово",
    features: [
      { icon: "clock", text: "48 часов" },
      { icon: "layers", text: "Всё, что входит в установку" },
      { icon: "palette", text: "Логотип, цвета, шрифты" },
      { icon: "type", text: "Тексты под ваш бренд" },
      { icon: "shield-off", text: "Возврату не подлежит", muted: true },
    ],
    cta: {
      label: "Оформить под бренд",
      href: "https://t.me/vladupready",
      variant: "outline",
    },
    highlighted: false,
  },
];
