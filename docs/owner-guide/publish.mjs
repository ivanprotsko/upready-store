#!/usr/bin/env node
// Puts the guide together with its frames, in two forms:
//   --site <dir>   the help the panel serves at /help/: the table of contents as index.html and a page per section
//                  (<dir>/<section>/index.html), a menu of the sections with the headings of the open one, «← previous»
//                  and «next →» under the text, the frames in <dir>/shots. apps/tenant-panel/Dockerfile builds it into
//                  the panel image; any static server shows it as well (the links are relative).
//   --html <file>  one HTML file with every page and every frame inside it and a table of contents on top, to send
//                  to the shop as is
//
//   node docs/owner-guide/publish.mjs [--shots <dir>] --site <dir> [--html <file>]
//
// --shots is guide/shots by default. Refuses when a page shows a frame that is not there, so the help never has a hole.
// Nothing is fetched from elsewhere, so no web fonts and no outside scripts or styles. The pages ask not to be indexed.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { PAGES_DIR, SHOTS_DIR, guidePages, imageRefs, parseArgs } from "./lib.mjs"

const args = parseArgs(process.argv.slice(2), { shots: "value", site: "value", html: "value" })
if (!args.site && !args.html) throw new Error("нужен --site <папка> или --html <файл>")
const shots = args.shots ?? SHOTS_DIR

const missing = imageRefs().filter(({ id }) => !existsSync(join(shots, `${id}.webp`)))
if (missing.length) {
  for (const m of missing) console.error(`нет кадра ${m.id}.webp (его показывает guide/${m.page})`)
  process.exit(1)
}

const TITLE = "Справка по панели"
const HOME = "00-oglavlenie"

/** Width and height of a WebP file from its header (lossless VP8L, extended VP8X or lossy VP8). */
const webpSize = (buf) => {
  const kind = buf.toString("ascii", 12, 16)
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21)
    return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1]
  }
  if (kind === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1]
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
  throw new Error(`не WebP: ${kind}`)
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
/** The anchor GitHub gives a heading, so `07-nastrojki.md#оплата` lands on the same heading here. */
const slugOf = (text) => text.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/ /g, "-")
const plain = (md) => md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

/** A page: its name, title (the `# ` line) and `## ` headings with the anchors they get. */
const pages = guidePages().map((file) => {
  const name = file.replace(/\.md$/, "")
  const md = readFileSync(join(PAGES_DIR, file), "utf8")
  const title = plain(md.match(/^# (.*)$/m)?.[1] ?? name)
  const seen = new Map()
  const headings = [...md.matchAll(/^(#{2,4}) (.*)$/gm)].map((m) => {
    const base = slugOf(plain(m[2]))
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { level: m[1].length, text: plain(m[2]), id: n ? `${base}-${n}` : base }
  })
  return { file, name, md, title, headings }
})
if (pages[0]?.name !== HOME) throw new Error(`первой страницей должна быть ${HOME}.md`)

/**
 * Markdown of a guide page → HTML. The pages use a small part of markdown: headings, paragraphs, lists with
 * indented continuation lines, tables, quotes, a frame on its own line, links, bold and code.
 *   link(page, hash)  the href of a link to another guide page
 *   frame(id, alt)    the HTML of a frame
 *   id(anchor)        the id a heading gets
 */
const render = (md, { link, frame, id }) => {
  const inline = (s) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([0-9a-z-]+)\.md(?:#([^)]*))?\)/g, (_, t, p, h) => `<a href="${link(p, h)}">${t}</a>`)
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
  const out = []
  const lines = md.split("\n")
  const starts = (l) => /^(#{1,4} |\||> |!\[|(\d+\.|-) )/.test(l)
  const seen = new Map()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h = line.match(/^(#{1,4}) (.*)$/)
    const img = line.match(/^!\[([^\]]*)\]\(shots\/([a-z0-9-]+)\.webp\)$/)
    if (!line.trim()) continue
    if (h) {
      const level = h[1].length
      if (level === 1) out.push(`<h1>${inline(h[2])}</h1>`)
      else {
        const base = slugOf(plain(h[2]))
        const n = seen.get(base) ?? 0
        seen.set(base, n + 1)
        out.push(`<h${level} id="${id(n ? `${base}-${n}` : base)}">${inline(h[2])}</h${level}>`)
      }
    } else if (img) {
      out.push(frame(img[2], img[1]))
    } else if (line.startsWith("|")) {
      const rows = []
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++])
      i--
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
      const [head, ...body] = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r))
      out.push(
        `<div class="table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      )
    } else if (/^(\d+\.|-) /.test(line)) {
      const ordered = /^\d+\./.test(line)
      const items = []
      while (i < lines.length && /^(\d+\.|-) |^ {2,}\S/.test(lines[i])) {
        if (/^ {2,}\S/.test(lines[i])) items[items.length - 1] += " " + lines[i].trim()
        else items.push(lines[i].replace(/^(\d+\.|-) /, ""))
        i++
      }
      i--
      const tag = ordered ? "ol" : "ul"
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`)
    } else if (line.startsWith("> ")) {
      const quote = []
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2))
      i--
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`)
    } else {
      const para = [line]
      while (i + 1 < lines.length && lines[i + 1].trim() && !starts(lines[i + 1])) para.push(lines[++i])
      out.push(`<p>${inline(para.join(" "))}</p>`)
    }
  }
  return out.join("\n")
}

const CSS = `:root{color-scheme:light;--bg:#fff;--side:#fafafa;--fg:#18181b;--sub:#52525b;--muted:#71717a;--line:#e4e4e7;--hover:#f4f4f5;--link:#2563eb;--card:0 0 0 1px rgba(0,0,0,.08),0 1px 2px -1px rgba(0,0,0,.08),0 2px 4px rgba(0,0,0,.04)}
*{box-sizing:border-box}html{scroll-padding-top:24px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--link);text-underline-offset:2px}
.bar{display:none}
.nav{position:fixed;top:0;bottom:0;left:0;width:300px;overflow-y:auto;background:var(--side);border-right:1px solid var(--line);padding:20px 12px 40px}
.nav-head{display:flex;align-items:center;justify-content:space-between;padding:0 8px 16px}
.nav-title{font-weight:600;color:var(--fg);text-decoration:none}
.nav-close{display:none}
.nav ol,.nav ul{list-style:none;margin:0;padding:0}
.nav a.sec{display:block;padding:6px 8px;border-radius:6px;color:var(--sub);text-decoration:none;font-size:14px;font-weight:500;line-height:1.4}
.nav a.sec:hover{background:var(--hover);color:var(--fg)}
.nav a.sec[aria-current=page]{background:#fff;color:var(--fg);box-shadow:var(--card)}
.nav .sub{margin:4px 0 8px 12px;border-left:1px solid var(--line)}
.nav .sub a{display:block;padding:4px 8px 4px 12px;color:var(--muted);text-decoration:none;font-size:13px;line-height:1.4}
.nav .sub a:hover{color:var(--fg)}
.doc{margin-left:300px;padding:40px 56px 64px}
.text{max-width:760px}
h1{font-size:30px;line-height:1.25;margin:0 0 20px;letter-spacing:-.01em}
h2{font-size:22px;line-height:1.3;margin:44px 0 12px}h3{font-size:18px;margin:32px 0 8px}h4{font-size:16px;margin:24px 0 8px}
p,ul,ol,blockquote{margin:0 0 14px}li{margin:4px 0}
code{background:var(--hover);padding:1px 5px;border-radius:4px;font-size:.92em}
blockquote{border-left:3px solid var(--line);padding:4px 14px;color:var(--sub)}
.table{overflow-x:auto;margin:14px 0 20px}
table{border-collapse:collapse;width:100%;font-size:15px;line-height:1.45}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:var(--side);font-weight:600}
.shot{display:block;margin:12px 0 22px;cursor:zoom-in;line-height:0}
.shot img{width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:48px;padding-top:24px;border-top:1px solid var(--line)}
.pager a{display:block;padding:12px 14px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--fg)}
.pager a:hover{background:var(--hover)}.pager span{display:block;font-size:13px;color:var(--muted)}.pager strong{font-weight:500}
.pager .next{grid-column:2;text-align:right}
.zoom{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(9,9,11,.88);cursor:zoom-out}
.zoom img{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:6px;background:#fff}
.zoom button{position:absolute;top:12px;right:12px;width:44px;height:44px;border:0;border-radius:22px;background:#fff;color:var(--fg);font-size:24px;line-height:1;cursor:pointer}
.toc{border:1px solid var(--line);border-radius:8px;padding:16px 20px;margin:0 0 32px;background:var(--side)}
.toc ol{margin:0;padding-left:20px}.toc ul{margin:4px 0 8px;padding-left:18px;font-size:14px}
.up{font-size:14px}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
body.one .doc{margin:0 auto;max-width:860px;padding:32px 24px 64px}
@media (max-width:1023.98px){
html{scroll-padding-top:72px}
.bar{display:flex;position:sticky;top:0;z-index:10;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:8px 16px;background:rgba(255,255,255,.97);border-bottom:1px solid var(--line)}
.bar-title{font-weight:600;color:var(--fg);text-decoration:none}
.bar-menu{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:8px;color:var(--fg);text-decoration:none;font-weight:500;background:#fff}
.nav{display:none;z-index:20;width:auto;right:0;border:0;background:var(--bg);padding:0 16px 40px}
.nav:target,.menu-open .nav{display:block}
.menu-open{overflow:hidden}
.nav-head{position:sticky;top:0;background:var(--bg);padding:8px 0 12px}
.nav-close{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:1px solid var(--line);border-radius:8px;color:var(--fg);text-decoration:none;font-size:24px}
.nav a.sec{padding:12px 10px;font-size:16px}.nav .sub a{padding:10px 10px 10px 14px;font-size:15px}
.doc{margin:0;padding:20px 16px 48px}
h1{font-size:25px}h2{font-size:20px;margin-top:36px}
.pager{grid-template-columns:1fr}.pager .next{grid-column:1}
}`

// The sections menu on a phone and the frame shown whole. Without a script the menu still opens (#razdely:target)
// and a frame is a link to its file.
const JS = `(function(){
var body=document.body;
function menu(open){body.classList.toggle("menu-open",open);var b=document.querySelector(".bar-menu");if(b)b.setAttribute("aria-expanded",open?"true":"false")}
document.addEventListener("click",function(e){
var t=e.target.closest&&e.target.closest(".bar-menu,.nav-close,.nav a,.shot");
if(!t)return;
if(t.classList.contains("bar-menu")){e.preventDefault();menu(true);var c=document.querySelector(".nav-close");if(c)c.focus();return}
if(t.classList.contains("nav-close")){e.preventDefault();menu(false);return}
if(t.classList.contains("shot")){e.preventDefault();zoom(t.querySelector("img")||t,t);return}
menu(false)});
function zoom(img,from){
var box=document.createElement("div");box.className="zoom";box.setAttribute("role","dialog");box.setAttribute("aria-modal","true");box.setAttribute("aria-label",img.alt||"Снимок");
var big=document.createElement("img");big.src=img.currentSrc||img.src;big.alt=img.alt||"";
var x=document.createElement("button");x.type="button";x.setAttribute("aria-label","Закрыть");x.textContent="\\u00d7";
box.appendChild(big);box.appendChild(x);body.appendChild(box);body.style.overflow="hidden";x.focus();
function close(){document.removeEventListener("keydown",key);box.remove();body.style.overflow="";if(from&&from.focus)from.focus()}
function key(e){if(e.key==="Escape")close()}
box.addEventListener("click",close);document.addEventListener("keydown",key)}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&body.classList.contains("menu-open"))menu(false)});
})();`

const head = (title, css) =>
  `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
  `<meta name="robots" content="noindex">\n<title>${esc(title)}</title>\n${css}\n</head>\n`

if (args.site) {
  const site = args.site
  mkdirSync(join(site, "shots"), { recursive: true })
  for (const id of new Set(imageRefs().map((r) => r.id))) copyFileSync(join(shots, `${id}.webp`), join(site, "shots", `${id}.webp`))
  writeFileSync(join(site, "help.css"), CSS + "\n")
  writeFileSync(join(site, "help.js"), JS + "\n")
  const size = new Map()
  pages.forEach((page, n) => {
    const home = page.name === HOME
    const up = home ? "" : "../"
    const hrefOf = (p) => (p === HOME ? up || "./" : `${up}${p}/`)
    const link = (p, h) => (p === page.name ? "" : hrefOf(p)) + (h ? `#${h}` : "") || "#"
    const frame = (id, alt) => {
      if (!size.has(id)) size.set(id, webpSize(readFileSync(join(shots, `${id}.webp`))))
      const [w, h] = size.get(id)
      const src = `${up}shots/${id}.webp`
      return `<a class="shot" href="${src}"><img src="${src}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async"></a>`
    }
    const menu = pages
      .map((p) => {
        const current = p === page
        const label = p.name === HOME ? "Оглавление" : p.title
        const sub =
          current && !home && p.headings.length
            ? `<ul class="sub">${p.headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}</ul>`
            : ""
        return `<li><a class="sec" href="${hrefOf(p.name)}"${current ? ' aria-current="page"' : ""}>${esc(label)}</a>${sub}</li>`
      })
      .join("\n")
    const prev = pages[n - 1]
    const next = pages[n + 1]
    const card = (p, cls, word) =>
      p ? `<a class="${cls}" href="${hrefOf(p.name)}"><span>${word}</span><strong>${esc(p.name === HOME ? "Оглавление" : p.title)}</strong></a>` : ""
    const html =
      head(home ? TITLE : `${page.title} — ${TITLE}`, `<link rel="stylesheet" href="${up}help.css">`) +
      `<body>\n<header class="bar"><a class="bar-title" href="${hrefOf(HOME)}">${TITLE}</a>` +
      `<a class="bar-menu" href="#razdely" aria-controls="razdely" aria-expanded="false">Разделы</a></header>\n` +
      `<nav id="razdely" class="nav" aria-label="Разделы справки">\n<div class="nav-head"><a class="nav-title" href="${hrefOf(HOME)}">${TITLE}</a>` +
      `<a class="nav-close" href="#" aria-label="Закрыть разделы">×</a></div>\n<ol>\n${menu}\n</ol>\n</nav>\n` +
      `<main class="doc"><div class="text">\n${render(page.md, { link, frame, id: (a) => a })}\n` +
      `<nav class="pager" aria-label="Соседние разделы">${card(prev, "prev", "← Предыдущий")}${card(next, "next", "Следующий →")}</nav>\n` +
      `</div></main>\n<script src="${up}help.js"></script>\n</body>\n</html>\n`
    const dir = home ? site : join(site, page.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "index.html"), html)
  })
  console.log(`справка: страниц ${pages.length}, кадров ${size.size} → ${site}`)
}

if (args.html) {
  const frame = (id, alt) => {
    const data = readFileSync(join(shots, `${id}.webp`))
    const [w, h] = webpSize(data)
    return `<img class="shot" src="data:image/webp;base64,${data.toString("base64")}" alt="${esc(alt)}" width="${w}" height="${h}">`
  }
  const toc = pages
    .filter((p) => p.name !== HOME)
    .map(
      (p) =>
        `<li><a href="#${p.name}">${esc(p.title.replace(/^\d+\.\s*/, ""))}</a><ul>${p.headings
          .filter((h) => h.level === 2)
          .map((h) => `<li><a href="#${p.name}-${h.id}">${esc(h.text)}</a></li>`)
          .join("")}</ul></li>`
    )
    .join("\n")
  const body = pages
    .map((p) => {
      const link = (to, h) => `#${to === HOME ? "oglavlenie" : to}${h ? `-${h}` : ""}`
      const html = render(p.md, { link, frame, id: (a) => `${p.name}-${a}` })
      // The table of contents goes right under the title of the first page, at the top of the file.
      return p.name === HOME
        ? `<section id="${p.name}">\n${html.replace("</h1>", `</h1>\n<nav class="toc" id="oglavlenie" aria-label="Оглавление"><h2>Оглавление</h2><ol>\n${toc}\n</ol></nav>`)}\n</section>`
        : `<section id="${p.name}">\n${html}\n<p class="up"><a href="#oglavlenie">↑ К оглавлению</a></p>\n</section>`
    })
    .join("\n<hr>\n")
  writeFileSync(
    args.html,
    head(`Панель магазина: как работать`, `<style>${CSS}</style>`) + `<body class="one">\n<main class="doc">\n${body}\n</main>\n<script>${JS}</script>\n</body>\n</html>\n`
  )
  console.log(`один файл: ${args.html}`)
}
