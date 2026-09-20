/**
 * Загрузка PDF-первоисточников (оферты, агентские договоры) → текст в raw/<source>/<slug>.md
 * с тем же заголовком, что у fetch.mjs. Извлекатель — pdftotext (poppler), замерен на месте.
 * Вход: TSV без заголовка — source \t slug \t url.  Запуск: node scripts/fetch-pdf.mjs <queue.tsv>
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const UA = "upready-research/1.0 (+https://upready.dev)"
const TOPIC = "out-of-the-box-onboarding"
const TMP = process.env.TMPDIR || "/tmp"
const queueFile = process.argv[2]
if (!queueFile) { console.error("usage: node fetch-pdf.mjs <queue.tsv>"); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rows = readFileSync(queueFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => { const [source, slug, url] = l.split("\t"); return { source, slug, url } })

for (const [i, row] of rows.entries()) {
  const outPath = `${ROOT}/raw/${row.source}/${row.slug}.md`
  if (existsSync(outPath)) { console.log(`[skip] ${row.source}/${row.slug}`); continue }
  if (i > 0) await sleep(2500)
  const pdf = `${TMP}/ootb-${row.source}-${row.slug}.pdf`
  try {
    execFileSync("curl", ["-sS", "-L", "--fail", "--max-time", "40", "-A", UA, "-o", pdf, row.url])
  } catch (e) { console.log(`[fail] ${row.url}: ${String(e.message).slice(0, 120)}`); continue }
  let text = ""
  try { text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) }
  catch (e) { console.log(`[pdftotext fail] ${row.slug}: ${String(e.message).slice(0, 120)}`); continue }
  const head = [`# Source: ${row.url}`, `# Fetched: ${new Date().toISOString()}`, `# Topic: ${TOPIC}`, `# HTTP: 200 (pdftotext -layout)`, "", "## Текст документа", ""].join("\n")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, head + text)
  appendFileSync(`${ROOT}/fetch-log.jsonl`, JSON.stringify({ ts: new Date().toISOString(), via: "curl+pdftotext", source: row.source, slug: row.slug, url: row.url, status: 200, bytes: statSync(pdf).size, chars: text.length }) + "\n")
  console.log(`[ok] ${row.source}/${row.slug} ${statSync(pdf).size}B → ${text.length} симв`)
}
