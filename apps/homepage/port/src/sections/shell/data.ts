// Текст шапки и подвала. Источник — прототип
// `artifacts/docs/2026-09-13-homepage-prototype.html` (строки 219-225, 396) и
// концепция §3 «Шапка» / «Подвал».

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

/*
 * Правовые документы в подвале. Тексты лежат в `docs/legal/*.md`, страницы по
 * этим трём адресам собирает `scripts/build-legal.mjs` в тот же `dist/`.
 *
 * Список пуст, пока в `docs/legal/requisites.json` не заполнены реквизиты
 * юридического лица: решает это не комментарий и не память, а константа
 * `__LEGAL_PAGES_READY__`, которую плагин `plugins/legal-pages.ts` ставит по
 * коду возврата `build-legal.mjs --check` перед сборкой бандла. Пока полей не
 * хватает, генератор отказывается писать страницы — и ссылка на них не
 * попадает в разметку, так что вести на 404 ей неоткуда.
 *
 * Прежний комментарий на этом месте гласил, что документов в подвале нет,
 * потому что нет текстов. Тексты с тех пор написаны; не хватает только
 * реквизитов.
 */
export const LEGAL_LINKS: NavLink[] = __LEGAL_PAGES_READY__
  ? [
      { label: "Пользовательское соглашение", href: "/terms" },
      { label: "Оферта", href: "/offer" },
      { label: "Политика конфиденциальности", href: "/privacy" },
    ]
  : [];
