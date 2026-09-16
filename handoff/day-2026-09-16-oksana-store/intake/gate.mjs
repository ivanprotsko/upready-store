#!/usr/bin/env node
// gate.mjs — ОДИН гейт для всех уровней (OPERATOR-SPEC §5). Решает не модель и не слово «готово»,
// а скрипт: ответ без проверяемого на диске источника ответом не является (правило 17a в коде).
// Правила 1–4 действуют на Э1; правило 5 (Рекомендация/Против для kind=decision) — Э3.
// CLI: gate.mjs <answer.json> → «GREEN» (rc 0) или «RED: причины» (rc 1)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpusConfig, answersDir } from './db.mjs'

export const MIN_QUOTE = 20
export const MIN_DOC = 200
export const LIVE_MAX_AGE_MS = 10 * 60 * 1000

/** Корни, внутри которых источник считается «внутри корпуса». .private запрещён явно.
 *  Свой каталог answers/ тоже корень: протокол живого замера, написанный ЭТИМ прогоном, — такой же
 *  проверяемый файл на диске, как документ канона (правило 18f: замер, а не память о замере). */
export function corpusRoots(cfg = loadCorpusConfig()) {
  return [...cfg.roots.map((r) => r.path), cfg.live.dayDir, cfg.live.repo, answersDir()]
}
const inside = (p, roots) => roots.some((r) => p === r || p.startsWith(r.endsWith('/') ? r : r + '/'))
/** Запретная зона источника. `.jsonl` закрыт как класс (стенограммы сессий целиком не читаются),
 *  единственное исключение — журнал диспетчера дня logs/dispatcher.jsonl: это структурный журнал штаба,
 *  а не стенограмма, и типовой документ «статус» стоит именно на нём (OPERATOR-SPEC §4). */
export const forbidden = (p) => {
  if (/(^|\/)\.private(\/|$)/.test(p) || /(^|\/)\.env/.test(p)) return true
  if (!p.endsWith('.jsonl')) return false
  return !/\/logs\/dispatcher\.jsonl$/.test(p)
}

/** Пути, НАЗВАННЫЕ в тексте документа. Из подсчёта выпадают код-блоки и ДОСЛОВНЫЙ материал источника —
 *  цитаты (их дословность уже проверило правило 2) и заголовки разделов, найденные в файле: путь внутри
 *  них написал не уровень, а автор источника. Всё остальное — претензия уровня, и она проверяется. */
export function pathsInDoc(docMd, { verifiedQuotes = [], verifiedHeadings = [], question = '' } = {}) {
  const lines = String(docMd).split('\n')
  const keep = []
  let fenced = false
  const quoteHay = verifiedQuotes.join('\n') + '\n' + verifiedHeadings.join('\n') + '\n' + String(question)
  for (const l of lines) {
    if (/^\s*```/.test(l)) { fenced = !fenced; continue }
    if (fenced) continue
    const body = /^\s*(?:>\s?|#{1,6}\s+(?:\d+\.\s*)?)(.*)$/.exec(l)?.[1]
    if (body != null && (body.trim().length < 3 || quoteHay.includes(body.trim()))) continue
    keep.push(l)
  }
  let text = keep.join('\n')
  const found = new Set()
  const trim = (s) => s.replace(/[)\]\.,;:»"'>]+$/, '')
  text = text.replace(/file:\/\/(\S+)/g, (_m, p) => { found.add(trim(p)); return ' ' })
  text = text.replace(/https?:\/\/\S+/g, ' ')
  // Претензия на ФАЙЛ, а не любое слово с косой чертой: абсолютный путь от двух сегментов
  // (иначе «/compact» — слэш-команда — читается как путь) или относительный путь с расширением
  // (иначе «ask/gate», «opus/high», «feat/day16-…» — проза, а не ссылки).
  for (const m of text.matchAll(/(?:^|[\s(«"'`])(\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)/g)) found.add(trim(m[1]))
  for (const m of text.matchAll(/(?:^|[\s(«"'`])([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.(?:md|json|jsonl|mjs|js|ts|tsx|sql|png|jpg|webp|log|txt|html|css|plist|tsv|csv|yml|yaml|sh|env))/g)) found.add(trim(m[1]))
  return [...found]
}

const ancestors = (p) => { const out = []; let c = p; while (c && c !== '/' && c !== path.dirname(c)) { c = path.dirname(c); out.push(c) } return out }

export function gate(answer, opts = {}) {
  const cfg = opts.cfg || loadCorpusConfig()
  const roots = opts.roots || corpusRoots(cfg)
  const reasons = []
  const a = answer || {}
  const sources = Array.isArray(a.sources) ? a.sources : []
  const pointers = Array.isArray(a.pointers) ? a.pointers : []

  // 1. источники есть, каждый существует и лежит внутри корпуса
  if (sources.length < 1) reasons.push('правило 1: ни одного источника')
  for (const s of sources) {
    const p = String(s?.path || '')
    if (!p) { reasons.push('правило 1: источник без пути'); continue }
    if (forbidden(p)) { reasons.push(`правило 1: источник из запретной зоны (.private/.env/.jsonl): ${p}`); continue }
    if (!fs.existsSync(p)) { reasons.push(`правило 1: источника нет на диске: ${p}`); continue }
    if (!inside(p, roots)) reasons.push(`правило 1: источник вне корпуса: ${p}`)
  }
  // 2. цитата дословна и не короче MIN_QUOTE
  for (const s of sources) {
    const p = String(s?.path || ''); const qt = String(s?.quote || '')
    if (!fs.existsSync(p) || forbidden(p)) continue
    if (qt.trim().length < MIN_QUOTE) { reasons.push(`правило 2: цитата короче ${MIN_QUOTE} знаков (${p})`); continue }
    let raw = ''
    try { raw = fs.readFileSync(p, 'utf8') } catch { reasons.push(`правило 2: файл не читается: ${p}`); continue }
    if (!raw.includes(qt.trim())) reasons.push(`правило 2: цитата не найдена в файле дословно: ${p}`)
  }
  // 3. документ достаточной длины и без путей, которых нет ни в источниках, ни в указателях
  const doc = String(a.doc_md || '')
  if (doc.trim().length < MIN_DOC) reasons.push(`правило 3: документ короче ${MIN_DOC} знаков (${doc.trim().length})`)
  const allowed = new Set()
  for (const s of sources) { const p = String(s?.path || ''); if (!p) continue; allowed.add(p); for (const anc of ancestors(p)) allowed.add(anc) }
  for (const p of pointers) {
    const q = String(p?.path || '')
    if (!q) continue
    if (!fs.existsSync(q)) { reasons.push(`правило 3: указатель ведёт в никуда: ${q}`); continue }
    allowed.add(q)
    for (const anc of ancestors(q)) allowed.add(anc)
  }
  const heads = []
  for (const s of sources) {
    const h = String(s?.heading || '').trim()
    if (h.length < 3) continue
    try { if (fs.readFileSync(String(s.path), 'utf8').includes(h)) heads.push(h) } catch {}
  }
  const named = pathsInDoc(doc, { verifiedQuotes: sources.map((s) => String(s?.quote || '')), verifiedHeadings: heads, question: String(a.question || '') })
  for (const p of named) {
    if (allowed.has(p)) continue
    if (String(a.question || '').includes(p)) continue
    reasons.push(`правило 3: в документе путь вне источников: ${p}`)
  }
  // 4. kind=live — замер ЭТОГО прогона
  if (a.kind === 'live') {
    const live = Array.isArray(a.live) ? a.live : []
    if (!live.length) reasons.push('правило 4: kind=live без замера')
    for (const m of live) {
      const t = Date.parse(m?.ts || '')
      if (!m?.ts || Number.isNaN(t)) { reasons.push('правило 4: у замера нет разбираемого ts'); continue }
      if (Math.abs(Date.now() - t) > (opts.liveMaxAgeMs ?? LIVE_MAX_AGE_MS)) reasons.push(`правило 4: замер не этого прогона (ts ${m.ts})`)
    }
  }
  return { ok: reasons.length === 0, reasons, checked: { sources: sources.length, pointers: pointers.length, docChars: doc.trim().length, paths: named.length } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = process.argv[2]
  if (!f) { console.error('gate.mjs <answer.json>'); process.exit(2) }
  const r = gate(JSON.parse(fs.readFileSync(f, 'utf8')))
  if (r.ok) { console.log(`GREEN · источников ${r.checked.sources} · указателей ${r.checked.pointers} · документ ${r.checked.docChars} знаков · путей в тексте ${r.checked.paths}`); process.exit(0) }
  console.log('RED: ' + r.reasons.join(' · ')); process.exit(1)
}
