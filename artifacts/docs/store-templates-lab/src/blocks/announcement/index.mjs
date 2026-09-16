import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "announcement", variants: ["plain", "rotating"] }

export function render(b, ctx) {
  const items = b.items || []
  const rotating = b.variant === "rotating" && items.length > 1
  return `<div class="announce" data-block="announcement" data-flush data-bleed${rotating ? ' data-rotating role="status"' : ""}>
    <div class="container announce-in">
      ${rotating
        ? map(items, (s, i) => `<span class="announce-item" data-role="meta"${i ? ' hidden' : ""}>${esc(s)}</span>`)
        : `<span class="announce-item" data-role="meta">${esc(items[0] || "")}</span>`}
      ${b.link ? `<a class="announce-link" data-role="meta" href="${esc(ctx.url(b.link.page))}">${esc(b.link.label)}</a>` : ""}
    </div>
  </div>`
}
