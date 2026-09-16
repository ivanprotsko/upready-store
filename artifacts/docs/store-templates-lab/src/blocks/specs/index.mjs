import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "specs" }

export function render(b, ctx) {
  return `<div class="specs" data-component="specs">
    ${b.title ? `<h2 data-role="section-title">${esc(b.title)}</h2>` : ""}
    <dl class="specs-list">${map(b.rows, (r) => `<div class="specs-row">
      <dt data-role="meta">${esc(r.k)}</dt><dd data-role="body" class="specs-val">${esc(r.v)}</dd>
    </div>`)}</dl>
  </div>`
}
