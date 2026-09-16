import { esc, map, money, plural } from "../../lib/html.mjs"
import { icons, stars } from "../../lib/icons.mjs"
export const meta = { id: "summary" }

/* Правая колонка товара. Одно главное действие на экран (канон Geist);
   «купить в один клик» — вторичная кнопка, а не второй акцент. */
const variantGroup = (g) => {
  if (g.type === "swatch") {
    return `<fieldset class="var-group"><legend data-role="meta">${esc(g.label)}</legend>
      <div class="var-row">${map(g.options, (o, i) => `<label class="swatch" title="${esc(o.label)}">
        <input type="radio" name="${esc(g.label)}"${i === 0 ? " checked" : ""}>
        <span class="swatch-dot" data-swatch="${esc(o.key)}"${o.color ? ` style="--swatch: ${esc(o.color)}"` : ""} aria-hidden="true"></span>
        <span class="swatch-name" data-role="meta">${esc(o.label)}</span>
      </label>`)}</div></fieldset>`
  }
  return `<fieldset class="var-group"><legend data-role="meta">${esc(g.label)}</legend>
    <div class="var-row">${map(g.options, (o, i) => `<label class="var-chip${o.out ? " is-out" : ""}">
      <input type="radio" name="${esc(g.label)}"${i === 0 ? " checked" : ""}${o.out ? " disabled" : ""}>
      <span>${esc(o.label)}</span>
    </label>`)}</div>
    ${g.guide ? `<a class="link" data-role="meta" href="#guide">${esc(g.guide)}</a>` : ""}</fieldset>`
}

export function render(b, ctx) {
  const p = b.product
  return `<div class="sum" data-component="summary">
    ${p.badge ? `<span class="badge" data-tone="${esc(p.badge.tone)}">${esc(p.badge.label)}</span>` : ""}
    <h1 data-role="page-title">${esc(p.name)}</h1>
    <div class="sum-rate">
      <span class="rating">${stars(p.rating)}<span class="value">${p.rating}</span></span>
      <a class="link" data-role="meta" href="#reviews">${p.reviews} ${plural(p.reviews, "отзыв", "отзыва", "отзывов")}</a>
      <span data-role="meta">Артикул ${esc(p.sku)}</span>
    </div>
    <p data-role="lead">${esc(p.short)}</p>
    <div class="sum-price">
      <span data-role="price">${money(p.price)}</span>
      ${p.oldPrice ? `<s data-role="price-old">${money(p.oldPrice)}</s>` : ""}
      ${p.unit ? `<span data-role="meta">за ${esc(p.unit)}</span>` : ""}
    </div>
    ${map(b.variants || [], variantGroup)}
    <span class="stock" data-state="${esc(p.stock || "in")}">${p.stock === "low" ? `Осталось ${p.left} ${plural(p.left, "штука", "штуки", "штук")}` : p.stock === "out" ? "Нет в наличии" : "В наличии, отгрузка сегодня"}</span>
    <div class="sum-actions">
      <button class="btn" data-variant="primary" data-size="lg" data-full type="button" data-cart-open>${icons.cart}В корзину</button>
      <button class="btn" data-variant="secondary" data-size="lg" data-full type="button">Купить в один клик</button>
    </div>
    <ul class="sum-facts">${map(b.facts, (f) => `<li class="sum-fact">
      <span class="sum-fact-icon" aria-hidden="true">${icons[f.icon] || icons.check}</span>
      <span><span data-role="body">${esc(f.label)}</span> <span data-role="meta">${esc(f.note)}</span></span>
    </li>`)}</ul>
  </div>`
}
