#!/usr/bin/env node
/** Сверка библиотеки блоков с реестром must-фич r03. Пишет таблицу для README. */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const REG = "../../../research/2026-09-16-store-templates-functionality/features.json"
const features = Object.values(JSON.parse(readFileSync(new URL(REG, import.meta.url), "utf8")))
const must = features.filter((f) => f.priority === "must")

/** id фичи → чем закрыта в лаборатории. null = не закрыта, строка «~» = частично. */
const MAP = {
  "checkout-form": "блок `checkout` — контакты, доставка, оплата, промокод (lending, статическое состояние)",
  "one-click-buy": "кнопка «Купить в один клик» в блоке `summary`",
  "pickup-points": "вариант «В пункт выдачи» в блоке `checkout`",
  "payment-methods": "группа «Оплата» в блоке `checkout`: карта, СБП, счёт юрлицу",
  "cart-page": null,
  "cart-slide-panel": "блок `cart-drawer` — открывается кнопкой корзины в шапке",
  "delivery-options": "группа «Доставка» в блоке `checkout`",
  "multi-currency": null,
  "product-card-price-badges": "блок `product-card`: цена, старая цена зачёркнутой, метка SALE/NEW",
  "category-sections": "блоки `tiles` и `product-grid` с заголовком раздела",
  "stock-status": "роль `.stock` в `summary` и `product-list`: в наличии / мало / нет",
  "delivery-payment-page": "~вкладка «Доставка и оплата» на товаре и ссылки в футере; отдельной страницы в лаборатории нет",
  "blog": null,
  "about-brand-story": "блок `story` (варианты split и quote)",
  "advantages-block": "блок `usp` (варианты strip и cards)",
  "catalog-category-menu": "блок `header`, варианты `utility` и `centered` с полосой категорий",
  "specs-table": "блок `specs`",
  "variant-selector": "группы вариантов в `summary`: чипы размеров и кружки цвета",
  "product-tabs": "блок `tabs` — на мобиле превращается в аккордеон той же разметкой",
  "product-gallery-zoom": "блок `gallery`: один кадр, миниатюры, стрелки, свайп, лайтбокс",
  "attribute-filters": "блок `filters`",
  "price-range-filter": "фильтр типа `price` («от/до») в блоке `filters`",
  "live-search": "~строка поиска в шапке `utility`; выпадающих подсказок в статике нет",
  "product-reviews-rating": "блок `reviews` и рейтинг в `summary`",
  "legal-pages": "~ссылки на оферту и политику в футере; сами страницы вне лаборатории",
  "customer-account": null,
  "newsletter-signup": "блок `newsletter`",
  "promo-banner": "блок `announcement` (в том числе со сменой строк)",
  "promo-code": "поле промокода в блоке `checkout`",
  "widget-library": "сама библиотека: 28 блоков в `src/blocks/`",
  "responsive-mobile": "два вьюпорта у каждой страницы; проверки `QR-OVERFLOW` и `QR-HIT`",
  "structured-data": null,
  "web-analytics": null,
}
const WHY = {
  "cart-page": "панель корзины закрывает сценарий в лаборатории; отдельная страница — вёрстка витрины, а не вопрос стиля",
  "multi-currency": "переключение валюты — поведение витрины; на стиль шаблона не влияет",
  blog: "журнал уже сделан задачей b18-blog-full на самой витрине — дублировать его макетом незачем",
  "customer-account": "личный кабинет не входит в три страницы, которые судит Иван (главная, каталог, товар)",
  "structured-data": "микроразметка ставится при переносе на storefront: в статике ей нечего описывать",
  "web-analytics": "аналитика не имеет визуального представления",
}

const rows = must.map((f) => {
  const v = MAP[f.id]
  const state = v === null || v === undefined ? "нет" : v.startsWith("~") ? "частично" : "есть"
  return { id: f.id, name: f.name_ru, cat: f.category, state, how: v ? v.replace(/^~/, "") : WHY[f.id] || "—" }
})
const n = (s) => rows.filter((r) => r.state === s).length
console.log(`| Фича (r03) | Категория | В лаборатории | Чем |`)
console.log(`|---|---|---|---|`)
for (const r of rows.sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id))) {
  console.log(`| ${r.name} \`${r.id}\` | ${r.cat} | ${r.state} | ${r.how} |`)
}
console.error(`\nиз ${rows.length} must: есть ${n("есть")} · частично ${n("частично")} · нет ${n("нет")}`)
