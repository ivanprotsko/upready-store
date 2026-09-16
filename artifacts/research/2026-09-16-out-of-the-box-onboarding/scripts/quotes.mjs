/**
 * Выборка контекстных окон вокруг ключевых слов из raw/ — модель читает окна, не страницы.
 * Запуск: node scripts/quotes.mjs <service|all> <regex> [--win 260] [--max 12]
 * Печатает: raw/<service>/<slug>.md : строка : фрагмент
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const [svc, pattern, ...rest] = process.argv.slice(2)
if (!pattern) { console.error("usage: node quotes.mjs <service|all> <regex> [--win N] [--max N]"); process.exit(2) }
const win = Number(rest[rest.indexOf("--win") + 1]) || 260
const max = Number(rest[rest.indexOf("--max") + 1]) || 12
const re = new RegExp(pattern, "gi")

const services = svc === "all" ? readdirSync(`${ROOT}/raw`) : [svc]
let n = 0
for (const s of services) {
  let files
  try { files = readdirSync(`${ROOT}/raw/${s}`).filter((f) => f.endsWith(".md")) } catch { continue }
  for (const f of files) {
    const text = readFileSync(`${ROOT}/raw/${s}/${f}`, "utf8")
    const body = text.slice(Math.max(0, text.indexOf("## Текст страницы")))
    const seen = new Set()
    re.lastIndex = 0
    let m
    while ((m = re.exec(body)) && n < max) {
      const from = Math.max(0, m.index - Math.floor(win / 3))
      const frag = body.slice(from, from + win).replace(/\s+/g, " ").trim()
      const key = frag.slice(0, 60)
      if (seen.has(key)) continue
      seen.add(key)
      const line = body.slice(0, m.index).split("\n").length
      console.log(`--- ${s}/${f}:${line}\n${frag}\n`)
      n++
    }
    if (n >= max) break
  }
  if (n >= max) break
}
if (!n) console.log("(совпадений нет)")
