#!/usr/bin/env node
// intake.mjs — входящая очередь Ивана (задачи, баги, замечания, вопросы) → записи по стандарту SPEC.md →
// пачки для главной сессии штаба. Склейка ДЕТЕРМИНИРОВАНА (скрипт, не модель): одна область, 3–7 готовых
// записей или самая старая ждёт дольше 120 мин; вопрос и баг на живом хосте — пачка из одной записи сразу.
// Записи заводит входящая сессия (sonnet) через `add`, она НЕ заводит задачи в tasks.json и не запускает воркеров.
// CLI: add <file.json> | list [--status s] | batch [--auto|--force] | status | take <batchId> | drop <id> <why>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE_HERE = path.dirname(fileURLToPath(import.meta.url))
export const HOME = process.env.INTAKE_HOME || FILE_HERE
const ROOT = process.env.INTAKE_ROOT || path.resolve(FILE_HERE, '../../..')
const INBOX = () => path.join(HOME, 'inbox.json')
const BATCH_DIR = () => path.join(HOME, 'batches')
const BATCH_LOG = () => path.join(HOME, 'batches.log')
const TASKS = process.env.INTAKE_TASKS || path.join(FILE_HERE, '..', 'tasks.json')
const FEATURES = process.env.INTAKE_FEATURES || path.join(ROOT, 'artifacts/research/2026-09-16-store-templates-functionality/features.json')

export const AREAS = ['panel', 'checkout', 'storefront', 'marketplaces', 'integrations', 'deploy', 'content', 'engine', 'other']
export const KINDS = ['task', 'bug', 'remark', 'question']
export const RULES = { minBatch: 3, maxBatch: 7, maxAgeMin: 120, dupJaccard: 0.5 }

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return dflt } }
const writeJson = (p, v) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1) + '\n'); fs.renameSync(tmp, p) }
export const loadInbox = () => readJson(INBOX(), [])
const saveInbox = (rows) => writeJson(INBOX(), rows)
const nowIso = () => new Date().toISOString()
const p2 = (n) => String(n).padStart(2, '0')
const stamp = (d = new Date()) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}` // локальное время (WITA), как читает Иван

export const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4))
export const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n) }

export function matchFeature(text, features) {
  const t = tokens(text); let best = null
  for (const f of features || []) {
    const ft = tokens(`${f.id} ${f.name_ru} ${f.name_en}`); let n = 0
    for (const w of t) if (ft.has(w)) n++
    if (n >= 2 && (!best || n > best.n)) best = { n, feature: f.id, name_ru: f.name_ru, insales: f.insales?.count ?? 0, tilda: f.tilda?.count ?? 0 }
  }
  return best
}

export function validate(rec) {
  const errs = []
  if (!KINDS.includes(rec.kind)) errs.push(`kind ∉ ${KINDS.join('|')}`)
  if (!AREAS.includes(rec.area)) errs.push(`area ∉ ${AREAS.join('|')}`)
  if (!rec.title || String(rec.title).trim().length < 8) errs.push('title короче 8 знаков')
  if (!rec.ivan || String(rec.ivan).trim().length < 4) errs.push('ivan (дословный текст Ивана) пуст')
  if (rec.kind !== 'question') {
    if (!rec.goal) errs.push('goal пуст')
    if (!rec.acceptance) errs.push('acceptance пуст')
  }
  if (rec.priority != null && ![1, 2, 3].includes(Number(rec.priority))) errs.push('priority ∉ 1|2|3')
  if (rec.refs != null && !Array.isArray(rec.refs)) errs.push('refs — не массив')
  return errs
}

export function checkRefs(refs) {
  const ok = [], missing = []
  for (const r of refs || []) (fs.existsSync(path.resolve(ROOT, String(r).replace(/^file:\/\//, ''))) ? ok : missing).push(r)
  return { ok, missing }
}

export function findDups(rec, inbox, tasks) {
  const t = tokens(rec.title); const dups = []
  for (const r of inbox) if (r.status !== 'dropped' && jaccard(t, tokens(r.title)) >= RULES.dupJaccard) dups.push(r.id)
  for (const k of tasks || []) if (jaccard(t, tokens(k.title)) >= RULES.dupJaccard) dups.push(k.id)
  return dups
}

export function add(input, opts = {}) {
  const rec = { ...input }
  const errs = validate(rec)
  if (errs.length) return { error: errs }
  const inbox = loadInbox()
  const exact = inbox.find((r) => r.status === 'new' && r.title.trim().toLowerCase() === rec.title.trim().toLowerCase())
  if (exact && !opts.force) return { error: [`та же запись уже ждёт: ${exact.id}`] }
  const tasks = readJson(TASKS, {}).tasks || []
  const { ok, missing } = checkRefs(rec.refs)
  const live = Boolean(rec.live)
  const out = {
    id: `in-${stamp()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: nowIso(),
    kind: rec.kind, area: rec.area, title: rec.title.trim(), ivan: rec.ivan.trim(),
    goal: rec.goal || '', acceptance: rec.acceptance || '', priority: Number(rec.priority || 2),
    live, urgent: rec.kind === 'question' || (rec.kind === 'bug' && live) || Boolean(rec.urgent),
    refs: ok, refsMissing: missing,
    competitors: rec.competitors || matchFeature(`${rec.title} ${rec.goal || ''}`, readJson(FEATURES, [])),
    dup: findDups(rec, inbox, tasks),
    notes: rec.notes || '', by: rec.by || 'intake', status: 'new', batch: null,
  }
  inbox.push(out); saveInbox(inbox)
  return { record: out }
}

const ready = (r) => r.status === 'new' && (r.kind === 'question' || (r.goal && r.acceptance))
const ageMin = (r, now) => (now - Date.parse(r.ts)) / 60000

export function planBatches(inbox, now = Date.now(), opts = {}) {
  const plans = []
  for (const r of inbox) if (r.status === 'new' && r.urgent) plans.push({ area: r.area, urgent: true, ids: [r.id], reason: r.kind === 'question' ? 'вопрос' : 'срочно' })
  const planned = new Set(plans.flatMap((p) => p.ids))
  for (const area of AREAS) {
    const group = inbox.filter((r) => r.area === area && ready(r) && !r.urgent && !planned.has(r.id))
      .sort((a, b) => a.priority - b.priority || Date.parse(a.ts) - Date.parse(b.ts))
    if (!group.length) continue
    const oldest = Math.max(...group.map((r) => ageMin(r, now)))
    const why = group.length >= RULES.minBatch ? `≥${RULES.minBatch} готовых` : oldest >= RULES.maxAgeMin ? `ждёт ${Math.round(oldest)} мин` : opts.force ? 'force' : null
    if (!why) continue
    plans.push({ area, urgent: false, ids: group.slice(0, RULES.maxBatch).map((r) => r.id), reason: why })
  }
  return plans
}

const fmt = (r) => [
  `### ${r.id} · ${r.kind} · ${r.area} · p${r.priority}${r.urgent ? ' · СРОЧНО' : ''}${r.live ? ' · живой хост' : ''}`,
  `- **Заголовок:** ${r.title}`,
  `- **Иван (дословно):** «${r.ivan}»`,
  r.goal ? `- **Цель:** ${r.goal}` : null,
  r.acceptance ? `- **Приёмка:** ${r.acceptance}` : null,
  r.refs.length ? `- **Файлы (проверены на диске):** ${r.refs.join(', ')}` : null,
  r.refsMissing.length ? `- **НЕ НАЙДЕНЫ на диске (не верить):** ${r.refsMissing.join(', ')}` : null,
  r.competitors ? `- **У конкурентов (реестр r03):** ${r.competitors.name_ru || r.competitors.feature} — InSales ${r.competitors.insales}, Tilda ${r.competitors.tilda}` : '- **У конкурентов:** совпадений в реестре r03 нет — проверить вручную',
  r.dup.length ? `- **Похоже на:** ${r.dup.join(', ')}` : null,
  r.notes ? `- **Заметки входящей сессии:** ${r.notes}` : null,
].filter(Boolean).join('\n')

export function batch(opts = {}) {
  const inbox = loadInbox(); const plans = planBatches(inbox, Date.now(), opts); const lines = []
  fs.mkdirSync(BATCH_DIR(), { recursive: true })
  for (const p of plans) {
    const id = `batch-${stamp()}-${p.area}${p.urgent ? '-urgent' : ''}-${Math.random().toString(36).slice(2, 5)}`
    const recs = p.ids.map((i) => inbox.find((r) => r.id === i))
    const md = [
      `# Пачка входящих ${id} — область ${p.area}, ${recs.length} зап., причина: ${p.reason}`,
      `Сформирована скриптом intake.mjs ${nowIso()}. Главная сессия решает, что из этого идёт в очередь дня (add-task), что — ответом Ивану, что — отбросить (\`node intake.mjs drop <id> <why>\`). После разбора: \`node intake.mjs take ${id}\`.`,
      '', ...recs.map(fmt), '',
    ].join('\n')
    const file = path.join(BATCH_DIR(), `${id}.md`); fs.writeFileSync(file, md)
    for (const r of recs) { r.status = 'batched'; r.batch = id }
    const line = `${nowIso()} ${id} area=${p.area} n=${recs.length} urgent=${p.urgent ? 1 : 0} reason=${p.reason} ${file}`
    fs.appendFileSync(BATCH_LOG(), line + '\n'); lines.push(line)
  }
  saveInbox(inbox)
  return lines
}

export function status() {
  const inbox = loadInbox(); const by = {}
  for (const r of inbox) { const k = `${r.area}/${r.status}`; by[k] = (by[k] || 0) + 1 }
  const plans = planBatches(inbox, Date.now())
  const waiting = inbox.filter((r) => r.status === 'new' && !ready(r)).map((r) => `${r.id} (нет ${!r.goal ? 'goal' : 'acceptance'})`)
  return { total: inbox.length, by, nextBatches: plans, notReady: waiting }
}

function main(argv) {
  const [cmd, a, ...rest] = argv
  if (cmd === 'add') {
    const input = a?.startsWith('@') || a?.endsWith('.json') ? readJson(a.replace(/^@/, ''), null) : (a ? JSON.parse(a) : null)
    if (!input) { console.error('add <file.json|json>'); process.exit(2) }
    const r = add(input, { force: rest.includes('--force') })
    if (r.error) { console.error('ОТКАЗ: ' + r.error.join('; ')); process.exit(2) }
    const x = r.record
    console.log(`записано ${x.id} · ${x.kind}/${x.area}/p${x.priority}${x.urgent ? ' · СРОЧНО' : ''}` +
      (x.refsMissing.length ? ` · НЕ НАЙДЕНЫ: ${x.refsMissing.join(', ')}` : '') +
      (x.dup.length ? ` · похоже на ${x.dup.join(', ')}` : '') +
      (x.competitors ? ` · конкуренты: ${x.competitors.feature} insales=${x.competitors.insales} tilda=${x.competitors.tilda}` : ' · конкуренты: нет совпадений'))
    return
  }
  if (cmd === 'list') { const s = rest.includes('--status') ? rest[rest.indexOf('--status') + 1] : a?.replace('--status=', ''); for (const r of loadInbox()) if (!s || r.status === s) console.log(`${r.id} ${r.status.padEnd(8)} ${r.kind.padEnd(8)} ${r.area.padEnd(12)} p${r.priority} ${r.urgent ? '!' : ' '} ${r.title}`); return }
  if (cmd === 'batch') { for (const l of batch({ force: a === '--force' })) console.log(l); return }
  if (cmd === 'status') { console.log(JSON.stringify(status(), null, 1)); return }
  if (cmd === 'take') { const inbox = loadInbox(); let n = 0; for (const r of inbox) if (r.batch === a && r.status === 'batched') { r.status = 'taken'; n++ } saveInbox(inbox); console.log(`taken ${n}`); return }
  if (cmd === 'drop') { const inbox = loadInbox(); const r = inbox.find((x) => x.id === a); if (!r) { console.error('нет записи'); process.exit(2) } r.status = 'dropped'; r.notes = `${r.notes} | drop: ${rest.join(' ')}`.trim(); saveInbox(inbox); console.log(`dropped ${a}`); return }
  console.error('intake.mjs add <file.json> | list [--status s] | batch [--auto|--force] | status | take <batchId> | drop <id> <why>'); process.exit(2)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
