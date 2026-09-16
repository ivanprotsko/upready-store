import { esc, map } from "../../lib/html.mjs"
export const meta = { id: "tiles", variants: ["grid", "strip"] }

/* Маршрутизация происходит ОДИН раз (правило композиции 8): либо плитки,
   либо полоса категорий в шапке. Число плиток делит число колонок выкладки
   (правило 5 — оси проходят насквозь). */
export function render(b, ctx) {
  const cats = (ctx.data.categories || []).slice(0, b.limit || 4)
  const strip = b.variant === "strip"
  return `<section class="band" data-block="tiles"${b.tight ? " data-tight" : ""}>
    <div class="container">
      ${b.title ? `<div class="band-head"><h2 data-role="section-title">${esc(b.title)}</h2></div>` : ""}
      <div class="${strip ? "tiles-strip" : "tiles-grid"}">
        ${map(cats, (c) => `<a class="tile" href="${esc(ctx.url("catalog"))}">
          <div class="media" data-img-role="tile"><img src="${esc(ctx.tileImg(c))}" alt="Раздел «${esc(c.name)}»" loading="lazy" width="600" height="400"></div>
          <div class="tile-cap">
            <span class="tile-name" data-role="subsection-title">${esc(c.name)}</span>
            <span data-role="meta">${c.count} ${c.countWord}</span>
          </div>
        </a>`)}
      </div>
    </div>
  </section>`
}
