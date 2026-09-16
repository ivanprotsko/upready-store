/**
 * Очередь загрузки: последовательно, ОДИН запрос за раз, пауза >= 2 с, честный UA,
 * таймаут 20 с, потолок 80 страниц на источник, БЕЗ ретраев на 403/429/5xx и на
 * анти-бот странице (источник закрывается, работа идёт с тем, что есть).
 *
 * Вход:  TSV без заголовка — source \t slug \t url
 * Выход: raw/<source>/<slug>.md  +  fetch-log.jsonl (url, status, bytes, chars, ms)
 *
 * Запуск: node scripts/fetch.mjs <queue.tsv> [--cap 80] [--delay 2000]
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createHash } from "node:crypto"
import { htmlToText, internalLinks, signals } from "./lib-extract.mjs"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const UA = "upready-research/1.0 (+https://upready.dev)"
const TOPIC = "store-templates-functionality"

const args = process.argv.slice(2)
const queueFile = args[0]
const cap = Number(args[args.indexOf("--cap") + 1]) || 80
const delayMs = Number(args[args.indexOf("--delay") + 1]) || 2000
const maxChars = 14000

if (!queueFile) { console.error("usage: node fetch.mjs <queue.tsv> [--cap N] [--delay MS]"); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ANTIBOT = /Проверяем браузер|cf-browser-verification|Just a moment|Attention Required|Enable JavaScript and cookies|<title>[^<]*captcha/i

const rows = readFileSync(queueFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => { const [source, slug, url] = l.split("\t"); return { source, slug, url } })

const seenHash = new Map()   // контент-хэш → первый slug (дубли не пишем, правило 43)
const perSource = new Map()
const closed = new Set()
const logPath = `${ROOT}/fetch-log.jsonl`

let ok = 0, skipped = 0, failed = 0
for (const [i, row] of rows.entries()) {
  if (closed.has(row.source)) { skipped++; continue }
  const n = (perSource.get(row.source) || 0)
  if (n >= cap) { if (!closed.has(row.source)) { console.log(`[cap] источник ${row.source}: достигнут потолок ${cap}`); closed.add(row.source) } skipped++; continue }

  const outPath = `${ROOT}/raw/${row.source}/${row.slug}.md`
  if (existsSync(outPath)) { skipped++; continue }

  if (i > 0) await sleep(delayMs)
  const t0 = Date.now()
  let status = 0, body = "", err = null
  try {
    const res = await fetch(row.url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ru,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    status = res.status
    body = await res.text()
  } catch (e) { err = String(e && e.message || e) }

  const ms = Date.now() - t0
  perSource.set(row.source, n + 1)

  const rec = { ts: new Date().toISOString(), source: row.source, slug: row.slug, url: row.url, status, bytes: body.length, ms, err }

  if (err || status === 0 || status === 403 || status === 429 || status === 498 || status >= 500) {
    rec.action = "источник закрыт: отказ без ретрая"
    closed.add(row.source)
    appendFileSync(logPath, JSON.stringify(rec) + "\n")
    console.log(`[stop] ${row.source} ${status || "ERR"} ${row.url} ${err || ""}`)
    failed++
    continue
  }
  if (status === 404) { rec.action = "404 — не сохраняем"; appendFileSync(logPath, JSON.stringify(rec) + "\n"); failed++; continue }
  if (ANTIBOT.test(body.slice(0, 4000))) {
    rec.action = "анти-бот страница: источник закрыт"
    closed.add(row.source)
    appendFileSync(logPath, JSON.stringify(rec) + "\n")
    console.log(`[antibot] ${row.source} ${row.url}`)
    failed++
    continue
  }

  const text = htmlToText(body, row.url)
  const hash = createHash("sha1").update(text.slice(0, 4000)).digest("hex").slice(0, 12)
  if (seenHash.has(hash)) { rec.action = `дубль контента (${seenHash.get(hash)})`; appendFileSync(logPath, JSON.stringify(rec) + "\n"); skipped++; continue }
  seenHash.set(hash, row.slug)

  const links = internalLinks(body, row.url)
  const sig = signals(body)
  rec.chars = text.length
  rec.signals = sig.length
  rec.links = links.length

  const head = [
    `# Source: ${row.url}`,
    `# Fetched: ${new Date().toISOString()}`,
    `# Topic: ${TOPIC}`,
    `# HTTP: ${status}`,
    "",
    `## Сигналы (маркеры функциональности в разметке)`,
    sig.length ? sig.join(", ") : "(нет)",
    "",
    `## Внутренние ссылки (${links.length})`,
    ...links.slice(0, 120).map((l) => `- ${l.text || "(без текста)"} → ${l.url}`),
    "",
    `## Текст страницы`,
    "",
  ].join("\n")

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, head + text.slice(0, maxChars) + (text.length > maxChars ? `\n\n[обрезано: ${text.length} символов всего]\n` : "\n"))
  appendFileSync(logPath, JSON.stringify(rec) + "\n")
  ok++
  console.log(`[ok] ${row.source}/${row.slug} ${status} ${body.length}B → ${text.length} симв, сигналов ${sig.length}`)
}
console.log(`\nИтог: сохранено ${ok}, пропущено ${skipped}, отказов ${failed}`)
