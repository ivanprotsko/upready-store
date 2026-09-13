// Текст шапки и подвала. Источник — прототип
// `artifacts/docs/2026-09-13-homepage-prototype.html` (строки 219-225, 396) и
// концепция §3 «Шапка» / «Подвал».
//
// Оферта, политика и реквизиты в подвал не идут: текстов нет, а `todo:`-бейджи
// прежней страницы сняты решением концепции §3.

export interface NavLink {
  label: string;
  href: string;
}

/** Якоря на секции страницы; id заданы в реестре `src/sections/index.ts`. */
export const NAV_LINKS: NavLink[] = [
  { label: "Тарифы", href: "#sec-tariffs" },
  { label: "Примеры", href: "#sec-showcase" },
  { label: "Вопросы", href: "#sec-faq" },
];

export const NAV_CTA_LABEL = "Создать магазин";

export const FOOTER_BRAND = "Upready · © 2026";

export const CONTACT_LINK = {
  label: "Связаться",
  href: "https://t.me/vladupready",
};
