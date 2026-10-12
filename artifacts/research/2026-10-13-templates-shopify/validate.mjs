// Acceptance check for this folder: node validate.mjs (exit 1 on the first broken rule, every problem printed).
// The JSON parses; every sections.json row has the agreed fields and evidence; every map.json section exists in
// sections.json and the other way round; every theme page lists only known sections; every role is in roles.json;
// the shots exist (8 home pages at 1280 and 360, a crop for each of the 15 most frequent sections).
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

const known = new Set(sections.map((s) => s.section))
for (const s of sections) {
  for (const k of ["source", "section", "roles", "settings", "blocks", "themes", "frequency", "evidence"])
    if (!(k in s)) problems.push(`sections.json ${s.section}: no ${k}`)
  if (s.source !== "shopify") problems.push(`sections.json ${s.section}: source ${s.source}`)
  if (!s.evidence?.length || s.evidence.some((e) => !e.url || !e.note)) problems.push(`sections.json ${s.section}: evidence missing or without url/note`)
  if (s.frequency !== s.themes.length) problems.push(`sections.json ${s.section}: frequency ${s.frequency} != ${s.themes.length} themes`)
  if (s.settings.some((x) => !x.name || !x.type)) problems.push(`sections.json ${s.section}: a setting without name/type`)
}
for (const m of map) {
  if (!known.has(m.section)) problems.push(`map.json ${m.section}: not in sections.json`)
  if (!m.ours || !m.gap || !/^P[123]$/.test(m.priority)) problems.push(`map.json ${m.section}: ours/gap/priority incomplete`)
}
for (const s of sections) if (!map.find((m) => m.section === s.section)) problems.push(`sections.json ${s.section}: no map.json row`)
for (const t of themes) {
  for (const k of ["theme", "price", "pages", "styles", "notable"]) if (!(k in t)) problems.push(`themes.json ${t.theme}: no ${k}`)
  for (const [page, list] of Object.entries(t.pages)) for (const s of list || []) if (!known.has(s)) problems.push(`themes.json ${t.theme} ${page}: unknown section ${s}`)
}
const roleSet = new Set(roles.map((r) => r.role))
for (const s of sections) for (const r of s.roles) if (!roleSet.has(r)) problems.push(`sections.json ${s.section}: role ${r} not in roles.json`)

const homeShots = fs.readdirSync(path.join(dir, "shots/home"))
const homeThemes = new Set(homeShots.map((f) => f.replace(/-(1280|360)\.jpg$/, "")))
for (const t of homeThemes) for (const w of [1280, 360]) if (!homeShots.includes(`${t}-${w}.jpg`)) problems.push(`shots/home: ${t}-${w}.jpg missing`)
if (homeThemes.size < 6 || homeThemes.size > 8) problems.push(`shots/home: ${homeThemes.size} demo stores, 6-8 expected`)
const crops = fs.readdirSync(path.join(dir, "shots/sections"))
const top15 = [...sections].sort((a, b) => b.frequency - a.frequency).slice(0, 15).map((s) => s.section)
for (const s of top15) if (!crops.some((f) => f.replace(/^\d+-/, "").startsWith(s + "--"))) problems.push(`shots/sections: no crop for top-15 section ${s}`)
for (const f of [...homeShots.map((f) => "shots/home/" + f), ...crops.map((f) => "shots/sections/" + f)])
  if (fs.statSync(path.join(dir, f)).size < 2000) problems.push(`${f}: under 2 KB, likely blank (a thin announcement bar is ~4 KB)`)

if (problems.length) {
  for (const p of problems) console.log("✗", p)
  process.exit(1)
}
console.log(`✓ ${sections.length} sections with evidence, ${map.length} map rows all in sections.json, ${themes.length} themes, ${roles.length} roles, ${homeThemes.size} home pages × 2 widths, ${crops.length} section crops (top 15 covered)`)
