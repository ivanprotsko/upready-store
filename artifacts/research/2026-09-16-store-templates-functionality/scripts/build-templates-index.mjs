/**
 * templates-index.tsv — единый индекс шаблонов обоих источников + сколько страниц
 * каждого шаблона реально загружено (улика покрытия, а не обещание).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "")
const rows = []

// --- InSales: 19 страниц тем ---
const insalesFiles = readdirSync(`${ROOT}/raw/insales`).filter((f) => f.startsWith("theme-"))
for (const f of insalesFiles) {
  const t = read(`${ROOT}/raw/insales/${f}`)
  const url = (t.match(/^# Source: (\S+)/m) || [])[1] || ""
  const body = t.slice(t.indexOf("## Текст страницы"))
  const category = ((body.match(/\nКатегория\n([^\n]+)/) || [])[1] || "").trim()
  const demo = ((body.match(/\[Смотреть пример\]\((https?:[^)]+)\)/) || body.match(/\[Посмотреть пример[^\]]*\]\((https?:[^)]+)\)/) || [])[1] || "").replace(/\/$/, "")
  const name = ((body.match(/\nШаблон интернет-магазина - ([^\n]+)\n/) || [])[1] || "").trim()
    || ((body.match(/\n([A-ZА-Я][\w .-]{1,24})\s*\n\s*– адаптивный/) || [])[1] || "").trim()
  const price = ((body.match(/\n(\d[\d  ]*₽)\n/) || [])[1] || "").trim()
  const host = demo ? new URL(demo + "/").host.split(".")[0] : ""
  const pages = host ? readdirSync(`${ROOT}/raw/insales`).filter((x) => x.startsWith(`demo-${host}`)).length : 0
  rows.push(["insales", name || f.replace(/^theme-|\.md$/g, ""), url, demo || "(нет демо)", category, price || "н/д", String(1 + pages), f])
}

// --- Tilda: из индекса галереи, берём типы, у которых загружено демо ---
const tilda = JSON.parse(read(`${ROOT}/tilda-index.json`) || '{"rows":[]}')
const tildaFetched = new Set(readdirSync(`${ROOT}/raw/tilda`).filter((f) => f.startsWith("demo-")).map((f) => f.replace(/^demo-|\.md$/g, "")))
for (const r of tilda.rows) {
  const slug = r.alias.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  if (!tildaFetched.has(slug)) continue
  rows.push(["tilda", r.name, r.url, r.demo, `${r.category} (type=${r.type})`, "в тарифе Tilda", "1", `demo-${slug}.md`])
}

const header = ["source", "template", "page_url", "demo_url", "category", "price", "pages_fetched", "raw_file"]
writeFileSync(`${ROOT}/templates-index.tsv`, [header, ...rows].map((r) => r.join("\t")).join("\n") + "\n")
console.log(`templates-index.tsv: ${rows.length} шаблонов (insales ${rows.filter((r) => r[0] === "insales").length}, tilda ${rows.filter((r) => r[0] === "tilda").length})`)
console.log(`Всего шаблонов в каталогах источников: insales 19 (страница /collection/themes), tilda ${tilda.total} из них type=st (магазины) ${tilda.counts?.st}`)
