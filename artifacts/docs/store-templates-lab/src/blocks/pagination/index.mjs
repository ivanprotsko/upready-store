import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "pagination" }

export function render(b, ctx) {
  const pages = Array.from({ length: b.pages }, (_, i) => i + 1)
  return `<nav class="band pager" data-block="pagination" data-tight aria-label="Страницы каталога">
    <div class="container pager-in">
      <a class="icon-btn" href="${esc(ctx.url("catalog"))}" aria-label="Предыдущая страница">${icons.chevronLeft}</a>
      ${map(pages, (p) => p === b.current
        ? `<span class="pager-page" aria-current="page">${p}</span>`
        : `<a class="pager-page" href="${esc(ctx.url("catalog"))}">${p}</a>`)}
      <a class="icon-btn" href="${esc(ctx.url("catalog"))}" aria-label="Следующая страница">${icons.chevronRight}</a>
      <span class="pager-note" data-role="meta">Показано ${b.shown} из ${b.total}</span>
    </div>
  </nav>`
}
