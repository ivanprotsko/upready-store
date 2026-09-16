/**
 * Гейт на возврат сабагентов (правило 25h: схема-валидный ≠ настоящий).
 * Проверяем не отчёт агента, а ДАННЫЕ: цитата-улика обязана буквально встречаться
 * в том файле, чей `# Source:` совпадает с page_url строки.
 *
 * node scripts/validate-extract.mjs   → отчёт + extract/validation.json, rc=1 если есть брак
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const CATS = new Set(["navigation", "catalog-listing", "filters-search", "product-page", "cart-checkout",
  "promo-marketing", "content", "trust-reviews", "account", "b2b-wholesale", "integrations", "seo-perf", "admin-customization"])

// индекс: URL источника → {текст файла, сигналы, имя файла}
const bySource = new Map()
for (const src of ["insales", "tilda"]) {
  const dir = `${ROOT}/raw/${src}`
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const txt = readFileSync(`${dir}/${f}`, "utf8")
    const url = (txt.match(/^# Source: (\S+)/m) || [])[1]
    if (!url) continue
    const sig = (txt.match(/## Сигналы[^\n]*\n([^\n]*)/) || [])[1] || ""
    const key = url.replace(/\/$/, "")
    bySource.set(key, { file: `${src}/${f}`, txt, norm: norm(txt), signals: sig.split(/,\s*/).map((s) => s.trim()) })
  }
}
function norm(s) {
  return s.toLowerCase().replace(/[«»"'`„“”‘’]/g, '"').replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim()
}

const problems = []
const stats = { groups: 0, templates: 0, features: 0, evidenceOk: 0, evidenceFail: 0 }
const groups = readdirSync(`${ROOT}/extract`).filter((f) => /^(insales|tilda)-\d+\.json$/.test(f))
for (const gf of groups) {
  stats.groups++
  let data
  try { data = JSON.parse(readFileSync(`${ROOT}/extract/${gf}`, "utf8")) }
  catch (e) { problems.push({ group: gf, kind: "нечитаемый JSON", detail: String(e.message) }); continue }
  const templates = data.templates || []
  if (!templates.length) { problems.push({ group: gf, kind: "нет шаблонов" }); continue }
  for (const t of templates) {
    stats.templates++
    const fs = t.features || []
    if (fs.length < 3) problems.push({ group: gf, template: t.template, kind: "меньше 3 функций", detail: String(fs.length) })
    for (const f of fs) {
      stats.features++
      if (!CATS.has(f.category)) problems.push({ group: gf, template: t.template, kind: "чужая категория", detail: `${f.id}: ${f.category}` })
      if (!f.evidence || !f.page_url) { problems.push({ group: gf, template: t.template, kind: "пустая улика", detail: f.id }); stats.evidenceFail++; continue }
      const page = bySource.get(String(f.page_url).replace(/\/$/, ""))
      if (!page) { problems.push({ group: gf, template: t.template, kind: "page_url не из наших файлов", detail: `${f.id}: ${f.page_url}` }); stats.evidenceFail++; continue }
      const ev = String(f.evidence).trim()
      let ok
      const sigMatch = ev.match(/^сигнал[ыа]?\s*:\s*(.+)$/i)
      if (sigMatch) {
        ok = sigMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean).every((s) => page.signals.includes(s) || page.norm.includes(norm(s)))
      } else {
        // агенты склеивают подряд идущие строки экстракта разделителем " / " —
        // проверяем КАЖДЫЙ фрагмент и порядок их следования в файле
        const parts = ev.split(/\s\/\s|\n/).map((x) => norm(x)).filter((x) => x.length >= 4)
        if (parts.length > 1) {
          let at = 0
          ok = parts.every((pt) => { const i = page.norm.indexOf(pt.slice(0, 60), at); if (i < 0) return false; at = i; return true })
        } else {
          const probe = (parts[0] || norm(ev)).slice(0, 60)
          ok = probe.length >= 6 && page.norm.includes(probe)
        }
      }
      if (ok) stats.evidenceOk++
      else { stats.evidenceFail++; problems.push({ group: gf, template: t.template, kind: "улика не найдена в файле", detail: `${f.id} | ${page.file} | ${ev.slice(0, 90)}` }) }
    }
  }
}
const byKind = {}
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1
writeFileSync(`${ROOT}/extract/validation.json`, JSON.stringify({ checkedAt: new Date().toISOString(), stats, byKind, problems }, null, 1))
console.log(`групп ${stats.groups}, шаблонов ${stats.templates}, функций ${stats.features}`)
console.log(`улика подтверждена в файле: ${stats.evidenceOk}, не подтверждена: ${stats.evidenceFail}`)
console.log(`брак по видам: ${JSON.stringify(byKind, null, 0)}`)
for (const p of problems.slice(0, 25)) console.log(` - [${p.kind}] ${p.group} ${p.template || ""} ${p.detail || ""}`)
if (problems.length > 25) console.log(` … ещё ${problems.length - 25}, полный список в extract/validation.json`)
process.exit(problems.length ? 1 : 0)
