import { esc, map, money, initial } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "bundle" }

/* «Часто покупают вместе»: набор со скидкой. Карточки внутри набора — те же
   роли, что и везде, только раскладка компактнее. */
export function render(b, ctx) {
  const items = ctx.pick(b.source, b.limit || 3)
  const sum = items.reduce((s, p) => s + p.price, 0)
  const total = Math.round(sum * (1 - (b.discount || 0.1)))
  return `<section class="band" data-block="bundle" data-tight>
    <div class="container">
      <div class="band-head"><h2 data-role="section-title">${esc(b.title)}</h2></div>
      <div class="bundle">
        <ul class="bundle-items">${map(items, (p, i) => `<li class="bundle-item">
          <span class="media bundle-thumb" data-img-role="card"${ctx.tpl.media.pad ? " data-media-pad" : ""}>
            ${p.image === null
              ? `<span class="empty-initial" aria-hidden="true">${esc(initial(p.name))}</span>`
              : `<img src="${esc(ctx.img(p))}" alt="${esc(p.alt || p.name)}" loading="lazy" width="400" height="500">`}
          </span>
          <span data-role="meta" class="bundle-name">${esc(p.name)}</span>
          <span data-role="card-price">${money(p.price)}</span>
          ${i < items.length - 1 ? `<span class="bundle-plus" aria-hidden="true">${icons.plus}</span>` : ""}
        </li>`)}</ul>
        <div class="bundle-buy surface">
          <span data-role="meta">Набор целиком</span>
          <span data-role="price">${money(total)}<s data-role="price-old">${money(sum)}</s></span>
          <span data-role="meta">Выгода ${money(sum - total)}</span>
          <button class="btn" data-variant="primary" data-full type="button" data-cart-open>Добавить набор</button>
        </div>
      </div>
    </div>
  </section>`
}
