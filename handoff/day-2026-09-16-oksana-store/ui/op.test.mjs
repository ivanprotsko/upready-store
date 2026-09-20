// Маршруты страницы «Оператор» на фикстурах: приём промпта, лента, документ, вердикт,
// и главное — /api/file отдаёт источник из корпуса и НЕ отдаёт ничего из .private.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpRoot, makeCorpus, makeConfig, makeDayDir, makeClaudeStub, cleanup } from '../intake/testkit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const root = tmpRoot('ui-op')
const corpus = makeCorpus(root)
const day = makeDayDir(root)
const corpusCfg = makeConfig(root, corpus, day)
const dbFile = path.join(root, 'operator.db')
const env = {
  ...process.env,
  OPERATOR_CORPUS: corpusCfg,
  OPERATOR_DB: dbFile,
  INTAKE_HOME: path.join(root, 'intake-home'),
  OPERATOR_CLAUDE: makeClaudeStub(root, { records: [{ kind: 'fact', area: 'integrations', title: 'Почему не взяли модуль интеграций gorgojs', ivan: 'почему не взяли модуль интеграций gorgojs?' }] }),
}
fs.mkdirSync(env.INTAKE_HOME, { recursive: true })

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 15000) { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v } catch {} if (Date.now() - t0 > ms) throw new Error('не дождались'); await wait(200) } }

process.env.OPERATOR_CORPUS = corpusCfg
process.env.OPERATOR_DB = dbFile
process.env.OPERATOR_CLAUDE = env.OPERATOR_CLAUDE
process.env.INTAKE_HOME = env.INTAKE_HOME
const { indexAll } = await import('../intake/index.mjs')
const { open } = await import('../intake/db.mjs')
const { runOnce } = await import('../intake/operator.mjs')
indexAll()

const PORT = await freePort()
const srv = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { env: { ...env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
const base = `http://127.0.0.1:${PORT}`
await until(async () => (await fetch(base + '/api/op/thread')).ok)

test('POST /api/op/prompt кладёт промпт, лента показывает его и запись с документом', async () => {
  const r = await (await fetch(base + '/api/op/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'почему не взяли модуль интеграций gorgojs?' }) })).json()
  assert.ok(r.id && fs.existsSync(r.file))
  const db = open(); runOnce({ db }); db.close()
  const t = (await (await fetch(base + '/api/op/thread')).json()).thread
  assert.equal(t.length, 1)
  assert.match(t[0].text, /gorgojs/)
  assert.equal(t[0].records.length, 1)
  const rec = t[0].records[0]
  assert.equal(rec.answer.gate.ok, true)
  const md = await (await fetch(base + '/api/op/answer?id=' + encodeURIComponent(rec.id))).text()
  assert.match(md, /\*\*Уровень:\*\* script/)
  assert.ok(rec.answer.sources.length >= 1)
})

test('POST /api/op/prompt с пустым текстом — 400', async () => {
  assert.equal((await fetch(base + '/api/op/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '  ' }) })).status, 400)
})

test('POST /api/op/verdict пишет вердикт, чужой вердикт отбивается', async () => {
  const t = (await (await fetch(base + '/api/op/thread')).json()).thread
  const id = t[0].records[0].id
  const ok = await fetch(base + '/api/op/verdict', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record_id: id, verdict: 'ok' }) })
  assert.equal(ok.status, 200)
  const t2 = (await (await fetch(base + '/api/op/thread')).json()).thread
  assert.equal(t2[0].records[0].verdict_ivan, 'ok')
  assert.equal((await fetch(base + '/api/op/verdict', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record_id: id, verdict: 'может быть' }) })).status, 400)
})

test('/api/file отдаёт источник из корпуса и НЕ отдаёт .private и .env', async () => {
  const src = path.join(corpus, 'docs', 'wb.md')
  const r = await fetch(base + '/api/file?f=' + encodeURIComponent(src))
  assert.equal(r.status, 200)
  assert.match(await r.text(), /Сопоставление карточек/)
  for (const bad of [path.join(corpus, '.private', 'owner.md'), path.join(corpus, 'docs', '.env.local'), path.join(corpus, 'docs', 'session.jsonl')]) {
    assert.equal((await fetch(base + '/api/file?f=' + encodeURIComponent(bad))).status, 404, bad)
  }
})

test('каждая ссылка «источник» из ленты открывается по /api/file', async () => {
  const t = (await (await fetch(base + '/api/op/thread')).json()).thread
  for (const s of t[0].records[0].answer.sources) {
    assert.equal((await fetch(base + '/api/file?f=' + encodeURIComponent(s.path))).status, 200, s.path)
  }
})

test.after(() => { srv.kill('SIGTERM'); cleanup(root) })
