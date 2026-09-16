import { esc } from "../../lib/html.mjs"
export const meta = { id: "page-head" }

export function render(b, ctx) {
  return `<section class="band page-head" data-block="page-head" data-tight>
    <div class="container stack-tight page-head-in">
      ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
      <h1 data-role="page-title">${esc(b.title)}</h1>
      ${b.lead ? `<p data-role="lead">${esc(b.lead)}</p>` : ""}
    </div>
  </section>`
}
