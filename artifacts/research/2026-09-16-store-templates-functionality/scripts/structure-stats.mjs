/**
 * §3 отчёта: структура шаблонов в ЧИСЛАХ, а не на глаз.
 * Считаем по уже загруженным экстрактам: сколько разделов у демо-магазина,
 * сколько функций на шаблон и как функции распределены по категориям.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const features = JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8"))

// --- 1. разделы демо-магазинов InSales (по внутренним ссылкам главной) ---
const KINDS = [
  ["категории", /\/collection\/[a-z0-9-]+\/?$/],
  ["товары", /\/product\/[a-z0-9-]+\/?$/],
  ["инфо-страницы", /\/page\/[a-z0-9-]+\/?$/],
  ["записи блога", /\/blogs\/[a-z0-9-]+\/[a-z0-9-]+\/?$/],
  ["корзина", /\/cart_items?\/?$/],
  ["кабинет", /client_account/],
]
const demos = []
// только ГЛАВНЫЕ демо-магазинов: подстраницы (-collection, -product, -cart…) не шаблоны
const SUBPAGE = /-(collection|product|cart|blog|account|page-payment|compare)\.md$/
for (const f of readdirSync(`${ROOT}/raw/insales`).filter((x) => x.startsWith("demo-") && x.endsWith(".md") && !SUBPAGE.test(x))) {
  const txt = readFileSync(`${ROOT}/raw/insales/${f}`, "utf8")
  const links = [...txt.matchAll(/^- .*? → (https?:\/\/\S+)$/gm)].map((m) => { try { return new URL(m[1]).pathname } catch { return "" } })
  const row = { demo: f.replace(/^demo-|\.md$/g, ""), links: links.length }
  for (const [name, re] of KINDS) row[name] = links.filter((p) => re.test(p)).length
  demos.push(row)
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

// --- 2. функции на шаблон: считаем по ВОЗВРАТАМ, ключ — имя шаблона, а не URL страницы
const perTemplate = { insales: new Map(), tilda: new Map() }
for (const gf of readdirSync(`${ROOT}/extract`).filter((x) => /^(insales|tilda)-\d+\.json$/.test(x))) {
  for (const t of JSON.parse(readFileSync(`${ROOT}/extract/${gf}`, "utf8")).templates || []) {
    const bag = perTemplate[t.source === "tilda" ? "tilda" : "insales"]
    const key = t.template_url || t.template   // у Tilda четыре шаблона зовутся «Онлайн-магазин»
    bag.set(key, (bag.get(key) || 0) + (t.features || []).length)
  }
}

const catCoverage = {}
for (const r of features) {
  catCoverage[r.category] ||= { insales: 0, tilda: 0, features: 0 }
  catCoverage[r.category].features++
  if (r.insales.count) catCoverage[r.category].insales++
  if (r.tilda.count) catCoverage[r.category].tilda++
}

const out = {
  measuredAt: new Date().toISOString(),
  insalesDemoSections: {
    demos: demos.length,
    median: Object.fromEntries(KINDS.map(([n]) => [n, med(demos.map((d) => d[n]))])),
    max: Object.fromEntries(KINDS.map(([n]) => [n, Math.max(...demos.map((d) => d[n]))])),
    rows: demos,
  },
  featuresPerTemplate: {
    insales: { templates: perTemplate.insales.size, median: med([...perTemplate.insales.values()]), min: Math.min(...perTemplate.insales.values()), max: Math.max(...perTemplate.insales.values()) },
    tilda: { templates: perTemplate.tilda.size, median: med([...perTemplate.tilda.values()]), min: Math.min(...perTemplate.tilda.values()), max: Math.max(...perTemplate.tilda.values()) },
  },
  categoryCoverage: catCoverage,
}
writeFileSync(`${ROOT}/structure.json`, JSON.stringify(out, null, 1))

console.log(`Демо InSales: ${demos.length}. Медиана на демо — категорий ${out.insalesDemoSections.median["категории"]}, инфо-страниц ${out.insalesDemoSections.median["инфо-страницы"]}, записей блога ${out.insalesDemoSections.median["записи блога"]}`)
console.log(`Функций на шаблон: InSales медиана ${out.featuresPerTemplate.insales.median} (${out.featuresPerTemplate.insales.min}–${out.featuresPerTemplate.insales.max}) на ${out.featuresPerTemplate.insales.templates} шаблонах; Tilda медиана ${out.featuresPerTemplate.tilda.median} (${out.featuresPerTemplate.tilda.min}–${out.featuresPerTemplate.tilda.max}) на ${out.featuresPerTemplate.tilda.templates}`)
console.log("категория | функций в реестре | у InSales | у Tilda")
for (const [k, v] of Object.entries(catCoverage).sort((a, b) => b[1].features - a[1].features))
  console.log(`  ${k.padEnd(20)} ${String(v.features).padStart(2)} | ${String(v.insales).padStart(2)} | ${String(v.tilda).padStart(2)}`)
