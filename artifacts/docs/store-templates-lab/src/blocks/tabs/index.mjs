import { esc, map, slug } from "../../lib/html.mjs"
import { render as renderSpecs } from "../specs/index.mjs"
export const meta = { id: "tabs" }

/* «Описание / Характеристики / Отзывы» — must-фича r03 (product-tabs).
   Проза идёт ТОЛЬКО абзацами и списками (QR-PROSE) и в колонке шириной
   --measure, а не в самой узкой на странице (QR-COLUMN-RANK). */
const panelBody = (t, ctx) => {
  if (t.type === "specs") return renderSpecs({ rows: t.rows }, ctx)
  if (t.type === "prose") {
    return `<div data-role="prose">${map(t.paragraphs, (p) =>
      Array.isArray(p) ? `<ul>${map(p, (li) => `<li data-role="body">${esc(li)}</li>`)}</ul>` : `<p data-role="body">${esc(p)}</p>`)}</div>`
  }
  return `<p data-role="body">${esc(t.text || "")}</p>`
}

export function render(b, ctx) {
  const tabs = b.tabs || []
  const ids = tabs.map((t) => slug(t.label))
  return `<section class="band" data-block="tabs" data-tight>
    <div class="container">
      <div class="tabs" data-tabs>
        <div class="tabs-bar" role="tablist" aria-label="${esc(b.label || "Сведения о товаре")}">
          ${map(tabs, (t, i) => `<button class="tab" type="button" role="tab" id="tab-${ids[i]}" aria-controls="panel-${ids[i]}" aria-selected="${i === 0}">${esc(t.label)}</button>`)}
        </div>
        ${map(tabs, (t, i) => `<section class="tab-panel" role="tabpanel" id="panel-${ids[i]}" aria-labelledby="tab-${ids[i]}"${i ? " hidden" : ""}>
          <h2 class="tab-panel-head" data-role="section-title">${esc(t.label)}</h2>
          ${panelBody(t, ctx)}
        </section>`)}
      </div>
    </div>
  </section>`
}
