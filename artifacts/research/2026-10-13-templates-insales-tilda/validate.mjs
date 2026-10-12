// Acceptance check for this folder: node validate.mjs (exit 1, every problem printed). Same rules as the Shopify line's
// validate.mjs, for two sources: the JSON parses; every sections.json row has the agreed fields and evidence; every
// map.json section exists in sections.json and the other way round; every theme page lists only known sections; every
// role is in roles.json; 6-8 home pages per source at 1280 and 360; a crop for each of the 15 most frequent visible sections.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))
const problems = []
const load = (f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
  } catch (e) {
    problems.push(`${f}: ${e.message}`)
    return []
  }
}
const sections = load("sections.json")
const themes = load("themes.json")
const map = load("map.json")
const roles = load("roles.json")
for (const f of ["signals.json", "sources.json", "from-2026-09-16/features.json", "from-2026-09-16/tilda-index.json", "from-2026-09-16/upready-map.json"]) load(f)

const known = new Set(sections.map((s) => s.section))
const seen = new Set()
for (const s of sections) {
  for (const k of ["source", "section", "roles", "settings", "blocks", "themes", "frequency", "evidence"]) if (!(k in s)) problems.push(`sections.json ${s.section}: no ${k}`)
  if (!["insales", "tilda"].includes(s.source)) problems.push(`sections.json ${s.section}: source ${s.source}`)
  if (seen.has(s.source + "|" + s.section)) problems.push(`sections.json ${s.source} ${s.section}: duplicate row`)
  seen.add(s.source + "|" + s.section)
  if (!s.evidence?.length || s.evidence.some((e) => !e.url || !e.note)) problems.push(`sections.json ${s.section}: evidence missing or without url/note`)
  if (s.frequency !== s.themes.length) problems.push(`sections.json ${s.section}: frequency ${s.frequency} != ${s.themes.length} themes`)
  if (s.settings.some((x) => !x.name || !x.type)) problems.push(`sections.json ${s.section}: a setting without name/type`)
}
for (const m of map) {
  if (!known.has(m.section)) problems.push(`map.json ${m.section}: not in sections.json`)
  if (!m.ours || !m.gap || !/^P[123]$/.test(m.priority)) problems.push(`map.json ${m.section}: ours/gap/priority incomplete`)
  if (Object.keys(m).join() !== "section,ours,gap,priority") problems.push(`map.json ${m.section}: fields ${Object.keys(m).join()}`)
}
for (const s of known) if (!map.find((m) => m.section === s)) problems.push(`sections.json ${s}: no map.json row`)
for (const t of themes) {
  if (Object.keys(t).join() !== "theme,price,pages,styles,notable") problems.push(`themes.json ${t.theme}: fields ${Object.keys(t).join()}`)
  for (const [page, list] of Object.entries(t.pages)) for (const s of list || []) if (!known.has(s)) problems.push(`themes.json ${t.theme} ${page}: unknown section ${s}`)
}
const roleSet = new Set(roles.map((r) => r.role))
for (const s of sections) for (const r of s.roles) if (!roleSet.has(r)) problems.push(`sections.json ${s.section}: role ${r} not in roles.json`)

const homeShots = fs.readdirSync(path.join(dir, "shots/home"))
for (const src of ["insales", "tilda"]) {
  const shops = new Set(homeShots.filter((f) => f.startsWith(src + "-")).map((f) => f.replace(/-(1280|360)\.jpg$/, "")))
  for (const t of shops) for (const w of [1280, 360]) if (!homeShots.includes(`${t}-${w}.jpg`)) problems.push(`shots/home: ${t}-${w}.jpg missing`)
  if (shops.size < 6 || shops.size > 8) problems.push(`shots/home: ${shops.size} ${src} home pages, 6-8 expected`)
}
// Overlays and bars that are hidden or 0 px high at 1280 cannot be cropped; they are left out of the top-15 rule.
const HIDDEN = new Set(["callback", "preorder", "cart-notification", "cart-drawer", "wishlist", "back-to-top", "bottom-nav", "popup"])
const crops = fs.readdirSync(path.join(dir, "shots/sections"))
const freq = {}
for (const s of sections) freq[s.section] = (freq[s.section] || 0) + s.frequency
const top15 = Object.entries(freq).filter(([s]) => !HIDDEN.has(s)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([s]) => s)
for (const s of top15) if (!crops.some((f) => f.replace(/^\d+-/, "").startsWith(s + "--"))) problems.push(`shots/sections: no crop for top-15 section ${s}`)
for (const f of [...homeShots.map((f) => "shots/home/" + f), ...crops.map((f) => "shots/sections/" + f)])
  if (fs.statSync(path.join(dir, f)).size < 2000) problems.push(`${f}: under 2 KB, likely blank`)

if (problems.length) {
  for (const p of problems) console.log("✗", p)
  process.exit(1)
}
const n = (src) => sections.filter((s) => s.source === src).length
console.log(`✓ ${sections.length} section rows (insales ${n("insales")}, tilda ${n("tilda")}) with evidence, ${map.length} map rows all in sections.json, ${themes.length} themes, ${roles.length} roles, ${homeShots.length / 2} home pages × 2 widths, ${crops.length} section crops (top 15 visible covered)`)
