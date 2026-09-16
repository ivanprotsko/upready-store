import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "usp", variants: ["strip", "cards"] }

export function render(b, ctx) {
  const cards = b.variant === "cards"
  return `<section class="band usp-band" data-block="usp" data-tight>
    <div class="container">
      ${b.title ? `<div class="band-head"><h2 data-role="section-title">${esc(b.title)}</h2></div>` : ""}
      <ul class="usp${cards ? " usp-cards" : ""}">${map(b.items, (it) => `<li class="usp-item">
        <span class="usp-icon" aria-hidden="true">${icons[it.icon] || icons.check}</span>
        <span class="usp-text">
          <span data-role="body" class="usp-label">${esc(it.label)}</span>
          <span data-role="meta">${esc(it.note)}</span>
        </span>
      </li>`)}</ul>
    </div>
  </section>`
}
