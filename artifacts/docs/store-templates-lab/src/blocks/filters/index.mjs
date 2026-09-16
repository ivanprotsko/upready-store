import { esc, map, money } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "filters", variants: ["bar", "sidebar"] }

/* Фильтр и сортировка — ОДНА группа управления и стоят рядом (диагноз: в живом
   магазине их разносило на 1000 px). Диапазон цены — «от/до» (must-фича r03). */
const control = (f) => {
  if (f.type === "price") {
    return `<div class="filter-price">
      <span data-role="meta">${esc(f.label)}</span>
      <input class="input" type="number" inputmode="numeric" aria-label="Цена от" placeholder="${esc(String(f.min))}">
      <span data-role="meta" aria-hidden="true">—</span>
      <input class="input" type="number" inputmode="numeric" aria-label="Цена до" placeholder="${esc(String(f.max))}">
    </div>`
  }
  return `<details class="filter">
    <summary class="filter-head">${esc(f.label)}${icons.chevronDown}</summary>
    <div class="filter-panel surface">${map(f.options, (o, i) => `<label class="filter-opt">
      <input type="checkbox"${i === 0 && f.checked ? " checked" : ""}><span data-role="body">${esc(o.label)}</span><span data-role="meta">${o.count}</span>
    </label>`)}</div>
  </details>`
}

export function render(b, ctx) {
  const chips = (b.active || []).map((a) => `<button class="chip" type="button">${esc(a)}${icons.close}</button>`).join("")
  return `<section class="band filters-band" data-block="filters" data-tight>
    <div class="container">
      <div class="filters-row">
        <div class="filters-group">${map(b.filters, control)}</div>
        <label class="filters-sort">
          <span data-role="meta">Сортировка</span>
          <select class="select" aria-label="Сортировка">${map(b.sort, (s) => `<option>${esc(s)}</option>`)}</select>
        </label>
      </div>
      ${chips ? `<div class="filters-active">${chips}<button class="btn" data-variant="ghost" data-size="sm" type="button">Сбросить</button></div>` : ""}
      <p class="filters-count" data-role="meta">${b.count} ${esc(b.countWord)}${b.from ? ` · от ${money(b.from)}` : ""}</p>
    </div>
  </section>`
}
