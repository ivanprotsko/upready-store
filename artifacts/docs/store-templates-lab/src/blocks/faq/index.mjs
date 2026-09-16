import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "faq" }

export function render(b, ctx) {
  return `<section class="band" data-block="faq">
    <div class="container"><div class="faq-in">
      <div class="band-head"><h2 data-role="section-title">${esc(b.title)}</h2></div>
      <div class="faq-list">${map(b.items, (it, i) => `<details class="faq-item"${i === 0 ? " open" : ""}>
        <summary class="faq-q"><span data-role="subsection-title">${esc(it.q)}</span>${icons.chevronDown}</summary>
        <div class="faq-a" data-role="prose">${map(it.a, (p) => `<p data-role="body">${esc(p)}</p>`)}</div>
      </details>`)}</div>
    </div></div>
  </section>`
}
