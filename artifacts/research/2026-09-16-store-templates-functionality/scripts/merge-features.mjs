/**
 * Сведение возвратов сабагентов в features.json.
 *
 * Правило: id функций агенты придумывают каждый по-своему (220 уникальных на 292 строки),
 * поэтому КАНОН пишет оркестратор (canon-features.json), а сопоставление делает КОД —
 * по регуляркам на «id + название». Строка, не легшая ни в один канон, не исчезает молча:
 * она попадает в features-unmapped.json и в вывод (родня правила 20a «НОЛЬ — это не пусто»).
 *
 * Колонка upready_store берётся из upready-map.json — это ЗАМЕР по нашему коду и живой
 * витрине, а не память; канон без записи в карте отмечается как "нет данных" и виден в выводе.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const read = (p) => JSON.parse(readFileSync(p, "utf8"))

const canon = read(`${ROOT}/canon-features.json`)
const upreadyMap = existsSync(`${ROOT}/upready-map.json`) ? read(`${ROOT}/upready-map.json`) : {}
const validation = existsSync(`${ROOT}/extract/validation.json`) ? read(`${ROOT}/extract/validation.json`) : { problems: [] }

// какие строки НЕ подтвердились файлом — помечаем, в улики первой очереди не берём
const unverified = new Set(validation.problems.filter((p) => p.kind === "улика не найдена в файле")
  .map((p) => `${p.template}|${String(p.detail).split(" | ")[0]}`))

const compiled = canon.map((c) => ({ ...c, res: c.match.map((m) => new RegExp(m, "i")) }))
const rows = new Map()   // canonId → агрегат
const unmapped = []
let total = 0

for (const gf of readdirSync(`${ROOT}/extract`).filter((f) => /^(insales|tilda)-\d+\.json$/.test(f))) {
  const data = read(`${ROOT}/extract/${gf}`)
  for (const t of data.templates || []) {
    for (const f of t.features || []) {
      total++
      // два прохода: сперва по АНГЛИЙСКОМУ id (он описателен и почти не пересекается),
      // и лишь то, что не легло, — по русскому названию (там шум: «в карточке товара»
      // стоит в названии вкладок, «в наличии» — в названии фильтра)
      const hit = compiled.find((c) => c.res.some((re) => re.test(f.id)))
        || compiled.find((c) => c.res.some((re) => re.test(f.name_ru)))
      if (!hit) { unmapped.push({ group: gf, template: t.template, source: t.source, id: f.id, name_ru: f.name_ru, category: f.category, page_url: f.page_url, evidence: f.evidence }); continue }
      if (!rows.has(hit.id)) rows.set(hit.id, { insales: new Map(), tilda: new Map(), evidence: [], rawIds: new Set() })
      const agg = rows.get(hit.id)
      agg.rawIds.add(f.id)
      const bucket = t.source === "tilda" ? agg.tilda : agg.insales
      if (!bucket.has(t.template)) bucket.set(t.template, f.page_url)
      const verified = !unverified.has(`${t.template}|${f.id}`)
      agg.evidence.push({ template: t.template, source: t.source, quote: f.evidence, page_url: f.page_url, verified })
    }
  }
}

const out = []
for (const c of canon) {
  const agg = rows.get(c.id) || { insales: new Map(), tilda: new Map(), evidence: [], rawIds: new Set() }
  const m = upreadyMap[c.id] || {}
  const ev = [...agg.evidence].sort((a, b) => Number(b.verified) - Number(a.verified)).slice(0, 3)
  out.push({
    id: c.id,
    name_ru: c.name_ru,
    name_en: c.name_en,
    category: c.category,
    insales: { count: agg.insales.size, templates: [...agg.insales.values()] },
    tilda: { count: agg.tilda.size, templates: [...agg.tilda.values()] },
    upready_store: m.upready_store || "нет данных",
    upready_where: m.upready_where || "",
    backend_needed: m.backend_needed === undefined ? null : m.backend_needed,
    backend_what: m.backend_what || "",
    priority: m.priority || "later",
    note: m.note || "",
    evidence: ev,
  })
}
out.sort((a, b) => (b.insales.count + b.tilda.count) - (a.insales.count + a.tilda.count) || a.category.localeCompare(b.category))

writeFileSync(`${ROOT}/features.json`, JSON.stringify(out, null, 1))
writeFileSync(`${ROOT}/features-unmapped.json`, JSON.stringify(unmapped, null, 1))

const noData = out.filter((r) => r.upready_store === "нет данных")
const noEvidence = out.filter((r) => !r.evidence.length)
console.log(`строк-возвратов: ${total}; канон: ${canon.length}; строк в features.json: ${out.length}`)
console.log(`не легло в канон: ${unmapped.length} (features-unmapped.json)`)
console.log(`канонов без единой улики: ${noEvidence.length}${noEvidence.length ? " → " + noEvidence.map((r) => r.id).join(", ") : ""}`)
console.log(`канонов без замера по нам: ${noData.length}${noData.length ? " → " + noData.map((r) => r.id).join(", ") : ""}`)
console.log(`есть у InSales: ${out.filter((r) => r.insales.count).length}, есть у Tilda: ${out.filter((r) => r.tilda.count).length}`)
