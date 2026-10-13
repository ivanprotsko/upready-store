// Build sections.json, themes.json, sources.json from: theme store rows, Dawn schema, home DOM (browser) + product/collection HTML (plain GET).
// Usage: node build.mjs <work> <crawlDir> <pagesDir> <outDir>
import fs from "node:fs"; import path from "node:path"
import { CATALOG } from "./catalog.mjs"; import { sectionsOf } from "./classify.mjs"; import { resolve } from "./resolve.mjs"
import { OBSERVED } from "./observed.mjs"; import { MAP_ROWS } from "./map-rows.mjs"
const [work, crawlDir, pagesDir, out] = process.argv.slice(2)
const store = JSON.parse(fs.readFileSync(path.join(work, "themes-store.json"), "utf8"))
const dawn = JSON.parse(fs.readFileSync(path.join(work, "dawn-schema.json"), "utf8"))
const crawl = JSON.parse(fs.readFileSync(path.join(crawlDir, "crawl.json"), "utf8"))
const urls = JSON.parse(fs.readFileSync(path.join(pagesDir, "urls.json"), "utf8"))
const DAWN_SHA = fs.readFileSync(path.join(work, "dawn-sha.txt"), "utf8").trim()
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null)
const presetJunk = (t) => new Set([...t.presets.map((p) => p[0].toUpperCase() + p.slice(1)), "Presets", "Stores using this theme"])
const themes = [], sources = {}, seen = {}, unresolved = []
for (const t of store) {
  const pageHtml = { home: read(path.join(crawlDir, "dom", `${t.slug}-home.html`)), product: read(path.join(pagesDir, `${t.slug}-product.html`)), collection: read(path.join(pagesDir, `${t.slug}-collection.html`)) }
  const pageUrl = { home: crawl[t.slug]?.pages.home?.url, product: urls[t.slug]?.product, collection: urls[t.slug]?.collection }
  const pages = {}
  for (const [page, html] of Object.entries(pageHtml)) {
    if (!html) { pages[page] = null; continue }
    const list = []
    for (const s of sectionsOf(html, page)) {
      const r = resolve(t.slug, page, s); const c = r?.section
      if (c === "#excluded") continue
      if (!c) { unresolved.push({ slug: t.slug, page, key: s.key, hints: s.hints.map((x) => x.hint), wrap: s.wrap, h: s.h }); continue }
      list.push(c) // repeats kept: a theme stacking three image-with-text in a row is part of what a template is
      ;(seen[c] ??= []).push({ slug: t.slug, page, url: pageUrl[page], key: s.key, via: r.via, h: s.h })
    }
    pages[page] = list
  }
  const junk = presetJunk(t)
  const feats = [...new Set(Object.values(t.features).flat())].filter((f) => !junk.has(f) && !/ready-made designs/.test(f))
  const common = new Set(["Cart notes", "In-store pickups", "Quick buy", "Cross-selling", "FAQ page", "Color swatches", "High-resolution images", "Image galleries", "Image rollover", "Image zoom", "Product videos", "Slideshow", "Usage information", "Enhanced search", "Mega menu", "Product filtering and sorting", "Sticky header", "Recommended products"])
  themes.push({ theme: t.name, price: t.price, pages, styles: t.presets.map((p) => p[0].toUpperCase() + p.slice(1)), notable: [t.tagline, ...(t.by && t.by !== "Shopify" ? [`by ${t.by}`] : ["by Shopify; same code base as Dawn " + t.version]), ...feats.filter((f) => !common.has(f))] })
  sources[t.slug] = { theme: t.name, store: t.sourceUrl, version: t.version, demo: t.demo, pages: pageUrl }
}
const N = store.length
const sections = CATALOG.map((c) => {
  const hits = seen[c.section] || []; const th = [...new Set(hits.map((h) => h.slug))]
  const names = th.map((s) => store.find((x) => x.slug === s).name)
  const d = c.dawn && dawn.sections[c.dawn]
  const settings = d ? d.settings.map((x) => ({ name: x.name, type: x.type })) : (OBSERVED[c.section]?.settings || [])
  const blocks = d ? d.blocks.map((b) => b.type) : (OBSERVED[c.section]?.blocks || [])
  const evidence = []
  if (d) evidence.push({ url: `https://github.com/Shopify/dawn/blob/${DAWN_SHA}/sections/${c.dawn}.liquid`, note: `Dawn {% schema %} "${d.name}": ${d.settings.length} settings, blocks [${d.blocks.map((b) => b.type).join(", ") || "none"}]${d.presets.length ? ", addable from the editor" : ", fixed on its template"}` })
  const byTheme = new Map(); for (const h of hits) if (!byTheme.has(h.slug)) byTheme.set(h.slug, h)
  for (const h of [...byTheme.values()].slice(0, 6)) evidence.push({ url: h.url, note: `${store.find((x) => x.slug === h.slug).name}, ${h.page} page, section "${h.key}"${h.h ? `, heading «${h.h}»` : ""}; type from ${h.via}` })
  if (OBSERVED[c.section]?.evidence) evidence.push(...OBSERVED[c.section].evidence)
  return { source: "shopify", section: c.section, roles: c.roles, settings, blocks, themes: names, frequency: th.length, evidence }
}).filter((s) => s.frequency > 0 || CATALOG.find((c) => c.section === s.section).dawn).sort((a, b) => b.frequency - a.frequency)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "sections.json"), JSON.stringify(sections, null, 1) + "\n")
fs.writeFileSync(path.join(out, "themes.json"), JSON.stringify(themes, null, 1) + "\n")
const known = new Set(sections.map((s) => s.section))
for (const r of MAP_ROWS) if (!known.has(r.section)) throw new Error("map row without a sections.json row: " + r.section)
for (const s of sections) if (!MAP_ROWS.find((r) => r.section === s.section)) throw new Error("sections.json row without a map row: " + s.section)
const order = sections.map((s) => s.section)
fs.writeFileSync(path.join(out, "map.json"), JSON.stringify([...MAP_ROWS].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section)), null, 1) + "\n")
fs.writeFileSync(path.join(out, "sources.json"), JSON.stringify(sources, null, 1) + "\n")
console.log("themes", N, "sections", sections.length); for (const s of sections) console.log(String(s.frequency).padStart(2), s.section)
for (const u of unresolved) console.log("UNRESOLVED", JSON.stringify(u))
