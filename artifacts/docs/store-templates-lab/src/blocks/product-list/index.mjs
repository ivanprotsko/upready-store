import { esc, map, money, initial, cap } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "product-list", variants: ["dense"] }

/* Плотная выкладка строкой. Роли те же, что у карточки, поэтому типографика
   и цена выглядят одинаково: меняется РАСКЛАДКА, а не грамматика. */
export function render(b, ctx) {
  const items = ctx.pick(b.source, b.limit)
  return `<section class="band" data-block="product-list" data-tight>
    <div class="container">
      ${b.title ? `<div class="band-head"><h2 data-role="section-title">${esc(b.title)}</h2></div>` : ""}
      <ul class="plist">${map(items, (p) => `<li class="plist-row" data-product="${esc(p.id)}">
        <a class="plist-media" data-role="card-media" href="${esc(ctx.url("product"))}" aria-label="${esc(p.name)}">
          ${p.image === null
            ? `<div class="media" data-img-role="card" data-empty><span class="empty-initial" aria-hidden="true">${esc(initial(p.name))}</span></div>`
            : `<div class="media" data-img-role="card"${ctx.tpl.media.pad ? " data-media-pad" : ""}><img src="${esc(ctx.img(p))}" alt="${esc(p.alt || p.name)}" loading="lazy" width="400" height="500"></div>`}
        </a>
        <div class="plist-main">
          <h3 class="card-title plist-title" data-role="card-title"><a href="${esc(ctx.url("product"))}">${esc(p.name)}</a></h3>
          <p class="plist-note" data-role="meta">${esc(p.short || p.unit || cap(p.category))}</p>
          <span class="stock" data-state="${esc(p.stock || "in")}" data-role="meta">${p.stock === "low" ? "Осталось мало" : p.stock === "out" ? "Нет в наличии" : "В наличии"}</span>
        </div>
        <div class="plist-buy">
          <div data-role="card-price">${money(p.price)}${p.oldPrice ? `<s data-role="card-price-old">${money(p.oldPrice)}</s>` : ""}</div>
          <button class="btn" data-variant="primary" data-size="sm" type="button">${icons.cart}В корзину</button>
        </div>
      </li>`)}</ul>
    </div>
  </section>`
}
