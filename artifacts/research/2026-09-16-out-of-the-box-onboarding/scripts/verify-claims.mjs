/**
 * Гейт в КОДЕ (правило 47): утверждение без ДОСЛОВНОЙ цитаты, найденной в raw/, отбрасывается.
 * Сравнение — по нормализованному тексту (схлопнутые пробелы, NBSP/мягкий перенос/неразрывный дефис),
 * потому что извлечённый из HTML и PDF текст рвётся переносами, а смысл цитаты от этого не меняется.
 * Запуск: node scripts/verify-claims.mjs [claims.json]
 * Выход: 0 — все цитаты найдены; 1 — есть отброшенные (список печатается и пишется в claims-rejected.json)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const file = process.argv[2] || `${ROOT}/claims.json`
const norm = (s) => s.replace(/[  ]/g, " ").replace(/[­]/g, "").replace(/[‐‑‒–−]/g, "-").replace(/\s+/g, " ").trim()

const claims = JSON.parse(readFileSync(file, "utf8"))
const cache = new Map()
const ok = [], bad = []
for (const c of claims) {
  const p = `${ROOT}/${c.source}`
  if (!existsSync(p)) { bad.push({ ...c, reason: `нет файла ${c.source}` }); continue }
  // Сравниваем и с исходным текстом, и с текстом БЕЗ маркдаун-ссылок: «[слово](url)» — это
  // артефакт извлечения HTML, а не слова источника, и он рвёт фразу посередине.
  if (!cache.has(p)) {
    const raw = readFileSync(p, "utf8")
    cache.set(p, [norm(raw), norm(raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"))])
  }
  const [asIs, unlinked] = cache.get(p)
  const q = norm(c.quote)
  if (asIs.includes(q) || unlinked.includes(q)) ok.push(c)
  else bad.push({ ...c, reason: "цитата не найдена дословно в источнике" })
}
writeFileSync(`${ROOT}/claims-rejected.json`, JSON.stringify(bad, null, 2) + "\n")
console.log(`проверено ${claims.length}: подтверждено ${ok.length}, отброшено ${bad.length}`)
for (const b of bad) console.log(`  ОТБРОШЕНО ${b.id} [${b.service}] ${b.reason}\n    «${b.quote.slice(0, 90)}…»`)
const byQ = {}
for (const c of ok) { const k = `${c.service}/q${c.question}`; byQ[k] = (byQ[k] || 0) + 1 }
console.log("цитат на сервис×вопрос:", JSON.stringify(byQ, null, 0))
const thin = Object.entries(byQ).filter(([, n]) => n < 2)
if (thin.length) console.log("МЕНЬШЕ ДВУХ ЦИТАТ:", thin.map(([k]) => k).join(", "))
process.exit(bad.length ? 1 : 0)
