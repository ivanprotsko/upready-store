#!/usr/bin/env node
// operator.mjs — резидент оператора (OPERATOR-SPEC §6). Цикл: промпт Ивана из UI → разбор (haiku по
// схеме) → записи → маршрут по kind (routes.mjs) → ответ скриптом (ask.mjs) → ГЕЙТ (gate.mjs) → документ.
// Красный гейт НЕ показывается как ответ: он становится строкой эскалации для уровня выше (Э2).
// Ниже Fable никто не пишет tasks.json/state.json, не запускает run.sh и не коммитит (PROMPT.md v1).
// CLI: operator.mjs [--once] | add "<текст>" | verdict <record-id> <ok|wrong|queue> | thread [--n 20]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { open, loadCorpusConfig, nowIso, wita, rid, answersDir, promptsDir, escalationsLog } from './db.mjs'
import { askPassages, askStatus, askWhere, askLive, askHowto } from './ask.mjs'
import { gate } from './gate.mjs'
import { ROUTES, IMPLEMENTED, ANSWERABLE, AWAITS_IVAN, nextLevel, startLevel } from './routes.mjs'
import { parsePrompt } from './parse.mjs'
import { checkRefs, add as intakeAdd } from './intake.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AREAS = ['panel', 'checkout', 'storefront', 'marketplaces', 'integrations', 'deploy', 'content', 'engine', 'other']

export function dropPrompt(text, source = 'cli') {
  const dir = promptsDir()
  fs.mkdirSync(dir, { recursive: true })
  const id = rid('pr')
  const f = path.join(dir, `${id}.json`)
  fs.writeFileSync(f, JSON.stringify({ id, ts: nowIso(), text: String(text), source }, null, 1))
  return { id, file: f }
}

const VERDICT_WORDS = [
  [/(^|\s)(не\s*то|неверно|не\s*так|нет,|^нет$|мимо|не\s*это)/i, 'wrong'],
  [/(в\s*очередь|заводи|в\s*работу|бери\s*в\s*работу)/i, 'queue'],
  [/(^|\s)(ок|ok|окей|да|делай|давай|годится|принято|верно|спасибо)(\s|$|[.!,])/i, 'ok'],
]
export function verdictOf(text) {
  for (const [re, v] of VERDICT_WORDS) if (re.test(String(text))) return v
  return 'ok'
}

function urlIn(s) { const m = /https?:\/\/[^\s)»"']+/.exec(String(s)); return m ? m[0] : null }
function taskIdIn(s) { const m = /\b([a-z]{1,4}\d{2}[a-z0-9-]*)\b/.exec(String(s)); return m ? m[1] : null }

/** Ответ уровня «скрипт» для одной записи. Вопрос кладём ДОСЛОВНО: путь, который Иван написал сам,
 *  гейт (правило 3) не считает выдумкой уровня. */
export function answerRecord(rec, { db, cfg } = {}) {
  const q = [rec.ivan, rec.title].filter(Boolean).join(' ').slice(0, 800)
  let a
  if (rec.kind === 'status') a = askStatus(rec.ivan || rec.title, { cfg })
  else if (rec.kind === 'where') a = askWhere(rec.target || taskIdIn(rec.ivan || '') || null, rec.ivan || rec.title, { cfg })
  else if (rec.kind === 'live') a = askLive(rec.target || urlIn(rec.ivan || '') || (cfg || loadCorpusConfig()).live.hosts[0].url, { cfg })
  else if (rec.kind === 'howto') a = askHowto(q, { db, cfg })
  else a = askPassages(q, { db, cfg, kind: rec.kind })
  a.question = rec.ivan || rec.title
  a.kind = rec.kind
  return a
}

function writeDoc(rec, a, g) {
  const dir = answersDir()
  fs.mkdirSync(dir, { recursive: true })
  const f = path.join(dir, `${rec.id}.md`)
  const head = [
    `<!-- record=${rec.id} kind=${rec.kind} level=${a.level} gate=${g.ok ? 'GREEN' : 'RED'} -->`,
    `**Уровень:** ${a.level} · **когда:** ${wita()} · **гейт:** ${g.ok ? 'зелёный' : 'КРАСНЫЙ — ' + g.reasons.join('; ')} · **источников:** ${a.sources.length}`,
    '',
  ].join('\n')
  fs.writeFileSync(f, head + a.doc_md + '\n')
  return f
}

function escalate(db, rec, from, reasons) {
  const to = nextLevel(from)
  db.prepare('insert into escalations(record_id, from_level, to_level, ts, reason) values (?, ?, ?, ?, ?)')
    .run(rec.id, from, to, nowIso(), reasons.join(' · '))
  fs.appendFileSync(escalationsLog(), `${nowIso()} | ${rec.id} | ${from} → ${to} | ${reasons.join(' · ')}\n`)
  return to
}

export function processPromptFile(file, { db, cfg = loadCorpusConfig(), log = () => {} } = {}) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const promptId = raw.id || rid('pr')
  const text = String(raw.text || '').trim()
  if (!text) { fs.unlinkSync(file); return { promptId, records: [] } }
  db.prepare('insert or replace into prompts(id, ts, text, source, usage, parse, seconds) values (?,?,?,?,?,?,?)')
    .run(promptId, raw.ts || nowIso(), text, raw.source || 'ui', null, null, null)

  const recent = db.prepare('select kind, area, title, ivan from records order by ts desc limit 5').all()
  const p = parsePrompt(text, { recent })
  db.prepare('update prompts set usage = ?, parse = ?, seconds = ? where id = ?')
    .run(JSON.stringify({ usage: p.usage, cost: p.cost, error: p.error }), p.parse, p.seconds, promptId)
  log(`разбор: ${p.parse} · ${p.seconds.toFixed(1)} с · записей ${p.records.length}${p.error ? ' · ошибка: ' + p.error : ''}`)

  const made = []
  for (const r of p.records) {
    const kind = kindOf(r.kind)
    const area = AREAS.includes(r.area) ? r.area : 'other'
    const id = rid('rec')
    const refs = checkRefs(r.refs || [])
    const status = kind === 'approval' ? 'approval' : ANSWERABLE.has(kind) ? 'pending' : 'awaiting-ivan'
    let intakeId = null
    let intakeRefusal = null
    if (['remark', 'order', 'bug', 'task'].includes(kind)) {
      // v1 очередь штаба остаётся живой: замечания, приказы, баги и задачи по-прежнему уезжают пачкой.
      const mapped = kind === 'order' ? 'remark' : kind
      const base = { area, title: String(r.title).slice(0, 200), ivan: r.ivan || text, goal: r.goal || '', acceptance: r.acceptance || '', priority: r.priority || 2, live: Boolean(r.live), refs: r.refs || [], notes: r.notes || '', by: 'operator' }
      const res = intakeAdd({ ...base, kind: mapped })
      intakeId = res.record?.id || null
      // intake v1 не берёт запись без цели и приёмки — и правильно делает. Придумывать их за Ивана нельзя
      // (правило 17a), поэтому отказ не проглатывается: он уходит в notes записи и виден в карточке ленты,
      // а сама карточка ждёт кнопки «в очередь» — цель и приёмку допишет штаб при разборе (правило 22j).
      if (res.error) { intakeRefusal = res.error.join('; '); log(`intake отказал (${kind}): ${intakeRefusal}`) }
    }
    db.prepare(`insert into records(id, prompt_id, ts, kind, area, title, ivan, goal, acceptance, priority, live, refs, refs_missing, dup, competitors, notes, status, start_level, verdict_ivan, intake_id)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, promptId, nowIso(), kind, area, String(r.title || '').slice(0, 300), r.ivan || text,
        r.goal || '', r.acceptance || '', Number(r.priority || 2), r.live ? 1 : 0,
        JSON.stringify(refs.ok), JSON.stringify(refs.missing), '[]', 'null',
        [r.notes || '', r.parse === 'fallback' ? 'parse=fallback' : '', intakeRefusal ? `в пачку штаба не взято: ${intakeRefusal}` : ''].filter(Boolean).join(' | '),
        status, startLevel(kind) || '', null, intakeId)
    made.push({ id, kind, area, title: r.title, ivan: r.ivan || text, target: r.target || '', status })
  }

  for (const rec of made) {
    if (rec.kind === 'approval') { applyApproval(db, rec, log); continue }
    if (!ANSWERABLE.has(rec.kind)) { log(`карточка ${rec.id} (${rec.kind}) ждёт Ивана — задачи и баги не «отвечаются» (§9)`); continue }
    const level = startLevel(rec.kind)
    if (!IMPLEMENTED.has(level)) {
      const to = escalate(db, rec, 'script', [`маршрут ${rec.kind} стартует с уровня ${level}, на Э1 он не реализован`])
      db.prepare("update records set status = 'escalate' where id = ?").run(rec.id)
      log(`${rec.id}: маршрут выше скрипта → эскалация к ${to}`)
      continue
    }
    const t0 = Date.now()
    let a
    try { a = answerRecord(rec, { db, cfg }) }
    catch (e) { a = { answered: false, level: 'script', kind: rec.kind, question: rec.ivan, doc_md: '', sources: [], pointers: [], live: [], not_found: [`ошибка скрипта: ${String(e.message).slice(0, 300)}`] } }
    const g = gate(a, { cfg })
    const doc = writeDoc(rec, a, g)
    const secs = (Date.now() - t0) / 1000
    db.prepare('insert into answers(id, record_id, level, ts, doc_path, sources, gate, usage, seconds) values (?,?,?,?,?,?,?,?,?)')
      .run(rid('ans'), rec.id, 'script', nowIso(), doc, JSON.stringify(a.sources || []), JSON.stringify(g), JSON.stringify({ usage: null, cost: 0 }), secs)
    if (g.ok) {
      db.prepare("update records set status = 'answered' where id = ?").run(rec.id)
      log(`${rec.id} (${rec.kind}): ЗЕЛЁНЫЙ · ${secs.toFixed(1)} с · источников ${a.sources.length} · ${doc}`)
    } else {
      const to = escalate(db, rec, 'script', g.reasons)
      db.prepare("update records set status = 'escalate' where id = ?").run(rec.id)
      log(`${rec.id} (${rec.kind}): КРАСНЫЙ → ${to} · ${g.reasons.join(' · ')}`)
    }
  }
  fs.mkdirSync(path.join(promptsDir(), 'done'), { recursive: true })
  fs.renameSync(file, path.join(promptsDir(), 'done', path.basename(file)))
  return { promptId, records: made, parse: p.parse, usage: p.usage, seconds: p.seconds }
}

const KINDS = new Set(Object.keys(ROUTES))
const kindOf = (k) => (KINDS.has(k) ? k : 'fact')

/** «ок» / «не то» / «в очередь» — вердикт вешается на САМУЮ СВЕЖУЮ запись потока, которая его ждёт. */
export function applyApproval(db, rec, log = () => {}) {
  const target = db.prepare("select id, kind, status from records where id != ? and status in ('awaiting-ivan','answered') order by ts desc limit 1").get(rec.id)
  const v = verdictOf(rec.ivan || rec.title)
  if (!target) { log(`вердикт «${v}» вешать не на что: ждущих записей нет`); return null }
  db.prepare('update records set verdict_ivan = ? where id = ?').run(v, target.id)
  db.prepare("update records set status = 'answered', verdict_ivan = ? where id = ?").run(v, rec.id)
  if (v === 'wrong') escalate(db, { id: target.id }, 'script', ['Иван нажал «не то» — ответ уровня script его не устроил'])
  log(`вердикт «${v}» записан на ${target.id} (${target.kind})`)
  return { target: target.id, verdict: v }
}

export function setVerdict(db, recordId, verdict) {
  const row = db.prepare('select id, kind from records where id = ?').get(recordId)
  if (!row) return null
  db.prepare('update records set verdict_ivan = ? where id = ?').run(verdict, recordId)
  if (verdict === 'wrong') escalate(db, { id: recordId }, 'script', ['Иван нажал «не то» в UI'])
  return { id: recordId, verdict }
}

export function runOnce({ db, cfg = loadCorpusConfig(), log = () => {} } = {}) {
  const dir = promptsDir()
  fs.mkdirSync(dir, { recursive: true })
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const out = []
  for (const f of files) {
    try { out.push(processPromptFile(path.join(dir, f), { db, cfg, log })) }
    catch (e) { log(`промпт ${f} не обработан: ${String(e.stack || e).slice(0, 500)}`) }
  }
  return out
}

function main(argv) {
  const log = (m) => console.log(`${wita()} ${m}`)
  if (argv[0] === 'add') { const r = dropPrompt(argv.slice(1).join(' '), 'cli'); console.log(r.file); return }
  const db = open()
  try {
    if (argv[0] === 'verdict') { console.log(JSON.stringify(setVerdict(db, argv[1], argv[2] || 'ok'))); return }
    if (argv[0] === 'thread') { console.log(JSON.stringify(thread(db, Number(argv[2] || 20)), null, 1)); return }
    if (argv.includes('--once')) { runOnce({ db, log }); return }
    log(`оператор поднят · база ${answersDir()} · слежу за ${promptsDir()}`)
    runOnce({ db, log })
    setInterval(() => { try { runOnce({ db, log }) } catch (e) { log('цикл: ' + String(e.message)) } }, Number(process.env.OPERATOR_POLL_MS || 2000))
  } finally { if (argv[0] === 'verdict' || argv[0] === 'thread' || argv.includes('--once')) db.close() }
}

/** Лента для UI: промпты Ивана, их записи и ПОСЛЕДНИЙ ответ по каждой записи. */
export function thread(db, n = 20) {
  const prompts = db.prepare('select id, ts, text, source, parse, usage, seconds from prompts order by ts desc limit ?').all(n)
  const out = []
  for (const p of prompts.reverse()) {
    const recs = db.prepare('select * from records where prompt_id = ? order by ts').all(p.id).map((r) => {
      const a = db.prepare('select * from answers where record_id = ? order by ts desc limit 1').get(r.id)
      let gateObj = null
      try { gateObj = a ? JSON.parse(a.gate) : null } catch {}
      return {
        ...r,
        live: !!r.live,
        refs: safe(r.refs, []), refs_missing: safe(r.refs_missing, []),
        answer: a ? { level: a.level, ts: a.ts, doc_path: a.doc_path, seconds: a.seconds, gate: gateObj, sources: safe(a.sources, []) } : null,
        escalations: db.prepare('select from_level, to_level, ts, reason from escalations where record_id = ? order by ts').all(r.id),
      }
    })
    out.push({ ...p, usage: safe(p.usage, null), records: recs })
  }
  return out
}
const safe = (s, d) => { try { return JSON.parse(s) } catch { return d } }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
