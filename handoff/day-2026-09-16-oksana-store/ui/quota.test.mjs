// Политика квоты раннера agy (заказ Ивана 0.1, 2026-09-18 04:53 WITA): разбор `agy -p "/usage"` по живой фикстуре
// (fixtures/agy-usage.tsv — снимок 2026-09-17T19:34:56Z, первая и последняя строки — обёртка замера, не вывод agy), пул по модели, решение run/wait/delegate.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAgyUsage, agyPool, agyQuotaDecision, agyParseLog as parseLog } from '../lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = fs.readFileSync(path.join(here, 'fixtures', 'agy-usage.tsv'), 'utf8')

test('parseAgyUsage: два пула, пятичасовой и недельный остаток с моментом сброса', () => {
  const p = parseAgyUsage(fixture)
  assert.deepEqual(Object.keys(p).sort(), ['Claude and GPT models', 'Gemini Models'])
  assert.deepEqual(p['Gemini Models'].fiveHour, { pct: 100, resetAt: '2026-09-18T00:34:13Z' })
  assert.deepEqual(p['Gemini Models'].weekly, { pct: 99, resetAt: '2026-09-24T14:34:13Z' })
  assert.deepEqual(p['Claude and GPT models'].fiveHour, { pct: 91, resetAt: '2026-09-17T22:23:30Z' })
  assert.equal(p['Claude and GPT models'].weekly.pct, 97)
})

test('parseAgyUsage: чужие строки (момент замера, rc=, пустые, без процента) пропускаются', () => {
  assert.deepEqual(parseAgyUsage('2026-09-17T19:34:56Z\nrc=0\n\nA\tB\tC\tD\nGemini Models\tFive Hour Limit Remaining\t7 %\t2026-09-18T00:34:13Z\n'), { 'Gemini Models': { fiveHour: { pct: 7, resetAt: '2026-09-18T00:34:13Z' } } })
  assert.deepEqual(parseAgyUsage(''), {})
  assert.deepEqual(parseAgyUsage(null), {})
})

test('agyPool: gemini-* → Gemini Models, claude/gpt-oss → Claude and GPT models', () => {
  assert.equal(agyPool('gemini-3.1-pro-high'), 'Gemini Models')
  assert.equal(agyPool('gemini-3.8-flash-low'), 'Gemini Models')
  assert.equal(agyPool('claude-sonnet-4-6'), 'Claude and GPT models')
  assert.equal(agyPool('gpt-oss-120b-medium'), 'Claude and GPT models')
})

test('agyQuotaDecision: квота ≥ порога или прибор молчит → run', () => {
  assert.equal(agyQuotaDecision({ pct: 10, minPct: 10 }).action, 'run')
  assert.equal(agyQuotaDecision({ pct: 100, minPct: 10, waitOk: true }).action, 'run')
  assert.equal(agyQuotaDecision({ pct: null, minPct: 10 }).action, 'run')
  assert.equal(agyQuotaDecision({ pct: undefined }).action, 'run')
})

test('agyQuotaDecision: ниже порога и waitOk → wait с wakeAt = плановый сброс', () => {
  const now = Date.parse('2026-09-17T21:00:00Z')
  const d = agyQuotaDecision({ pct: 3, resetAt: '2026-09-17T22:23:30Z', minPct: 10, waitOk: true, now })
  assert.equal(d.action, 'wait')
  assert.equal(d.wakeAt, '2026-09-17T22:23:30.000Z')
})

test('agyQuotaDecision: сброс уже в прошлом или неизвестен → wait через 10 минут от now', () => {
  const now = Date.parse('2026-09-18T01:00:00Z')
  assert.equal(agyQuotaDecision({ pct: 0, resetAt: '2026-09-18T00:34:13Z', minPct: 10, waitOk: true, now }).wakeAt, '2026-09-18T01:10:00.000Z')
  assert.equal(agyQuotaDecision({ pct: 0, resetAt: null, minPct: 10, waitOk: true, now }).wakeAt, '2026-09-18T01:10:00.000Z')
})

test('agyQuotaDecision: ниже порога и ждать нельзя → delegate', () => {
  const d = agyQuotaDecision({ pct: 9, resetAt: '2026-09-18T00:34:13Z', minPct: 10, waitOk: false })
  assert.equal(d.action, 'delegate')
  assert.match(d.reason, /9% < 10%/)
})

test('agyParseLog: JSON-строка print-режима → текст ответа + метаданные, RESULT ищется по тексту', () => {
  const raw = '===== start x runner=agy =====\n{"conversation_id":"5b4bb4cb-9466-4b72-a68b-c9e022e4e860","status":"SUCCESS","response":"ПРИВЕТ\\nRESULT: OK\\n","duration_seconds":2.316601,"num_turns":1,"usage":{"input_tokens":13291,"output_tokens":8,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":13299}}\n\nAGY_RC=0\n'
  const { text, meta } = parseLog(raw)
  assert.equal(meta.conversation, '5b4bb4cb-9466-4b72-a68b-c9e022e4e860')
  assert.equal(meta.status, 'SUCCESS')
  assert.equal(meta.usage.total_tokens, 13299)
  const m = text.match(/RESULT:\s*(OK|FAIL)[^\n]*/g)
  assert.deepEqual(m, ['RESULT: OK'])
  assert.match(text, /AGY_RC=0/)
  assert.deepEqual(parseLog('нет json\nRESULT: FAIL x').meta, null)
})
