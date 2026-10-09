#!/usr/bin/env node
// Puts the guide together with its frames, in two forms:
//   --out <dir>    the pages as they are plus shots/<id>.png next to them (a folder to read or to host)
//   --html <file>  one HTML file with every page and every frame inside it, to send to the shop as is
//
//   node docs/owner-guide/publish.mjs --shots <dir with the PNG files> --out <dir> [--html <file>]
//
// Refuses when a page shows a frame that is not in --shots, so a published guide never has a hole.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { PAGES_DIR, imageRefs, parseArgs } from "./lib.mjs"

const args = parseArgs(process.argv.slice(2), { shots: "value", out: "value", html: "value" })
if (!args.shots || (!args.out && !args.html)) throw new Error("нужны --shots и --out или --html")

const pages = readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md")).sort()
const missing = imageRefs().filter(({ id }) => !existsSync(join(args.shots, `${id}.png`)))
if (missing.length) {
  for (const m of missing) console.error(`нет кадра ${m.id}.png (его показывает guide/${m.page})`)
  process.exit(1)
}

if (args.out) {
  mkdirSync(join(args.out, "shots"), { recursive: true })
  for (const page of pages) copyFileSync(join(PAGES_DIR, page), join(args.out, page))
  for (const id of new Set(imageRefs().map((r) => r.id))) copyFileSync(join(args.shots, `${id}.png`), join(args.out, "shots", `${id}.png`))
  console.log(`страниц ${pages.length}, кадров ${new Set(imageRefs().map((r) => r.id)).size} → ${args.out}`)
}

if (args.html) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const anchor = (page) => page.replace(/\.md$/, "")
  const inline = (s) =>
    esc(s)
      .replace(/!\[([^\]]*)\]\(shots\/([a-z0-9-]+)\.png\)/g, (_, alt, id) => {
        const data = readFileSync(join(args.shots, `${id}.png`)).toString("base64")
        return `<img alt="${alt}" src="data:image/png;base64,${data}">`
      })
      .replace(/\[([^\]]+)\]\(([0-9a-z-]+)\.md(#[^)]*)?\)/g, (_, t, p, h) => `<a href="${h ?? "#" + p}">${t}</a>`)
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
  const render = (md) => {
    const out = []
    const lines = md.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const h = line.match(/^(#{1,4}) (.*)$/)
      if (h) {
        // The id is the anchor GitHub gives a heading, so `07-nastrojki.md#оплата` lands here too.
        const id = h[2].toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/ /g, "-")
        out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`)
      } else if (line.startsWith("|")) {
        const rows = []
        while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++])
        i--
        const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r))
        out.push(
          "<table>" +
            body.map((r, n) => `<tr>${cells(r).map((c) => (n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("") +
            "</table>"
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
        out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
      } else if (line.trim()) {
        out.push(`<p>${inline(line)}</p>`)
      }
    }
    return out.join("\n")
  }
  const body = pages.map((p) => `<section id="${anchor(p)}">\n${render(readFileSync(join(PAGES_DIR, p), "utf8"))}\n</section>`).join("\n<hr>\n")
  const css = `body{font:16px/1.55 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;max-width:980px;margin:0 auto;padding:24px;color:#18181b}
img{max-width:100%;border:1px solid #e4e4e7;border-radius:8px;margin:8px 0 16px}table{border-collapse:collapse;margin:12px 0;width:100%}
th,td{border:1px solid #e4e4e7;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f4f4f5}code{background:#f4f4f5;padding:1px 4px;border-radius:4px}
blockquote{border-left:3px solid #a1a1aa;margin:12px 0;padding:4px 12px;color:#52525b}hr{border:0;border-top:1px solid #e4e4e7;margin:40px 0}h1{margin-top:8px}`
  writeFileSync(args.html, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Панель магазина: как работать</title><style>${css}</style></head><body>\n${body}\n</body></html>\n`)
  console.log(`один файл: ${args.html}`)
}
