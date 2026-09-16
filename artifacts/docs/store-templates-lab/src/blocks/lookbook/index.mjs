import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "lookbook" }

/* Редакционная полоса моды: крупный кадр — аргумент (правило композиции 6).
   Соотношение берётся из --aspect-hero/--aspect-tile, не назначается вручную. */
export function render(b, ctx) {
  return `<section class="band" data-block="lookbook">
    <div class="container stack">
      <div class="band-head">
        <div class="stack-tight">
          ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
          <h2 data-role="section-title">${esc(b.title)}</h2>
        </div>
        <a class="link" data-role="body" href="${esc(ctx.url("catalog"))}">${esc(b.more)}</a>
      </div>
      <div class="lb">${map(b.looks, (l, i) => `<figure class="lb-item"${i === 0 ? ' data-wide' : ""}>
        <div class="media" data-img-role="${i === 0 ? "hero" : "tile"}"><img src="${esc(ctx.lookImg(l, i))}" alt="${esc(l.alt)}" loading="lazy" width="1600" height="900"></div>
        <figcaption class="lb-cap">
          <span data-role="subsection-title">${esc(l.title)}</span>
          <span data-role="meta">${esc(l.note)}</span>
        </figcaption>
      </figure>`)}</div>
    </div>
  </section>`
}
