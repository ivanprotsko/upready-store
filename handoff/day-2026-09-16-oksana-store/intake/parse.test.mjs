// Разбор промпта haiku по схеме. Главное, что проверяется, — ПРОВАЛ: он никогда не молчит (правило 20a).
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { tmpRoot, makeClaudeStub, cleanup } from './testkit.mjs'

const root = tmpRoot('parse')
const { buildPrompt, fallbackRecords } = await import('./parse.mjs')

test('пакет контекста собирает СКРИПТ: последние записи потока едут в промпт', () => {
  const p = buildPrompt('тот вопрос про робокассу', [{ kind: 'fact', area: 'integrations', title: 'Робокасса на чекауте', ivan: 'почему робокасса не на чекауте' }])
  assert.match(p, /КОНТЕКСТ ПОТОКА/)
  assert.match(p, /Робокасса на чекауте/)
  assert.match(p, /тот вопрос про робокассу/)
  assert.match(buildPrompt('первый'), /пусто, это первое сообщение/)
})

test('заглушка ответа при провале: одна запись, дословный текст Ивана, причина в notes', () => {
  const r = fallbackRecords('Первое предложение вопроса Ивана. Второе предложение.', 'OAuth session expired')
  assert.equal(r.length, 1)
  assert.equal(r[0].kind, 'fact')
  assert.equal(r[0].parse, 'fallback')
  assert.equal(r[0].ivan, 'Первое предложение вопроса Ивана. Второе предложение.')
  assert.equal(r[0].title, 'Первое предложение вопроса Ивана')
  assert.match(r[0].notes, /OAuth session expired/)
})

test('claude упал с ненулевым кодом → fallback, ошибка названа, молчания нет', async () => {
  process.env.OPERATOR_CLAUDE = makeClaudeStub(root, { exitCode: 1, stderr: 'OAuth session expired' })
  const mod = await import('./parse.mjs?stub=fail')
  const r = mod.parsePrompt('где результат по задачам?')
  assert.equal(r.parse, 'fallback')
  assert.equal(r.records.length, 1)
  assert.match(r.error, /OAuth session expired/)
  assert.match(r.records[0].notes, /OAuth session expired/)
})

test('claude вернул не JSON → fallback', async () => {
  const fs = await import('node:fs')
  const f = path.join(root, 'claude-garbage.sh')
  fs.writeFileSync(f, '#!/bin/sh\ncat > /dev/null\necho "не джейсон вовсе"\n', { mode: 0o755 })
  process.env.OPERATOR_CLAUDE = f
  const mod = await import('./parse.mjs?stub=garbage')
  const r = mod.parsePrompt('вопрос')
  assert.equal(r.parse, 'fallback')
  assert.equal(r.error, 'non-json')
})

test('claude вернул записи по схеме → они и едут дальше, usage сохраняется', async () => {
  process.env.OPERATOR_CLAUDE = makeClaudeStub(root, { records: [{ kind: 'where', area: 'panel', title: 'Где результат по задачам дня', ivan: 'где результат?' }] })
  const mod = await import('./parse.mjs?stub=ok')
  const r = mod.parsePrompt('где результат?')
  assert.equal(r.parse, 'haiku')
  assert.equal(r.records[0].kind, 'where')
  assert.equal(r.records[0].parse, 'haiku')
  assert.equal(r.usage.output_tokens, 22)
})

test.after(() => cleanup(root))
