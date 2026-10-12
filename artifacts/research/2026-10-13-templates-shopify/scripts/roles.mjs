// Write roles.json: every role used in sections.json, marked as the registry analyser's own word or a commerce extension.
// Usage: node roles.mjs <sections.json> <analyzer-summary.json> <tier2-role-taxonomy.md> <out roles.json>
import fs from "node:fs"; import { EXT_ROLES } from "./catalog.mjs"
const [secF, sumF, taxF, out] = process.argv.slice(2)
const sections = JSON.parse(fs.readFileSync(secF, "utf8"))
const dist = JSON.parse(fs.readFileSync(sumF, "utf8")).stats.roles_distribution
const tax = fs.readFileSync(taxF, "utf8")
const used = new Map(); for (const s of sections) for (const r of s.roles) used.set(r, [...(used.get(r) || []), s.section])
const rows = [...used].map(([role, secs]) => ({
  role,
  from: EXT_ROLES[role] ? "extension" : "analyser",
  analyserNodes: dist[role] ?? null,
  inTaxonomy: new RegExp("`" + role + "`").test(tax),
  note: EXT_ROLES[role] || null,
  sections: secs,
})).sort((a, b) => (a.from === b.from ? b.sections.length - a.sections.length : a.from === "analyser" ? -1 : 1))
for (const r of rows) if (r.from === "analyser" && r.analyserNodes == null && !r.inTaxonomy) throw new Error("role not in the analyser vocabulary: " + r.role)
fs.writeFileSync(out, JSON.stringify(rows, null, 1) + "\n")
console.log(rows.filter((r) => r.from === "analyser").length, "analyser roles,", rows.filter((r) => r.from === "extension").length, "extensions")
