/**
 * Третий гейт: каждая ссылка вида (R5) / (Y11, Y12) в тексте отчёта и наборов обязана вести
 * в существующее утверждение claims.json. Ссылка на воздух = утверждение без источника.
 * Запуск: node scripts/check-report-refs.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const known = new Set(JSON.parse(readFileSync(`${ROOT}/claims.json`, "utf8")).map((c) => c.id))
const files = ["report.md", "offer-clause-draft.md", ...readdirSync(`${ROOT}/kits`).map((f) => `kits/${f}`)]
const ID = /^(?:R|Y|C|P|YA|A)\d{1,2}$/
let refs = 0, dead = 0
for (const f of files) {
  const p = `${ROOT}/${f}`
  if (!existsSync(p)) continue
  const body = readFileSync(p, "utf8")
  const text = f === "report.md" ? body.slice(0, body.indexOf("<!-- ПРИЛОЖЕНИЕ-А") >>> 0 || body.length) : body
  for (const m of text.matchAll(/\(([^()]{1,60})\)/g)) {
    const parts = m[1].split(",").map((s) => s.trim())
    if (!parts.length || !parts.every((s) => ID.test(s))) continue
    for (const id of parts) { refs++; if (!known.has(id)) { dead++; console.log(`  БИТАЯ ССЫЛКА ${id} в ${f}`) } }
  }
}
console.log(`ссылок на цитаты в тексте: ${refs}, битых: ${dead}`)
process.exit(dead ? 1 : 0)
