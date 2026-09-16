import { esc, map, plural } from "../../lib/html.mjs"
import { icons, stars } from "../../lib/icons.mjs"
export const meta = { id: "reviews" }

export function render(b, ctx) {
  const total = (b.items || []).length
  return `<section class="band" data-block="reviews" id="reviews" data-tight>
    <div class="container specs">
      <div class="band-head">
        <h2 data-role="section-title">${esc(b.title)}</h2>
        <button class="btn" data-variant="secondary" type="button">Написать отзыв</button>
      </div>
      <div class="rev-summary">
        <span class="rating">${stars(b.rating)}<span class="value">${b.rating} из 5</span></span>
        <span data-role="meta">${total} ${plural(total, "отзыв", "отзыва", "отзывов")}</span>
      </div>
      <ul class="rev-list">${map(b.items, (r) => `<li class="rev-item">
        <div class="rev-head">
          <span data-role="body" class="rev-name">${esc(r.name)}</span>
          <span class="rating">${stars(r.rating)}</span>
          <span data-role="meta">${esc(r.date)}</span>
          ${r.verified ? `<span class="rev-ok" data-role="meta">${icons.check}Покупка подтверждена</span>` : ""}
        </div>
        <p data-role="body" class="rev-text">${esc(r.text)}</p>
      </li>`)}</ul>
    </div>
  </section>`
}
