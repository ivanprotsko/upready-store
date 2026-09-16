#!/usr/bin/env node
/**
 * Витрина лаборатории: каждый шаблон × страница × вьюпорт рядом, с чек-листом
 * §Checklist из design/style-spec.md и ссылками на живой HTML.
 *
 *   node gallery.mjs          # после build.mjs и shots.mjs
 *
 * Сама витрина — ИНСТРУМЕНТ, а не магазин, поэтому она сделана в каноне Geist
 * (правило 27): тёмная по умолчанию, волосяные границы, один акцент, моношрифт
 * для чисел. Её собственный вид намеренно не похож на шаблоны — иначе Иван будет
 * судить витрину вместо них.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
/* Текст критерия приезжает из markdown: **жирный** и `код` нужно превратить,
   иначе в витрине видны звёздочки и обратные кавычки. */
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
const idx = JSON.parse(readFileSync(join(HERE, "dist", "index.json"), "utf8"))
const PAGES = [["index", "Главная"], ["catalog", "Каталог"], ["product", "Товар"]]
const VPS = [["desktop", "1280×900"], ["mobile", "390×844"]]

/* ── чек-лист вынимается из спеки, а не переписывается: один источник ── */
const spec = readFileSync(join(HERE, "design", "style-spec.md"), "utf8")
const tail = spec.slice(spec.indexOf("## §Checklist"))
const groups = []
for (const line of tail.split("\n")) {
  const g = /^\*\*(.+?)\*\*$/.exec(line.trim())
  if (g) { groups.push({ title: g[1], items: [] }); continue }
  const it = /^(\d+)\.\s+(.+)$/.exec(line.trim())
  if (it && groups.length) groups.push(groups.pop()) && groups[groups.length - 1].items.push({ n: it[1], text: it[2] })
}

const shots = new Set(existsSync(join(HERE, "shots")) ? readdirSync(join(HERE, "shots")) : [])
const shot = (id, page, vp) => {
  const f = `${id}-${page}-${vp}.webp`
  return shots.has(f) ? `../shots/${f}` : null
}

const templateCard = (t) => `
<article class="tpl" id="t-${esc(t.id)}" data-tpl="${esc(t.id)}">
  <header class="tpl-head">
    <div>
      <h2 class="tpl-name">${esc(t.name)}</h2>
      <p class="tpl-sub">${esc(t.subtitle)}</p>
    </div>
    <div class="tpl-links">
      ${PAGES.map(([p, label]) => `<a class="btn" href="../dist/${esc(t.id)}/${p}.html" target="_blank" rel="noopener">${label} ↗</a>`).join("")}
    </div>
  </header>
  <p class="tpl-aud">${esc(t.audience)}</p>
  <dl class="tpl-spec">
    <div><dt>шрифты</dt><dd>${esc(t.fonts.display)} + ${esc(t.fonts.body)}</dd></div>
    <div><dt>плотность</dt><dd>${esc(t.density)}</dd></div>
    <div><dt>колонок</dt><dd class="num">${t.gridCols}</dd></div>
    <div><dt>кадр карточки</dt><dd class="num">${esc(t.media.card)} · ${esc(t.media.fit)}</dd></div>
    <div><dt>товаров</dt><dd class="num">${t.products}</dd></div>
    <div><dt>палитра</dt><dd class="swatches">${["--background", "--foreground", "--primary", "--secondary", "--border", "--link", "--destructive"].map((k) => `<i style="background:${esc(t.tokensValues[k] || "transparent")}" title="${esc(k)}"></i>`).join("")}</dd></div>
  </dl>
  <div class="frames">
    ${PAGES.map(([p, label]) => `<figure class="frame" data-page="${p}">
      <figcaption>${label}</figcaption>
      ${VPS.map(([vp, size]) => {
        const src = shot(t.id, p, vp)
        return `<div class="shot" data-vp="${vp}">
          <span class="shot-label">${size}</span>
          ${src ? `<a href="../dist/${esc(t.id)}/${p}.html" target="_blank" rel="noopener"><img src="${src}" alt="${esc(t.name)} — ${label}, ${size}" loading="lazy"></a>`
                : `<div class="shot-missing">кадра нет — прогони <code>node shots.mjs</code></div>`}
        </div>`
      }).join("")}
    </figure>`).join("")}
  </div>
</article>`

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Лаборатория шаблонов магазина</title>
<style>
:root{
  --bg:#0a0a0a;--fg:#ededed;--sec:#1a1a1a;--hover:#1f1f1f;--border:#2e2e2e;
  --muted:#a1a1a1;--faint:#707070;--link:#52a8ff;--elev:#111;--r:8px;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: light){:root{
  --bg:#fff;--fg:#000;--sec:#f4f4f4;--hover:#ececec;--border:#e3e3e3;
  --muted:#171717;--faint:#8f8f8f;--link:#0068d6;--elev:#fff;}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:400 14px/1.45 var(--sans)}
a{color:inherit;text-decoration:none}
.wrap{max-width:1360px;margin:0 auto;padding:32px 24px 96px}
header.top{border-bottom:1px solid var(--border);padding-bottom:24px;margin-bottom:32px}
h1{font-size:28px;line-height:1.2;letter-spacing:-.03em;font-weight:600;margin:0 0 8px}
.lede{color:var(--muted);max-width:76ch;margin:0 0 16px}
.eyebrow{font:400 10px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
.docs{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.btn{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border:1px solid var(--border);border-radius:6px;color:var(--fg);font-size:13px}
.btn:hover{background:var(--hover)}
.btn[data-on]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);
  padding:12px 0;margin-bottom:24px;display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.bar .grp{display:flex;gap:6px;align-items:center}
.bar .grp>span{color:var(--faint);font:400 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em}
.tpl{border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:24px;background:var(--elev)}
.tpl-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.tpl-name{font-size:20px;letter-spacing:-.02em;font-weight:600;margin:0}
.tpl-sub{color:var(--faint);margin:4px 0 0}
.tpl-links{display:flex;gap:6px;flex-wrap:wrap}
.tpl-aud{color:var(--muted);max-width:86ch;margin:12px 0 16px}
.tpl-spec{display:flex;flex-wrap:wrap;gap:4px 24px;margin:0 0 20px;padding:12px 0;border-block:1px solid var(--border)}
.tpl-spec>div{display:flex;gap:8px;align-items:center}
.tpl-spec dt{color:var(--faint);font:400 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em}
.tpl-spec dd{margin:0}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.swatches{display:flex;gap:3px}
.swatches i{width:14px;height:14px;border-radius:3px;border:1px solid var(--border);display:block}
.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.frame{margin:0;display:grid;gap:8px;align-content:start}
.frame figcaption{font:400 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
.shot{position:relative;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--sec);max-height:520px}
.shot img{width:100%;display:block}
.shot-label{position:absolute;top:6px;right:6px;z-index:2;background:var(--bg);color:var(--faint);
  border:1px solid var(--border);border-radius:4px;padding:1px 6px;font:400 10px/1.4 var(--mono)}
.shot[data-vp=mobile]{max-width:280px}
.shot-missing{padding:24px;color:var(--faint);font-size:12px}
.shot a{display:block;max-height:520px;overflow:hidden}
.checklist{border:1px solid var(--border);border-radius:var(--r);padding:20px;background:var(--elev);margin-bottom:24px}
.checklist h2{font-size:20px;letter-spacing:-.02em;font-weight:600;margin:0 0 4px}
.cl-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:16px}
.cl-group h3{font:400 10px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin:0 0 8px}
.cl-group ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.cl-group li{display:flex;gap:8px;align-items:flex-start;color:var(--muted)}
.cl-group input{margin:2px 0 0;accent-color:var(--link)}
.cl-n{font-family:var(--mono);color:var(--faint);font-size:11px;min-width:16px}
.note{color:var(--faint);font-size:12px;margin-top:8px}
@media (max-width:1100px){.frames{grid-template-columns:minmax(0,1fr)}}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <span class="eyebrow">tp01 · лаборатория шаблонов</span>
  <h1>Шаблоны магазина: семь одежд одного языка</h1>
  <p class="lede">Семь шаблонов, у каждого три страницы и два вьюпорта. Они обязаны выглядеть как
  <strong>одна система</strong>: одна типографическая шкала, одна шкала отступов, одна грамматика
  компонентов. Отличаться им разрешено только палитрой, парой шрифтов, плотностью, числом колонок
  и соотношением кадра — всё это напечатано в карточке каждого шаблона.</p>
  <p class="lede">Кадр открывает живую страницу в новой вкладке — судить лучше её, а не снимок.</p>
  <div class="docs">
    <a class="btn" href="../design/diagnosis.md">Диагноз живого магазина</a>
    <a class="btn" href="../design/style-spec.md">Спецификация стиля</a>
    <a class="btn" href="../design/quality-rules.md">Правила проверки</a>
    <a class="btn" href="../design/before/">Кадры «до»</a>
  </div>
</header>

<nav class="bar">
  <span class="grp"><span>страница</span>
    <button class="btn" data-filter="page" data-val="all" data-on>все</button>
    ${PAGES.map(([p, l]) => `<button class="btn" data-filter="page" data-val="${p}">${l}</button>`).join("")}
  </span>
  <span class="grp"><span>вьюпорт</span>
    <button class="btn" data-filter="vp" data-val="all" data-on>оба</button>
    ${VPS.map(([v, l]) => `<button class="btn" data-filter="vp" data-val="${v}">${v === "desktop" ? "десктоп" : "мобиль"}</button>`).join("")}
  </span>
  <span class="grp"><span>шаблон</span>
    <button class="btn" data-filter="tpl" data-val="all" data-on>все ${idx.templates.length}</button>
    ${idx.templates.map((t) => `<button class="btn" data-filter="tpl" data-val="${esc(t.id)}">${esc(t.name)}</button>`).join("")}
  </span>
</nav>

<section class="checklist">
  <h2>Чем судить</h2>
  <p class="note">Двадцать критериев из <code>design/style-spec.md</code> §Checklist. «Нет» — это дефект, а не мнение. Отметки живут в этом браузере.</p>
  <div class="cl-groups">
    ${groups.filter((g) => g.items.length).map((g) => `<div class="cl-group">
      <h3>${esc(g.title)}</h3>
      <ul>${g.items.map((i) => `<li><input type="checkbox" id="cl${i.n}"><span class="cl-n">${i.n}</span><label for="cl${i.n}">${md(i.text)}</label></li>`).join("")}</ul>
    </div>`).join("")}
  </div>
</section>

${idx.templates.map(templateCard).join("\n")}

<p class="note">Собрано <code>node build.mjs</code> · снято <code>node shots.mjs</code> ·
проверено <code>node check.mjs</code> · витрина <code>node gallery.mjs</code></p>
</div>
<script>
(function(){
  var state={page:"all",vp:"all",tpl:"all"};
  function apply(){
    document.querySelectorAll("[data-tpl]").forEach(function(t){
      t.hidden = state.tpl!=="all" && t.dataset.tpl!==state.tpl;
    });
    document.querySelectorAll(".frame").forEach(function(f){
      f.hidden = state.page!=="all" && f.dataset.page!==state.page;
    });
    document.querySelectorAll(".shot").forEach(function(s){
      s.hidden = state.vp!=="all" && s.dataset.vp!==state.vp;
    });
    document.querySelectorAll(".frames").forEach(function(g){
      g.style.gridTemplateColumns = state.page==="all" ? "" : "minmax(0,1fr)";
    });
  }
  document.querySelectorAll("[data-filter]").forEach(function(b){
    b.addEventListener("click",function(){
      var k=b.dataset.filter;
      state[k]=b.dataset.val;
      document.querySelectorAll('[data-filter="'+k+'"]').forEach(function(o){
        if(o===b) o.setAttribute("data-on",""); else o.removeAttribute("data-on");
      });
      apply();
    });
  });
  // отметки чек-листа переживают перезагрузку, но живут только в этом браузере
  document.querySelectorAll(".cl-group input").forEach(function(c){
    try{ c.checked = localStorage.getItem("tp01."+c.id)==="1" }catch(e){}
    c.addEventListener("change",function(){ try{ localStorage.setItem("tp01."+c.id, c.checked?"1":"0") }catch(e){} });
  });
  apply();
})();
</script>
</body>
</html>
`
mkdirSync(join(HERE, "gallery"), { recursive: true })
writeFileSync(join(HERE, "gallery", "index.html"), html)
console.log(`витрина: шаблонов ${idx.templates.length} · кадров ${shots.size} · критериев ${groups.reduce((n, g) => n + g.items.length, 0)}`)
