/**
 * Перенос СОХРАНЁННЫХ копий первоисточников прошлых задач в raw/ этого исследования.
 * Источники cdek.ru и pochta.ru закрыты для этой машины (замер в report.md), поэтому
 * цитаты берутся из копий, снятых 2026-08-31 задачами T02a/T03 пайплайна robokassa-moderation.
 * Заголовок приводится к формату fetch.mjs, происхождение указывается явно (правило 42c).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const SRC = "/Users/ivanprotsko/upready/docs/research/raw"

const MAP = [
  ["2026-08-31-delivery-partners-risk/source-1-cdek-reglament-10-07-2026.md", "cdek/reglament-kurerskih-uslug"],
  ["2026-08-31-delivery-partners-risk/source-4-cdek-dogovor-internet-magazin.md", "cdek/dogovor-internet-magazin"],
  ["2026-08-31-delivery-partners-risk/source-5-cdek-documents-index.md", "cdek/documents-index"],
  ["2026-08-31-robokassa-requirements/source-1-robokassa-trebovaniya-dlya-podklyucheniya.md", "robokassa/trebovaniya-dlya-podklyucheniya"],
]

for (const [rel, out] of MAP) {
  const p = `${SRC}/${rel}`
  if (!existsSync(p)) { console.log(`[нет исходника] ${p}`); continue }
  const t = readFileSync(p, "utf8")
  const url = (t.match(/^#\s*Source\s*\n(\S+)/m) || t.match(/^#\s*Source:\s*(\S+)/m) || [])[1] || "(url не указан)"
  const fetched = (t.match(/^#\s*Fetched\s*\n(\S+)/m) || t.match(/^#\s*Fetched:\s*(\S+)/m) || [])[1] || "(дата не указана)"
  const bodyAt = t.search(/^#\s*(Текст|Содержание|Extract|Body)/m)
  const body = bodyAt > 0 ? t.slice(bodyAt) : t.replace(/^#\s*(Source|Fetched|Topic|HTTP)[\s\S]*?\n\n/g, "")
  const head = [
    `# Source: ${url}`,
    `# Fetched: ${fetched}`,
    `# Topic: out-of-the-box-onboarding`,
    `# HTTP: 200 (сохранённая копия)`,
    `# Provenance: копия снята задачей пайплайна robokassa-moderation 2026-08-31, перенесена сюда из ${SRC}/${rel}; живой хост для этой машины закрыт (см. report.md, раздел «Что не удалось загрузить»)`,
    "", "## Текст документа", "",
  ].join("\n")
  const outPath = `${ROOT}/raw/${out}.md`
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, head + body)
  console.log(`[ok] ${out}.md ← ${rel} (${body.length} симв, снят ${fetched})`)
}
