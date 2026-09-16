import { esc, map, money } from "../../lib/html.mjs"
export const meta = { id: "price-list" }

/* Опт: прайс с порогами количества и минимальной партией. Числа моноширинные
   и выровнены по правому краю (канон Geist: tabular-nums для всех данных). */
export function render(b, ctx) {
  const items = ctx.pick(b.source, b.limit || 8)
  return `<section class="band" data-block="price-list" data-tight>
    <div class="container stack">
      <div class="band-head">
        <h2 data-role="section-title">${esc(b.title)}</h2>
        <a class="btn" data-variant="secondary" href="${esc(ctx.url("index"))}">Скачать прайс</a>
      </div>
      <div class="pl-scroll">
        <table class="pl">
          <thead><tr>
            <th scope="col" data-role="meta">Товар</th>
            <th scope="col" data-role="meta">Артикул</th>
            <th scope="col" data-role="meta" class="pl-num">Мин. партия</th>
            ${map(b.tiers, (t) => `<th scope="col" data-role="meta" class="pl-num">${esc(t)}</th>`)}
          </tr></thead>
          <tbody>${map(items, (p, i) => `<tr>
            <th scope="row" data-role="body" class="pl-name">${esc(p.name)}</th>
            <td data-role="meta" class="pl-mono">${esc(p.sku || "ART-" + (1000 + i))}</td>
            <td class="pl-num pl-mono" data-role="body">${p.moq || 10} шт</td>
            ${map(b.tiers, (t, k) => `<td class="pl-num pl-mono" data-role="body">${money(Math.round(p.price * (1 - k * 0.07)))}</td>`)}
          </tr>`)}</tbody>
        </table>
      </div>
      <p data-role="meta">${esc(b.note)}</p>
    </div>
  </section>`
}
