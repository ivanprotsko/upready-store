#!/usr/bin/env node
// index.mjs — инкрементальный индекс корпуса в operator.db (OPERATOR-SPEC §6).
// Одна строка corpus_fts = один раздел документа (заголовок # … ###), тело ≤ maxBody знаков.
// Секреты маскируются НА ВХОДЕ: имя переменной остаётся, значение не попадает ни в базу, ни в документы.
// .private/, .env*, .jsonl не читаются вовсе — их нет в обходе.
// CLI: index.mjs [--stats] [--full]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { open, loadCorpusConfig, nowIso, dbPath } from './db.mjs'

export const MASK = '«скрыто»'

/** Маскировка значений NAME=value, где NAME похоже на секрет. Имя сохраняем — по нему потом ищут. */
export function maskSecrets(text, namesRe) {
  const re = new RegExp(`\\b([A-Za-z0-9_]*(?:${namesRe})[A-Za-z0-9_]*)\\s*[=:]\\s*("[^"\\n]*"|'[^'\\n]*'|\`[^\`\\n]*\`|[^\\s"'\`,;)\\]}]+)`, 'gi')
  return String(text).replace(re, (_m, name) => `${name}=${MASK}`)
}

/** Разбор markdown на разделы: заголовок → тело. Преамбула до первого заголовка — раздел «(начало)». */
export function sections(md, maxBody = 2000) {
  const lines = String(md).split('\n')
  const out = []
  let heading = '(начало)'
  let buf = []
  const flush = () => {
    const body = buf.join('\n').trim()
    buf = []
    if (!body && heading === '(начало)') return
    if (!body) { out.push({ heading, body: '' }); return }
    for (let i = 0; i < body.length; i += maxBody) out.push({ heading, body: body.slice(i, i + maxBody) })
  }
  for (const l of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(l)
    if (m) { flush(); heading = m[2]; continue }
    buf.push(l)
  }
  flush()
  return out.length ? out : [{ heading, body: '' }]
}

const isExcludedDir = (name, cfg) => cfg.excludeDir.includes(name)
const isExcludedFile = (name, cfg) => cfg.excludeName.some((r) => new RegExp(r).test(name))

export function walk(root, cfg, acc = []) {
  let ents
  try { ents = fs.readdirSync(root, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    const p = path.join(root, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) { if (!isExcludedDir(e.name, cfg) && !e.name.startsWith('.private')) walk(p, cfg, acc); continue }
    if (!e.isFile()) continue
    if (isExcludedFile(e.name, cfg)) continue
    if (!cfg.ext.some((x) => e.name.toLowerCase().endsWith(x))) continue
    acc.push(p)
  }
  return acc
}

export function fileKind(p, rootKind) {
  const b = path.basename(p).toLowerCase()
  if (b === 'decision.md') return 'decision'
  if (b === 'report.md') return 'report'
  return rootKind
}

export function indexAll({ full = false, cfg = loadCorpusConfig(), db = null } = {}) {
  const t0 = Date.now()
  const own = !db
  const base = db || open()
  if (full) {
    // --full пересобирает индекс НА ЧИСТОМ месте. `delete from corpus_fts` оставляет фрагментацию:
    // замер — база после --full поверх существующей весит 98,5 МБ против 63,2 МБ у сборки с нуля,
    // и `vacuum` её не возвращает (фрагментация внутри страниц самого FTS5).
    base.exec('drop table if exists corpus_fts; delete from corpus;')
    base.exec(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8'))
  }
  base.exec('begin')
  try {
    const known = new Map()
    for (const r of base.prepare('select path, mtime, size from corpus').all()) known.set(r.path, r)
    const seen = new Set()
    const delFts = base.prepare('delete from corpus_fts where path = ?')
    const delCorpus = base.prepare('delete from corpus where path = ?')
    const insFts = base.prepare('insert into corpus_fts(path, heading, body) values (?, ?, ?)')
    const insCorpus = base.prepare('insert or replace into corpus(path, mtime, size, kind, title, rows, indexed_at) values (?, ?, ?, ?, ?, ?, ?)')
    let files = 0, rows = 0, changed = 0
    for (const root of cfg.roots) {
      for (const p of walk(root.path, cfg)) {
        seen.add(p)
        files++
        const st = fs.statSync(p)
        const mtime = Math.floor(st.mtimeMs)
        const prev = known.get(p)
        if (!full && prev && prev.mtime === mtime && prev.size === st.size) { rows += 0; continue }
        changed++
        const raw = fs.readFileSync(p, 'utf8')
        const masked = maskSecrets(raw, cfg.secretNames)
        const secs = sections(masked, cfg.maxBody)
        delFts.run(p)
        let n = 0
        for (const s of secs) { if (!s.body && !s.heading) continue; insFts.run(p, s.heading, s.body); n++ }
        rows += n
        const title = (/^#\s+(.+)$/m.exec(masked) || [])[1] || path.basename(p)
        insCorpus.run(p, mtime, st.size, fileKind(p, root.kind), title.slice(0, 300), n, nowIso())
      }
    }
    let removed = 0
    for (const p of known.keys()) if (!seen.has(p)) { delFts.run(p); delCorpus.run(p); removed++ }
    base.exec('commit')
    if (full) base.exec('vacuum')
    const totalRows = base.prepare('select coalesce(sum(rows), 0) n from corpus').get().n
    return { files, changed, removed, rowsWritten: rows, rows: totalRows, seconds: (Date.now() - t0) / 1000 }
  } catch (e) {
    base.exec('rollback')
    throw e
  } finally {
    if (own) base.close()
  }
}

function dbBytes() {
  let n = 0
  for (const suffix of ['', '-wal', '-shm']) { try { n += fs.statSync(dbPath() + suffix).size } catch {} }
  return n
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const full = process.argv.includes('--full')
  const r = indexAll({ full })
  const mb = (dbBytes() / 1048576).toFixed(2)
  console.log(`файлов ${r.files} · разделов (строк FTS) ${r.rows} · перечитано файлов ${r.changed} · удалено ${r.removed} · ${r.seconds.toFixed(1)} с · operator.db ${mb} МБ · ${dbPath()}`)
}
