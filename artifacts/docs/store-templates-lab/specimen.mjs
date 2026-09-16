#!/usr/bin/env node
/**
 * Образец языка: одна страница, на которой видно ВСЁ общее — шкала кеглей с именами
 * ролей, шкала отступов, радиусы, палитры всех шаблонов с числами контраста и каждый
 * компонент в каждом состоянии. Переключатель наверху применяет токены любого шаблона.
 *
 * Это и есть артефакт стадии дизайна (правило 27d): по нему видно, что шаблоны делят
 * один язык, ещё до того, как смотреть семь готовых магазинов. Генерируется из тех же
 * токенов, что и страницы, поэтому разойтись с ними не может.
 *
 *   node specimen.mjs   →  design/mockups/specimen.html
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ratio } from "./tools/contrast.mjs"
import { money } from "./src/lib/html.mjs"
import { icons, stars } from "./src/lib/icons.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const idx = JSON.parse(readFileSync(join(HERE, "dist", "index.json"), "utf8"))

const ROLES = [
  ["display", "заголовок hero", "Мёд, травы и масла"],
  ["page-title", "заголовок страницы", "Мёд и продукты пчеловодства"],
  ["section-title", "заголовок раздела", "Что есть в хозяйстве"],
  ["subsection-title", "подраздел", "Доставка и оплата"],
  ["lead", "лид", "Мы сами заготавливаем, сами фасуем и сами отвечаем на звонки."],
  ["body", "тело текста", "Пасека кочует трижды за лето: разнотравье, гречиха, тайга."],
  ["meta", "мета", "500 г · артикул ART-2102"],
  ["eyebrow", "надглавие", "урожай 2026"],
]
const SPACES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]
const PX = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96, 32: 128 }
const PAIRS = [
  ["--foreground", "--background", "основной текст"],
  ["--muted-foreground", "--background", "второстепенный"],
  ["--muted-foreground", "--surface-media", "подпись на подложке кадра"],
  ["--primary-foreground", "--primary", "главная кнопка"],
  ["--link", "--background", "ссылка"],
  ["--destructive-foreground", "--destructive", "метка скидки"],
]

const palette = (t) => `<section class="spec-block">
  <h3 class="sp-h">${esc(t.name)} — палитра и контраст</h3>
  <div class="sw-row">${Object.entries(t.tokensValues).map(([k, v]) =>
    `<span class="sw"><i style="background:${esc(v)}"></i><code>${esc(k.replace("--", ""))}</code></span>`).join("")}</div>
  <table class="sp-t"><thead><tr><th>пара</th><th>что это</th><th class="n">контраст</th><th>AA</th></tr></thead><tbody>
  ${PAIRS.map(([fg, bg, what]) => {
    const a = t.tokensValues[fg], b = t.tokensValues[bg]
    if (!a || !b) return ""
    const r = ratio(a, b)
    return `<tr><td><code>${esc(fg)}</code> на <code>${esc(bg)}</code></td><td>${esc(what)}</td>
      <td class="n">${r.toFixed(2)}</td><td>${r >= 4.5 ? "да" : "НЕТ"}</td></tr>`
  }).join("")}
  </tbody></table>
</section>`

const html = `<!doctype html>
<html lang="ru" data-density="comfortable">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Образец языка — лаборатория шаблонов</title>
<link rel="stylesheet" href="../../assets/fonts.css">
<link rel="stylesheet" href="../../assets/base.css">
<link rel="stylesheet" href="../../assets/t-ferma.css" id="tpl-css">
<style>
  .spec { padding-block: var(--space-12); }
  .spec-block { padding-block: var(--space-8); border-top: var(--hairline) solid var(--border); }
  .sp-h { font-size: var(--text-title); line-height: var(--lh-title); font-weight: var(--weight-strong);
          font-family: var(--font-display); margin-block-end: var(--space-6); }
  .sp-grid { display: grid; grid-template-columns: var(--space-32) minmax(0, 1fr); gap: var(--space-4) var(--space-6); align-items: baseline; }
  .sp-key { font-family: var(--font-mono); font-size: var(--text-meta); color: var(--muted-foreground); }
  .sw-row { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-block-end: var(--space-6); }
  .sw { display: grid; gap: var(--space-1); justify-items: center; }
  .sw i { display: block; width: var(--space-8); height: var(--space-8); border-radius: var(--r-sm);
          border: var(--hairline) solid var(--border); }
  .sw code, .sp-key code { font-family: var(--font-mono); font-size: var(--text-meta); color: var(--muted-foreground); }
  .sp-t { width: 100%; border-collapse: collapse; }
  .sp-t th, .sp-t td { text-align: start; padding: var(--space-2) var(--space-3); border-bottom: var(--hairline) solid var(--border); font-size: var(--text-meta); }
  .sp-t .n { text-align: end; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .bar-space { background: var(--accent); height: var(--space-4); border-radius: var(--r-sm); }
  .row-wrap { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
  .switch { position: sticky; top: 0; z-index: 9; background: var(--background);
            border-bottom: var(--hairline) solid var(--border); padding-block: var(--space-3); }
  .radii { display: flex; gap: var(--space-4); }
  .radii div { width: var(--space-24); height: var(--space-16); background: var(--secondary); display: grid; place-items: center; }
</style>
</head>
<body>
<div class="container spec">
  <span data-role="eyebrow">tp01 · образец языка</span>
  <h1 data-role="page-title">Один язык: шкалы, роли, грамматика</h1>
  <p data-role="lead">Переключатель применяет токены другого шаблона. Всё, что ниже, обязано
  остаться на месте: меняются только палитра, шрифты и плотность.</p>
</div>

<div class="switch"><div class="container row-wrap">
  <span data-role="meta">Шаблон:</span>
  ${idx.templates.map((t, i) => `<button class="btn" data-variant="${i ? "secondary" : "primary"}" data-size="sm" type="button"
     data-tpl="${esc(t.id)}" data-density="${esc(t.density)}">${esc(t.name)}</button>`).join("")}
</div></div>

<div class="container">
  <section class="spec-block">
    <h3 class="sp-h">Типографическая шкала — отношение 1.25, семь ступеней</h3>
    <div class="sp-grid">
      ${ROLES.map(([r, what, sample]) => `<span class="sp-key"><code>${r}</code><br>${esc(what)}</span>
        <span data-role="${r}">${esc(sample)}</span>`).join("")}
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Шкала отступов — кратные 4, десять ступеней</h3>
    <div class="sp-grid">
      ${SPACES.map((s) => `<span class="sp-key"><code>--space-${s}</code> · ${PX[s]}px</span>
        <span class="bar-space" style="width: var(--space-${s})"></span>`).join("")}
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Радиусы — общие для всех шаблонов</h3>
    <div class="radii">
      <div style="border-radius: var(--r-sm)"><span data-role="meta">r-sm 6</span></div>
      <div style="border-radius: var(--r-md)"><span data-role="meta">r-md 8</span></div>
      <div style="border-radius: var(--r-lg)"><span data-role="meta">r-lg 12</span></div>
      <div style="border-radius: var(--r-pill)"><span data-role="meta">pill</span></div>
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Кнопки, ссылки, метки</h3>
    <div class="row-wrap">
      <button class="btn" data-variant="primary" data-size="lg" type="button">Главное действие</button>
      <button class="btn" data-variant="secondary" data-size="lg" type="button">Второе</button>
      <button class="btn" data-variant="ghost" data-size="lg" type="button">Третье</button>
    </div>
    <div class="row-wrap" style="margin-block-start: var(--space-4)">
      <button class="btn" data-variant="primary" type="button">Обычная</button>
      <button class="btn" data-variant="secondary" data-size="sm" type="button">Мелкая</button>
      <button class="icon-btn" type="button" aria-label="Корзина">${icons.cart}</button>
      <a class="link" href="#">Текстовая ссылка</a>
      <span class="badge">Новинка</span>
      <span class="badge" data-tone="sale">−20 %</span>
      <span class="badge" data-tone="new">Хит</span>
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Цена, рейтинг, наличие</h3>
    <div class="row-wrap">
      <span data-role="price">${money(1355)}</span>
      <s data-role="price-old">${money(1690)}</s>
      <span data-role="card-price">${money(990)}<s data-role="card-price-old">${money(1290)}</s></span>
      <span class="rating">${stars(4)}<span class="value">4,0 · 31 отзыв</span></span>
      <span class="stock">В наличии</span>
      <span class="stock" data-state="low">Осталось мало</span>
      <span class="stock" data-state="out">Нет в наличии</span>
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Поля ввода</h3>
    <div class="row-wrap" style="align-items: end">
      <label class="field" style="min-width: var(--space-32)"><span>Имя</span><input class="input" placeholder="Оксана"></label>
      <label class="field" style="min-width: var(--space-32)"><span>Город</span>
        <select class="select"><option>Барнаул</option><option>Новосибирск</option></select></label>
      <label class="filter-opt" style="min-width: var(--space-32)"><input type="checkbox" checked><span data-role="body">Только в наличии</span><span data-role="meta">12</span></label>
    </div>
  </section>

  <section class="spec-block">
    <h3 class="sp-h">Карточка товара — и её пустое состояние</h3>
    <div class="grid-products" style="--grid-cols: 4">
      <article class="card" data-component="product-card" data-product="s1">
        <div class="card-media-wrap"><a class="card-media-link" data-role="card-media" href="#">
          <div class="media" data-img-role="card" data-media-pad><img src="../../assets/media/ferma/p-p1.svg" alt="Мёд таёжный" width="400" height="500"></div></a></div>
        <div class="card-body" data-role="card-body">
          <h3 class="card-title" data-role="card-title"><a href="#">Мёд таёжный, дикое разнотравье</a></h3>
          <div data-role="card-price">${money(990)}</div>
          <div class="card-meta" data-role="card-meta">500 г</div>
        </div>
      </article>
      <article class="card" data-component="product-card" data-product="s2">
        <div class="card-media-wrap"><a class="card-media-link" data-role="card-media" href="#">
          <div class="media" data-img-role="card" data-media-pad><img src="../../assets/media/ferma/p-p5.svg" alt="Тройчатка плюс" width="400" height="500"></div></a></div>
        <div class="card-body" data-role="card-body">
          <span class="badge" data-role="card-badge" data-tone="sale">−20 %</span>
          <h3 class="card-title" data-role="card-title"><a href="#">Тройчатка плюс, растительный комплекс</a></h3>
          <div data-role="card-price">${money(1355)}<s data-role="card-price-old">${money(1690)}</s></div>
          <div class="card-meta" data-role="card-meta">60 капсул</div>
        </div>
      </article>
      <article class="card" data-component="product-card" data-product="s3">
        <div class="card-media-wrap"><a class="card-media-link" data-role="card-media" href="#">
          <div class="media" data-img-role="card" data-empty>
            <span class="empty-initial" aria-hidden="true">П</span>
            <span class="empty-label">Мёд<br>фото готовится</span>
          </div></a></div>
        <div class="card-body" data-role="card-body">
          <h3 class="card-title" data-role="card-title"><a href="#">Прополис натуральный</a></h3>
          <div data-role="card-price">${money(990)}</div>
          <div class="card-meta" data-role="card-meta">30 г</div>
        </div>
      </article>
      <article class="card" data-component="product-card" data-product="s4">
        <div class="card-media-wrap"><a class="card-media-link" data-role="card-media" href="#">
          <div class="media" data-img-role="card" data-media-pad><img src="../../assets/media/ferma/p-p10.svg" alt="Мультиварка" width="400" height="500"></div></a></div>
        <div class="card-body" data-role="card-body">
          <h3 class="card-title" data-role="card-title"><a href="#">Мультиварка для дома и авто, 2 л</a></h3>
          <div data-role="card-price">${money(7333)}</div>
          <div class="card-meta" data-role="card-meta">12/24/220 В</div>
        </div>
      </article>
    </div>
  </section>

  ${idx.templates.map(palette).join("")}
</div>

<script>
document.querySelectorAll("[data-tpl]").forEach(function(b){
  b.addEventListener("click", function(){
    document.getElementById("tpl-css").href = "../../assets/t-" + b.dataset.tpl + ".css";
    document.documentElement.setAttribute("data-density", b.dataset.density);
    document.querySelectorAll("[data-tpl]").forEach(function(o){ o.setAttribute("data-variant", o===b ? "primary" : "secondary") });
  });
});
</script>
</body>
</html>
`
mkdirSync(join(HERE, "design", "mockups"), { recursive: true })
writeFileSync(join(HERE, "design", "mockups", "specimen.html"), html)
console.log(`образец языка: ролей ${ROLES.length} · ступеней отступа ${SPACES.length} · палитр ${idx.templates.length}`)
