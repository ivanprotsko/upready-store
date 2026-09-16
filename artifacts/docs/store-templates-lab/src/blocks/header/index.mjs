import { esc, map, attrs } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "header", variants: ["inline", "centered", "utility"] }

/* Иконок без подписи подряд — не больше четырёх (QR-CONTROL-DENSITY):
   язык, валюта и тема живут в одном меню «Ещё», а не семью кнопками в ряд. */
function utilities(ctx, { search = true } = {}) {
  return `<div class="hdr-tools">
    ${search ? `<button class="icon-btn" type="button" aria-label="Поиск">${icons.search}</button>` : ""}
    <a class="icon-btn" href="${esc(ctx.url("index"))}" aria-label="Личный кабинет">${icons.user}</a>
    <button class="icon-btn" type="button" aria-label="Корзина, 2 товара" data-cart-open>${icons.cart}<span class="cart-count" data-role="meta">2</span></button>
    <details class="hdr-more"><summary class="icon-btn" aria-label="Ещё: язык, валюта, тема">${icons.menu}</summary>
      <div class="hdr-more-panel surface">
        <a data-role="meta" href="${esc(ctx.url("index"))}">Русский · ₽</a>
        <a data-role="meta" href="${esc(ctx.url("index"))}">Светлая тема</a>
        <a data-role="meta" href="${esc(ctx.url("index"))}">Помощь</a>
      </div>
    </details>
  </div>`
}

/* Маршрутизация происходит ОДИН раз (правило композиции 8): либо шапка ведёт по
   категориям, либо это делают плитки. Поэтому шапка умеет и то и другое: b.links
   задаёт разделы сайта, иначе в строку встают категории каталога. */
const navLinks = (ctx, b, cats) =>
  b.links
    ? map(b.links, (l) => `<a class="hdr-link" href="${esc(ctx.url(l.page || "catalog"))}">${esc(l.label)}</a>`)
    : map(cats, (c) => `<a class="hdr-link" href="${esc(ctx.url("catalog"))}">${esc(c.name)}</a>`)

export function render(b, ctx) {
  const v = b.variant || "inline"
  const cats = (ctx.data.categories || []).slice(0, b.navCount || 5)
  const brand = ctx.tpl.brand
  const mark = `<a class="wordmark" href="${esc(ctx.url("index"))}"${attrs({ "data-mark": v })}>${esc(brand.name)}</a>`

  if (v === "centered") {
    return `<header class="hdr" data-block="header" data-flush data-variant="centered">
      <div class="container hdr-row hdr-row-centered">
        <div class="hdr-side hdr-side-start"><button class="icon-btn hdr-burger" type="button" aria-label="Меню">${icons.menu}</button></div>
        ${mark}
        <div class="hdr-side hdr-side-end">${utilities(ctx)}</div>
      </div>
      <nav class="hdr-nav-bar" aria-label="Каталог"><div class="container hdr-nav hdr-nav-center">${navLinks(ctx, b, cats)}</div></nav>
    </header>`
  }

  if (v === "utility") {
    return `<header class="hdr" data-block="header" data-flush data-variant="utility">
      <div class="hdr-strip"><div class="container hdr-strip-in">
        <span data-role="meta">${esc(brand.phone)}</span>
        <span data-role="meta">${esc(brand.shipping)}</span>
        <a data-role="meta" class="link" href="${esc(ctx.url("index"))}">Пункты выдачи</a>
      </div></div>
      <div class="container hdr-row">
        ${mark}
        <form class="hdr-search" role="search" onsubmit="return false">
          <input class="input" type="search" placeholder="Поиск по каталогу" aria-label="Поиск по каталогу">
          <button class="btn" data-variant="primary" type="submit">Найти</button>
        </form>
        ${utilities(ctx, { search: false })}
      </div>
      <nav class="hdr-nav-bar" aria-label="Каталог"><div class="container hdr-nav">${navLinks(ctx, b, cats)}</div></nav>
    </header>`
  }

  return `<header class="hdr" data-block="header" data-flush data-variant="inline">
    <div class="container hdr-row">
      ${mark}
      <nav class="hdr-nav hdr-nav-inline" aria-label="Каталог">${navLinks(ctx, b, cats)}</nav>
      ${utilities(ctx)}
    </div>
  </header>`
}
