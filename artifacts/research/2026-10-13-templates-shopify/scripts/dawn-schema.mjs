// Extract {% schema %} from every Dawn section + page template order. Usage: node dawn-schema.mjs <dawnDir> <out.json>
import fs from "node:fs"; import path from "node:path"
const [dir, out] = process.argv.slice(2)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "")
const loc = JSON.parse(strip(fs.readFileSync(path.join(dir, "locales/en.default.schema.json"), "utf8")))
const t = (v) => { if (typeof v !== "string" || !v.startsWith("t:")) return v; return v.slice(2).split(".").reduce((o, k) => o?.[k], loc) ?? v }
const sections = {}
for (const f of fs.readdirSync(path.join(dir, "sections")).filter((f) => f.endsWith(".liquid"))) {
  const src = fs.readFileSync(path.join(dir, "sections", f), "utf8")
  const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/)
  if (!m) continue
  const s = JSON.parse(m[1])
  sections[f.replace(".liquid", "")] = {
    name: t(s.name), tag: s.tag, class: s.class,
    settings: (s.settings || []).filter((x) => x.id).map((x) => ({ name: x.id, type: x.type, label: t(x.label) })),
    blocks: (s.blocks || []).map((b) => ({ type: b.type, name: t(b.name), limit: b.limit, settings: (b.settings || []).filter((x) => x.id).map((x) => ({ name: x.id, type: x.type })) })),
    presets: (s.presets || []).map((p) => t(p.name)),
    enabled_on: s.enabled_on, disabled_on: s.disabled_on, max_blocks: s.max_blocks,
  }
}
const pages = {}
for (const f of ["index.json", "product.json", "collection.json"]) {
  const j = JSON.parse(strip(fs.readFileSync(path.join(dir, "templates", f), "utf8")))
  pages[f.replace(".json", "")] = j.order.map((id) => ({ id, type: j.sections[id].type, blocks: Object.values(j.sections[id].blocks || {}).map((b) => b.type) }))
}
const groups = {}
for (const f of ["header-group.json", "footer-group.json"]) {
  const j = JSON.parse(strip(fs.readFileSync(path.join(dir, "sections", f), "utf8")))
  groups[f] = j.order.map((id) => j.sections[id].type)
}
fs.writeFileSync(out, JSON.stringify({ sections, pages, groups }, null, 1))
console.log(Object.keys(sections).length, "sections;", JSON.stringify(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, v.map((x) => x.type)]))), JSON.stringify(groups))
