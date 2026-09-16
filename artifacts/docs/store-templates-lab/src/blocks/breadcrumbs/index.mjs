import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "breadcrumbs" }

export function render(b, ctx) {
  const items = b.items || []
  return `<nav class="crumbs" data-block="breadcrumbs" data-flush aria-label="Вы здесь">
    <div class="container crumbs-in">
      <ol class="crumbs-list">${map(items, (it, i) => `<li class="crumbs-item">
        ${i ? `<span class="crumbs-sep" aria-hidden="true">${icons.chevronRight}</span>` : ""}
        ${i === items.length - 1
          ? `<span data-role="meta" aria-current="page">${esc(it.label)}</span>`
          : `<a class="crumbs-link" data-role="meta" href="${esc(ctx.url(it.page || "index"))}">${esc(it.label)}</a>`}
      </li>`)}</ol>
    </div>
  </nav>`
}
