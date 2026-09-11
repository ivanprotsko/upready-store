#!/usr/bin/env node
/**
 * Builds artifacts/docs/2026-09-12-mt-live-links.html — ONE page of live links for the
 * shipshift.dev multi-tenant deployment, with every night document rendered beside them
 * (task 4 of artifacts/prompts/2026-09-12-mt-deploy-orchestrator.md).
 *
 *   node scripts/build-links-page.mjs
 *
 * Why a generator and not a hand-written page: the documents are the SOURCE, and a page
 * that pasted their text would be a second copy that drifts the first time one of them is
 * edited (rule 4b — the canon is the file on disk). This reads them at build time and
 * embeds them verbatim, so rebuilding after an edit is one command and the page can never
 * disagree with the repository.
 *
 * Self-contained by design: it opens from `file://` with no server. Markdown is rendered
 * in the browser by marked and the diagrams by mermaid, both from cdnjs — the two CDN
 * <script> tags are the only things the page fetches. Offline, the documents still show as
 * their own plain text rather than as an empty pane.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "..")
const OUT = join(repo, "artifacts", "docs", "2026-09-12-mt-live-links.html")

/** Groups of live links. `note` is what a person needs to know BEFORE clicking. */
const LINK_GROUPS = [
  {
    id: "demo",
    title: "Оплата → онбординг",
    lede:
      "Четыре формы воронки, каждая доводит до онбординга собственного магазина. Настоящих платежей нет: " +
      "карта с суффиксом 0000 даёт отказ, 4242 4242 4242 4242 проходит.",
    links: [
      { href: "https://shiftship.dev/start", label: "Витрина четырёх сценариев", note: "вход с холодного старта" },
      { href: "https://shiftship.dev/start/pay?f=1", label: "Сценарий 1 · прямая оплата", note: "оплата → онбординг" },
      { href: "https://shiftship.dev/start/service?f=2", label: "Сценарий 2 · услуга, затем тариф", note: "услуга → тариф → оплата → онбординг" },
      { href: "https://shiftship.dev/start/plan?f=3", label: "Сценарий 3 · только тариф", note: "тариф → оплата → онбординг" },
      { href: "https://shiftship.dev/start/service?f=4", label: "Сценарий 4 · только услуга", note: "услуга → оплата → онбординг" },
      { href: "https://shiftship.dev/start/onboarding", label: "Онбординг без оплаты", note: "тот же мастер прямой ссылкой" },
    ],
  },
  {
    id: "shops",
    title: "Магазины на одном движке",
    lede:
      "Один процесс витрины и одна база. Магазин определяется по Host: своё имя, своя тема, свои категории, " +
      "своя hero-картинка.",
    links: [
      { href: "https://acme.shipshift.dev", label: "Acme", note: "профиль sneakers · Обувь, Аксессуары" },
      { href: "https://globex.shipshift.dev", label: "Globex", note: "профиль home-goods · Кухня, Дом" },
      { href: "https://initech.shipshift.dev", label: "Initech", note: "профиль electronics · Аудио, Питание и комплектующие" },
      { href: "https://custombot.space", label: "custombot.space", note: "свой домен Acme" },
      { href: "https://setpomo.com", label: "setpomo.com", note: "свой домен Globex" },
      { href: "https://nochlavka.shipshift.dev", label: "Ночная лавка", note: "заведён мастером 2026-09-12, каталог пустой" },
    ],
  },
  {
    id: "admin",
    title: "Движок и панели",
    lede: "Логины демонстрационные, на тестовом стенде.",
    links: [
      { href: "https://shipshift.dev/app", label: "Medusa Admin", note: "admin@upready.dev / supersecret" },
      { href: "https://panel.shipshift.dev", label: "Панель владельца магазина", note: "admin@acme.test / supersecret" },
      { href: "https://shipshift.dev/storefront/by-host?host=acme.shipshift.dev", label: "Как движок отвечает по Host", note: "JSON: тенант, ключ, тема, главная" },
    ],
  },
]

/** The documents, in reading order. Paths are repo-relative. */
const DOC_GROUPS = [
  {
    id: "specs",
    title: "Спеки мультитенантности",
    docs: [
      ["docs/multitenancy/storefront-by-host.md", "Витрина по Host", "как хост становится магазином"],
      ["docs/multitenancy/hosting-spec.md", "Хостинг", "топология, ingress, замеры (есть диаграмма)"],
      ["docs/multitenancy/onboarding-spec.md", "Онбординг", "сценарий заведения магазина (есть диаграмма)"],
      ["docs/multitenancy/admin-tenants-api-contract.md", "Контракт /tenants", "админский API тенантов"],
      ["docs/multitenancy/tenant-bundle-format.md", "Формат бандла", "что увозит магазин при отсоединении"],
      ["docs/multitenancy/backup-spec.md", "Бэкапы", "три уровня, восстановление"],
      ["docs/multitenancy/detach-spec.md", "Отсоединение", "магазин уходит со своим содержимым"],
    ],
  },
  {
    id: "briefs",
    title: "Брифы ночи 2",
    docs: [
      ["docs/multitenancy/2026-09-11-night-2-platform-brief.md", "Платформа", "бриф волны"],
      ["docs/multitenancy/2026-09-11-night-2-panel-brief.md", "Панель", "бриф волны"],
      ["docs/multitenancy/2026-09-11-night-2-specs-brief.md", "Спеки", "бриф волны"],
    ],
  },
  {
    id: "nights",
    title: "Отчёты ночей",
    docs: [
      ["artifacts/docs/2026-09-12-platform-night.md", "Платформенная ночь", "что сделано и чем доказано"],
      ["artifacts/docs/2026-09-12-tenant-panel-night.md", "Ночь панели", "что сделано и чем доказано"],
      ["artifacts/docs/2026-09-12-mt-deploy-wave-state.md", "Состояние волны деплоя", "снимок на момент передачи"],
      ["artifacts/docs/2026-09-12-mt-deploy-acceptor-state.md", "Состояние для приёмщика", "что измерено, что нет"],
      ["artifacts/docs/2026-09-12-tenant-panel-defects.md", "Дефекты панели", "список"],
    ],
  },
  {
    id: "demo-docs",
    title: "Демо «оплата → онбординг»",
    docs: [
      ["artifacts/docs/2026-09-12-paywall-onboarding-demo-requirements.md", "Требования Ивана", "заказ целиком"],
      ["artifacts/docs/2026-09-12-paywall-onboarding-mockup.md", "Макет и приёмка", "восемь кадров, решения, критерии"],
    ],
  },
]

const docs = []
for (const group of DOC_GROUPS) {
  for (const [path, title, note] of group.docs) {
    const abs = join(repo, path)
    // A document named here and missing is a broken promise on a page of links, not a
    // gap to render as an empty pane: fail loudly with the path that was checked.
    let text
    try {
      text = readFileSync(abs, "utf8")
    } catch (error) {
      throw new Error(`build-links-page: ${abs} is named in DOC_GROUPS but cannot be read (${error.code})`)
    }
    if (!text.trim()) {
      throw new Error(`build-links-page: ${abs} is empty`)
    }
    docs.push({
      id: path.replace(/[^a-z0-9]+/gi, "-"),
      group: group.id,
      path,
      file: `file://${abs}`,
      title,
      note,
      bytes: statSync(abs).size,
      text,
    })
  }
}

const payload = JSON.stringify({ linkGroups: LINK_GROUPS, docGroups: DOC_GROUPS.map(({ id, title }) => ({ id, title })), docs })
  .replace(/</g, "\\u003c")

const html = `<!doctype html>
<html lang="ru" data-mode="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мультитенантный стенд shipshift.dev — живые ссылки и документы</title>
<style>
  :root {
    --bg: #ffffff; --bg-subtle: #fafafa; --panel: #ffffff;
    --fg: #0a0a0a; --fg-muted: #666666; --fg-subtle: #8f8f8f;
    --border: #e4e4e4; --border-strong: #d0d0d0;
    --accent: #0a0a0a; --accent-fg: #ffffff;
    --link: #0060df; --ok: #0a7f3f; --warn: #a05a00;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  }
  html[data-mode="dark"] {
    --bg: #0a0a0a; --bg-subtle: #111111; --panel: #0f0f0f;
    --fg: #ededed; --fg-muted: #a1a1a1; --fg-subtle: #7a7a7a;
    --border: #262626; --border-strong: #383838;
    --accent: #ededed; --accent-fg: #0a0a0a;
    --link: #6fb0ff; --ok: #55c98a; --warn: #e0a458;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
  a { color: var(--link); }
  .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; background: var(--bg); border-bottom: 1px solid var(--border); }
  .topbar h1 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
  .tag { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--fg-muted); border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; }
  .topbar .spacer { margin-left: auto; }
  .modeToggle { font: inherit; font-size: 12px; color: var(--fg-muted); background: transparent;
    border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .modeToggle:hover { color: var(--fg); border-color: var(--border-strong); }
  .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); } }
  .side { position: sticky; top: 49px; height: calc(100vh - 49px); overflow-y: auto;
    border-right: 1px solid var(--border); padding: 18px 14px 40px; background: var(--bg-subtle); }
  .side h2 { margin: 18px 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--fg-subtle); font-family: var(--mono); font-weight: 500; }
  .side h2:first-child { margin-top: 0; }
  .side a { display: block; padding: 5px 8px; border-radius: 6px; color: var(--fg-muted); text-decoration: none; font-size: 13px; }
  .side a:hover { background: var(--panel); color: var(--fg); }
  .side a.on { background: var(--panel); color: var(--fg); box-shadow: inset 2px 0 0 var(--accent); }
  main { padding: 28px 32px 96px; max-width: 940px; }
  section { scroll-margin-top: 64px; }
  .lede { color: var(--fg-muted); max-width: 68ch; }
  h2.block { font-size: 20px; letter-spacing: -0.02em; margin: 36px 0 6px; }
  h2.block:first-of-type { margin-top: 0; }
  .cards { display: grid; gap: 10px; margin: 16px 0 8px; }
  .card { display: flex; align-items: baseline; gap: 12px; padding: 12px 14px; border: 1px solid var(--border);
    border-radius: 10px; background: var(--panel); text-decoration: none; color: inherit; }
  .card:hover { border-color: var(--border-strong); }
  .card .label { font-weight: 550; }
  .card .url { font-family: var(--mono); font-size: 12px; color: var(--fg-subtle); word-break: break-all; }
  .card .note { margin-left: auto; text-align: right; color: var(--fg-muted); font-size: 12px; flex: 0 1 auto; }
  @media (max-width: 720px) { .card { flex-wrap: wrap; } .card .note { margin-left: 0; text-align: left; flex-basis: 100%; } }
  .docmeta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; margin: 2px 0 18px;
    padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .docmeta code { font-family: var(--mono); font-size: 12px; color: var(--fg-subtle); word-break: break-all; }
  .doc { line-height: 1.6; }
  .doc h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 10px; }
  .doc h2 { font-size: 17px; letter-spacing: -0.01em; margin: 28px 0 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .doc h3 { font-size: 15px; margin: 20px 0 6px; }
  .doc p, .doc li { max-width: 76ch; }
  .doc code { font-family: var(--mono); font-size: 12.5px; background: var(--bg-subtle); border: 1px solid var(--border);
    border-radius: 4px; padding: 1px 4px; }
  .doc pre { overflow-x: auto; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .doc pre code { background: none; border: 0; padding: 0; font-size: 12px; line-height: 1.5; }
  .doc table { border-collapse: collapse; font-size: 13px; display: block; overflow-x: auto; max-width: 100%; }
  .doc th, .doc td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
  .doc th { background: var(--bg-subtle); font-weight: 550; }
  .doc blockquote { margin: 12px 0; padding: 2px 0 2px 14px; border-left: 2px solid var(--border-strong); color: var(--fg-muted); }
  .doc .mermaid { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 8px; padding: 14px; overflow-x: auto; }
  .fallback { white-space: pre-wrap; font-family: var(--mono); font-size: 12px; }
  footer { color: var(--fg-subtle); font-size: 12px; padding: 24px 32px 60px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<div class="topbar">
  <h1>Мультитенантный стенд shipshift.dev</h1>
  <span class="tag">живые ссылки</span>
  <span class="spacer"></span>
  <button class="modeToggle" id="mode">светлый режим</button>
</div>
<div class="layout">
  <nav class="side" id="side"></nav>
  <main id="main"></main>
</div>
<footer>
  Страница собрана <code>scripts/build-links-page.mjs</code> из документов репозитория —
  правка документа и повторный запуск, руками её не редактируют.
</footer>
<script type="application/json" id="payload">${payload}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<script>
(function () {
  var data = JSON.parse(document.getElementById("payload").textContent)
  var side = document.getElementById("side")
  var main = document.getElementById("main")

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }

  // ---- live links -------------------------------------------------------
  data.linkGroups.forEach(function (group) {
    var h = el("h2", null, group.title); side.appendChild(h)
    group.links.forEach(function (link) {
      var a = el("a", null, link.label); a.href = "#" + group.id; side.appendChild(a)
    })
    var section = el("section"); section.id = group.id
    section.appendChild(el("h2", "block", group.title))
    section.appendChild(el("p", "lede", group.lede))
    var cards = el("div", "cards")
    group.links.forEach(function (link) {
      var a = el("a", "card"); a.href = link.href; a.target = "_blank"; a.rel = "noreferrer"
      var left = el("span")
      left.appendChild(el("span", "label", link.label))
      left.appendChild(document.createElement("br"))
      left.appendChild(el("span", "url", link.href))
      a.appendChild(left)
      a.appendChild(el("span", "note", link.note))
      cards.appendChild(a)
    })
    section.appendChild(cards)
    main.appendChild(section)
  })

  // ---- documents --------------------------------------------------------
  data.docGroups.forEach(function (group) {
    var mine = data.docs.filter(function (d) { return d.group === group.id })
    if (!mine.length) return
    side.appendChild(el("h2", null, group.title))
    mine.forEach(function (doc) { var a = el("a", null, doc.title); a.href = "#" + doc.id; side.appendChild(a) })
    main.appendChild(el("h2", "block", group.title))
    mine.forEach(function (doc) {
      var section = el("section"); section.id = doc.id
      var meta = el("div", "docmeta")
      meta.appendChild(el("strong", null, doc.title))
      meta.appendChild(el("span", "note", doc.note))
      var code = el("code", null, doc.file); meta.appendChild(code)
      section.appendChild(meta)
      var body = el("div", "doc")
      try {
        body.innerHTML = marked.parse(doc.text)
      } catch (e) {
        // No renderer (offline) is not "no document": show the source rather than a void.
        var pre = el("pre"); pre.appendChild(el("code", "fallback", doc.text)); body.appendChild(pre)
      }
      // \`\`\`mermaid fences land as <pre><code class="language-mermaid">; mermaid wants
      // its own <pre class="mermaid"> with the raw text.
      Array.prototype.forEach.call(body.querySelectorAll("code.language-mermaid"), function (code) {
        var pre = code.parentNode
        var holder = el("pre", "mermaid", code.textContent)
        pre.parentNode.replaceChild(holder, pre)
      })
      section.appendChild(body)
      main.appendChild(section)
    })
  })

  // ---- mode + diagrams --------------------------------------------------
  var root = document.documentElement
  var button = document.getElementById("mode")
  function label() { button.textContent = root.getAttribute("data-mode") === "dark" ? "светлый режим" : "тёмный режим" }
  try { var saved = localStorage.getItem("mt-links.mode"); if (saved === "light" || saved === "dark") root.setAttribute("data-mode", saved) } catch (e) {}
  label()
  button.addEventListener("click", function () {
    var next = root.getAttribute("data-mode") === "dark" ? "light" : "dark"
    root.setAttribute("data-mode", next)
    try { localStorage.setItem("mt-links.mode", next) } catch (e) {}
    label()
    if (window.mermaid) { location.reload() }
  })

  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: root.getAttribute("data-mode") === "dark" ? "dark" : "default" })
    mermaid.run({ querySelector: ".mermaid" }).catch(function () {})
  }

  // ---- which section am I in -------------------------------------------
  var links = Array.prototype.slice.call(side.querySelectorAll("a"))
  var sections = Array.prototype.slice.call(main.querySelectorAll("section"))
  function mark() {
    var top = window.scrollY + 80, current = null
    sections.forEach(function (s) { if (s.offsetTop <= top) current = s.id })
    links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + current) })
  }
  window.addEventListener("scroll", mark, { passive: true })
  mark()
})()
</script>
</body>
</html>
`

writeFileSync(OUT, html)
// Report what was READ BACK, not what was intended (rule 20a).
const written = statSync(OUT)
console.log(`build-links-page: ${OUT}`)
console.log(`  ${docs.length} documents embedded, ${(written.size / 1024).toFixed(0)} KB written`)
for (const doc of docs) console.log(`  ${String(doc.bytes).padStart(7)} B  ${doc.path}`)
if (written.size < docs.reduce((sum, d) => sum + d.bytes, 0)) {
  console.error("build-links-page: the page is smaller than the documents it embeds — something was dropped")
  process.exit(1)
}
