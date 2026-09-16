import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "hero", variants: ["split", "cover", "type"] }

/* Одна доминанта на первом экране (правило композиции 1): либо кадр, либо
   типографика. Вариант cover кладёт текст в СПЛОШНУЮ панель, а не поверх
   изображения: так контраст AA держится при любой картинке. */
export function render(b, ctx) {
  const v = b.variant || "split"
  const body = `
    ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
    <h1 data-role="display">${esc(b.title)}</h1>
    ${b.lead ? `<p data-role="lead">${esc(b.lead)}</p>` : ""}
    <div class="hero-actions">
      <a class="btn" data-variant="primary" data-size="lg" href="${esc(ctx.url("catalog"))}">${esc(b.cta)}</a>
      ${b.cta2 ? `<a class="btn" data-variant="secondary" data-size="lg" href="${esc(ctx.url("product"))}">${esc(b.cta2)}</a>` : ""}
    </div>
    ${b.facts ? `<ul class="hero-facts">${map(b.facts, (f) => `<li data-role="meta">${esc(f)}</li>`)}</ul>` : ""}`

  if (v === "type") {
    return `<section class="band hero hero-type" data-block="hero">
      <div class="container hero-type-in stack">${body}</div>
    </section>`
  }
  if (v === "cover") {
    return `<section class="hero hero-cover" data-block="hero" data-flush data-bleed>
      <div class="media hero-media" data-img-role="hero"><img src="${esc(ctx.heroImg(b))}" alt="" data-decorative width="1600" height="900"></div>
      <div class="container hero-cover-in"><div class="hero-panel stack">${body}</div></div>
    </section>`
  }
  return `<section class="band hero hero-split" data-block="hero">
    <div class="container hero-split-in">
      <div class="hero-copy stack">${body}</div>
      <div class="media hero-media" data-img-role="hero"><img src="${esc(ctx.heroImg(b))}" alt="" data-decorative width="1600" height="900"></div>
    </div>
  </section>`
}
