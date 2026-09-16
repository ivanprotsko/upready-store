import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "story", variants: ["split", "quote"] }

export function render(b, ctx) {
  if (b.variant === "quote") {
    return `<section class="band story-quote" data-block="story">
      <div class="container"><div class="story-quote-in">
        ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
        <blockquote data-role="section-title" class="story-q">${esc(b.quote)}</blockquote>
        <span data-role="meta">${esc(b.author)}</span>
      </div></div>
    </section>`
  }
  return `<section class="band story" data-block="story">
    <div class="container story-in">
      <div class="media story-media" data-img-role="tile"><img src="${esc(ctx.storyImg(b))}" alt="" data-decorative loading="lazy" width="600" height="400"></div>
      <div class="stack story-copy">
        ${b.eyebrow ? `<span data-role="eyebrow">${esc(b.eyebrow)}</span>` : ""}
        <h2 data-role="section-title">${esc(b.title)}</h2>
        <div data-role="prose">${map(b.paragraphs, (p) => `<p data-role="body">${esc(p)}</p>`)}</div>
        ${b.cta ? `<a class="btn" data-variant="secondary" href="${esc(ctx.url("catalog"))}">${esc(b.cta)}</a>` : ""}
      </div>
    </div>
  </section>`
}
