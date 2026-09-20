import { esc, money, initial, cap } from "../../lib/html.mjs"
export const meta = { id: "product-card", component: true }

/**
 * ЕДИНСТВЕННАЯ реализация карточки товара. Она встречается на всех трёх страницах,
 * поэтому именно она несёт узнаваемость; второй реализации не существует (QR-CARD-GRAMMAR).
 * Порядок ролей канонический и не меняется: card-media → card-body →
 * [card-badge] → card-title → card-price → [card-price-old] → card-meta.
 */
export function productCard(p, ctx) {
  const media = p.image === null
    ? `<div class="media" data-img-role="card" data-empty>
         <span class="empty-initial" aria-hidden="true">${esc(initial(p.name))}</span>
         <span class="empty-label">${esc(cap(p.category))}<br>фото готовится</span>
       </div>`
    : `<div class="media" data-img-role="card"${ctx.tpl.media.pad ? " data-media-pad" : ""}>
         <img src="${esc(ctx.img(p))}" alt="${esc(p.alt || p.name)}" loading="lazy" width="400" height="500">
       </div>`

  return `<article class="card" data-component="product-card" data-product="${esc(p.id)}">
    <div class="card-media-wrap">
      <a class="card-media-link" data-role="card-media" href="${esc(ctx.url("product"))}" aria-label="${esc(p.name)}">${media}</a>
      ${ctx.tpl.quickView ? `<button class="card-qv btn" data-variant="secondary" data-size="sm" type="button" data-qv-open>Быстрый просмотр</button>` : ""}
    </div>
    <div class="card-body" data-role="card-body">
      ${p.badge ? `<span class="badge" data-role="card-badge" data-tone="${esc(p.badge.tone)}">${esc(p.badge.label)}</span>` : ""}
      <h3 class="card-title" data-role="card-title"><a href="${esc(ctx.url("product"))}">${esc(p.name)}</a></h3>
      <div data-role="card-price">${money(p.price)}${p.oldPrice ? `<s data-role="card-price-old">${money(p.oldPrice)}</s>` : ""}</div>
      <div class="card-meta" data-role="card-meta">${esc(p.unit || cap(p.category))}</div>
    </div>
  </article>`
}
