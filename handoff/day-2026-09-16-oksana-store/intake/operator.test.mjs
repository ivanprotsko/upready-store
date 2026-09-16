// Цикл оператора: промпт → записи → маршрут → гейт → документ. Вопросы отвечаются, баг ждёт кнопки.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpRoot, makeCorpus, makeConfig, makeDayDir, makeClaudeStub, cleanup } from './testkit.mjs'

const root = tmpRoot('operator')
const corpus = makeCorpus(root)
const day = makeDayDir(root)
process.env.OPERATOR_CORPUS = makeConfig(root, corpus, day)
process.env.OPERATOR_DB = path.join(root, 'operator.db')
process.env.INTAKE_HOME = path.join(root, 'intake-home')
fs.mkdirSync(process.env.INTAKE_HOME, { recursive: true })
process.env.OPERATOR_CLAUDE = makeClaudeStub(root, { records: [
  { kind: 'fact', area: 'integrations', title: 'Почему не взяли модуль интеграций gorgojs', ivan: 'почему не взяли модуль интеграций gorgojs?' },
  { kind: 'where', area: 'panel', title: 'Где результат по выполненным задачам дня', ivan: 'где результат по done задачам?' },
  { kind: 'bug', area: 'panel', title: 'Страница робокассы отвечает пятисоткой', ivan: 'страница робокассы — 500', live: true },
  { kind: 'remark', area: 'panel', title: 'Якорь в сайдбаре — неправильный приём', ivan: 'это неправильно делать якорем', goal: 'в сайдбаре ни одного пункта с якорем', acceptance: 'на живой панели ни одной ссылки вида settings#wb' },
] })

const { indexAll } = await import('./index.mjs')
const { open, escalationsLog, answersDir } = await import('./db.mjs')
const { dropPrompt, runOnce, setVerdict, thread, verdictOf } = await import('./operator.mjs')
indexAll()
const db = open()

test('--once: два вопроса получают документ, баг остаётся карточкой', () => {
  dropPrompt('1. почему не взяли модуль интеграций gorgojs? 2. где результат по done задачам? 3. страница робокассы — 500', 'ui')
  const out = runOnce({ db })
  assert.equal(out.length, 1)
  const recs = db.prepare('select * from records order by ts').all()
  assert.equal(recs.length, 4)
  const answered = recs.filter((r) => r.status === 'answered')
  assert.equal(answered.length, 2, 'отвечены ровно два вопроса: ' + recs.map((r) => `${r.kind}=${r.status}`).join(' '))
  const bug = recs.find((r) => r.kind === 'bug')
  assert.equal(bug.status, 'awaiting-ivan', 'баг не «отвечается» — он ждёт кнопки Ивана (§9)')
  assert.equal(db.prepare('select count(*) c from answers where record_id = ?').get(bug.id).c, 0)
  for (const r of answered) {
    const a = db.prepare('select * from answers where record_id = ?').get(r.id)
    assert.ok(fs.existsSync(a.doc_path), 'документ написан на диск')
    const md = fs.readFileSync(a.doc_path, 'utf8')
    assert.match(md, /\*\*Уровень:\*\* script/)
    assert.match(md, /гейт:\*\* зелёный/)
    assert.equal(JSON.parse(a.gate).ok, true)
  }
})

test('полное замечание доезжает до пачки штаба (v1 intake остаётся живым), неполный баг — с честным отказом', () => {
  const inbox = JSON.parse(fs.readFileSync(path.join(process.env.INTAKE_HOME, 'inbox.json'), 'utf8'))
  assert.equal(inbox.length, 1, 'в пачку взято ровно замечание с целью и приёмкой')
  assert.equal(inbox[0].kind, 'remark')
  const bug = db.prepare("select * from records where kind = 'bug'").get()
  assert.equal(bug.intake_id, null)
  assert.match(bug.notes, /в пачку штаба не взято/, 'отказ intake не проглочен, он виден в карточке')
})

test('промпт обработан ровно один раз: файл уехал в prompts/done', () => {
  const left = fs.readdirSync(path.join(path.dirname(process.env.OPERATOR_DB), 'prompts')).filter((f) => f.endsWith('.json'))
  assert.equal(left.length, 0)
  assert.equal(runOnce({ db }).length, 0)
})

test('«ок» и «не то» пишут verdict_ivan, «не то» даёт строку эскалации', () => {
  const [a, b] = db.prepare("select id from records where status = 'answered' order by ts").all()
  setVerdict(db, a.id, 'ok')
  assert.equal(db.prepare('select verdict_ivan v from records where id = ?').get(a.id).v, 'ok')
  const before = fs.existsSync(escalationsLog()) ? fs.readFileSync(escalationsLog(), 'utf8').split('\n').length : 0
  setVerdict(db, b.id, 'wrong')
  assert.equal(db.prepare('select verdict_ivan v from records where id = ?').get(b.id).v, 'wrong')
  const after = fs.readFileSync(escalationsLog(), 'utf8').trimEnd().split('\n')
  assert.ok(after.length > before - 1)
  assert.match(after.at(-1), new RegExp(`${b.id}.*script → haiku`))
  assert.equal(db.prepare('select count(*) c from escalations where record_id = ?').get(b.id).c, 1)
})

test('слова вердикта: «не то» ≠ «ок»', () => {
  assert.equal(verdictOf('не то'), 'wrong')
  assert.equal(verdictOf('ок'), 'ok')
  assert.equal(verdictOf('в очередь'), 'queue')
  assert.equal(verdictOf('делай'), 'ok')
})

test('лента для UI: промпт, его записи и последний ответ по каждой', () => {
  const t = thread(db, 10)
  assert.equal(t.length, 1)
  const withDoc = t[0].records.filter((r) => r.answer && r.answer.gate.ok)
  assert.equal(withDoc.length, 2)
  assert.equal(t[0].records.length, 4)
  assert.ok(withDoc[0].answer.sources.length >= 1)
  assert.match(t[0].text, /где результат по done задачам/)
})

test('провал разбора не роняет цикл: запись всё равно появляется', async () => {
  const fs2 = await import('node:fs')
  const stub = path.join(root, 'claude-dead.sh')
  fs2.writeFileSync(stub, '#!/bin/sh\ncat > /dev/null\necho "OAuth session expired" >&2\nexit 1\n', { mode: 0o755 })
  process.env.OPERATOR_CLAUDE = stub
  const mod = await import('./operator.mjs?stub=dead')
  mod.dropPrompt('какой-то вопрос Ивана, который разобрать не вышло', 'ui')
  mod.runOnce({ db })
  const r = db.prepare("select * from records order by ts desc limit 1").get()
  assert.match(r.notes, /parse=fallback/)
  assert.ok(fs.existsSync(path.join(answersDir(), `${r.id}.md`)), 'лента не остаётся пустой')
})

test.after(() => { db.close(); cleanup(root) })
