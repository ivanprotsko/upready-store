import { esc, map } from "../../lib/html.mjs"
import { productCard } from "../product-card/index.mjs"
export const meta = { id: "product-grid", variants: ["plain", "framed"] }

export function render(b, ctx) {
  const items = ctx.pick(b.source, b.limit)
  return `<section class="band" data-block="product-grid"${b.tight ? " data-tight" : ""}>
    <div class="container">
      ${b.title ? `<div class="band-head">
        <div class="stack-tight">
          ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
          <h2 data-role="section-title">${esc(b.title)}</h2>
        </div>
        ${b.more ? `<a class="link" data-role="body" href="${esc(ctx.url("catalog"))}">${esc(b.more)}</a>` : ""}
      </div>` : ""}
      <div class="grid-products"${b.variant === "framed" ? " data-framed" : ""}>${map(items, (p) => productCard(p, ctx))}</div>
    </div>
  </section>`
}
