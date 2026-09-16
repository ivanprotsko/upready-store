import { esc, money, initial, map } from "../../lib/html.mjs"
import { icons, stars } from "../../lib/icons.mjs"
export const meta = { id: "quick-view" }

/* Быстрый просмотр из выкладки — статическое состояние: открывается кнопкой
   «Быстрый просмотр» на карточке большого каталога. */
export function render(b, ctx) {
  const p = ctx.pick(b.source, 1)[0]
  return `<div class="qv" data-component="quick-view" data-qv hidden>
    <div class="qv-veil" data-qv-close></div>
    <div class="qv-panel surface" role="dialog" aria-label="Быстрый просмотр" aria-modal="true">
      <button class="icon-btn qv-close" type="button" data-qv-close aria-label="Закрыть">${icons.close}</button>
      <div class="media qv-media" data-img-role="gallery"${p.image === null ? " data-empty" : ""}${ctx.tpl.media.pad ? " data-media-pad" : ""}>
        ${p.image === null
          ? `<span class="empty-initial" aria-hidden="true">${esc(initial(p.name))}</span>`
          : `<img src="${esc(ctx.img(p))}" alt="${esc(p.alt || p.name)}" width="400" height="500">`}
      </div>
      <div class="qv-body stack-tight">
        <h2 data-role="subsection-title">${esc(p.name)}</h2>
        <span class="rating">${stars(4)}<span class="value">4,0</span></span>
        <span data-role="price">${money(p.price)}</span>
        <p data-role="body">${esc(p.short || p.category)}</p>
        <ul class="qv-facts">${map(b.facts || [], (f) => `<li data-role="meta">${esc(f)}</li>`)}</ul>
        <button class="btn" data-variant="primary" data-full type="button" data-cart-open>В корзину</button>
        <a class="link" data-role="meta" href="${esc(ctx.url("product"))}">Все характеристики и отзывы</a>
      </div>
    </div>
  </div>`
}
