import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "pagination" }

/** Первая, последняя и соседи текущей; остальное — многоточие. 39 кнопок в ряд
 *  занимали на мобиле пол-экрана и хоронили список товаров под собой. */
function window_(total, cur) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const near = [cur - 1, cur, cur + 1].filter((n) => n > 1 && n < total)
  const out = [1, ...near, total]
  const withGaps = []
  for (let i = 0; i < out.length; i += 1) {
    if (i && out[i] - out[i - 1] > 1) withGaps.push("…")
    withGaps.push(out[i])
  }
  return withGaps
}

export function render(b, ctx) {
  const pages = window_(b.pages, b.current)
  return `<nav class="band pager" data-block="pagination" data-tight aria-label="Страницы каталога">
    <div class="container pager-in">
      <a class="icon-btn" href="${esc(ctx.url("catalog"))}" aria-label="Предыдущая страница">${icons.chevronLeft}</a>
      ${map(pages, (p) => p === "…"
        ? `<span class="pager-gap" aria-hidden="true">…</span>`
        : p === b.current
        ? `<span class="pager-page" aria-current="page">${p}</span>`
        : `<a class="pager-page" href="${esc(ctx.url("catalog"))}">${p}</a>`)}
      <a class="icon-btn" href="${esc(ctx.url("catalog"))}" aria-label="Следующая страница">${icons.chevronRight}</a>
      <span class="pager-note" data-role="meta">Показано ${b.shown} из ${b.total}</span>
    </div>
  </nav>`
}
