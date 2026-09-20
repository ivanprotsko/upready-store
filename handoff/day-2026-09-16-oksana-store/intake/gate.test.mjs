// Гейт §5: один и тот же судья для любого уровня. Зелёный только когда ВСЕ правила выполнены.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpRoot, makeCorpus, makeConfig, cleanup } from './testkit.mjs'

const root = tmpRoot('gate')
const corpus = makeCorpus(root)
process.env.OPERATOR_CORPUS = makeConfig(root, corpus)
process.env.OPERATOR_DB = path.join(root, 'operator.db')

const { gate, pathsInDoc, forbidden } = await import('./gate.mjs')
const src = path.join(corpus, 'docs', 'wb.md')
const QUOTE = 'Модуль интеграций gorgojs не взяли: учётки на инстанс, а не на магазин.'
const good = () => ({
  answered: true, kind: 'fact', level: 'script', question: 'почему не взяли модуль gorgojs',
  doc_md: `# Ответ\n\n[wb.md](file://${src}) · запись от 2026-09-16\n\n> ${QUOTE}\n\n` + 'Пояснение оператора, чтобы документ был длиннее двухсот знаков и правило 3 проверялось по делу, а не по длине заглушки.',
  sources: [{ path: src, heading: 'Решение', date: '2026-09-16', quote: QUOTE }], pointers: [], live: [], not_found: [],
})

test('зелёный на честном ответе', () => { const r = gate(good()); assert.equal(r.ok, true, r.reasons.join(' · ')) })

test('правило 1: без источников — красный', () => {
  const a = good(); a.sources = []
  assert.match(gate(a).reasons.join(' '), /правило 1/)
})

test('правило 1: источник вне корпуса — красный', () => {
  const outside = path.join(root, 'outside.md')
  fs.writeFileSync(outside, QUOTE + '\n')
  const a = good(); a.sources = [{ path: outside, quote: QUOTE }]
  assert.match(gate(a).reasons.join(' '), /вне корпуса/)
})

test('правило 2: цитата, которой нет в файле дословно — красный', () => {
  const a = good(); a.sources[0].quote = 'Модуль интеграций gorgojs взяли и всё заработало сразу же.'
  assert.match(gate(a).reasons.join(' '), /не найдена в файле дословно/)
})

test('правило 2: цитата короче 20 знаков — красный', () => {
  const a = good(); a.sources[0].quote = 'Модуль gorgojs'
  assert.match(gate(a).reasons.join(' '), /короче 20/)
})

test('правило 3: документ короче 200 знаков — красный', () => {
  const a = good(); a.doc_md = `# Ответ\n\n> ${QUOTE}\n`
  assert.match(gate(a).reasons.join(' '), /короче 200/)
})

test('правило 3: путь, которого нет ни в источниках, ни в указателях — красный', () => {
  const a = good(); a.doc_md += '\n\nПодробности в /Users/ivanprotsko/upready/ничего-такого/выдумка.md\n'
  assert.match(gate(a).reasons.join(' '), /путь вне источников/)
})

test('правило 3: путь ВНУТРИ проверенной цитаты претензией уровня не считается', () => {
  const file = path.join(corpus, 'docs', 'paths.md')
  const q = 'Копии документации лежат в artifacts/docs/w01-wb-readonly-client/docs и там их искать.'
  fs.writeFileSync(file, '# Копии\n\n' + q + '\n')
  const a = good()
  a.sources = [{ path: file, heading: 'Копии', quote: q }]
  a.doc_md = `# Ответ\n\n[paths.md](file://${file})\n\n> ${q}\n\n` + 'Пояснение оператора длиной больше двухсот знаков, чтобы правило три проверяло пути, а не длину этого текста-заглушки для теста.'
  assert.equal(gate(a).ok, true, gate(a).reasons.join(' · '))
})

test('правило 3: указатель на .private проверяется на существование, но цитаты не требует', () => {
  const a = good()
  const ptr = path.join(corpus, '.private', 'owner.md')
  a.pointers = [{ path: ptr, why: 'доступы' }]
  a.doc_md += `\n\n- [owner.md](file://${ptr}) — открыть самому\n`
  assert.equal(gate(a).ok, true, gate(a).reasons.join(' · '))
  a.pointers = [{ path: path.join(corpus, '.private', 'net-takogo.md') }]
  assert.match(gate(a).reasons.join(' '), /указатель ведёт в никуда/)
})

test('правило 4: kind=live без ts — красный, со свежим ts — зелёный', () => {
  const a = good(); a.kind = 'live'
  a.live = [{ cmd: 'curl', result: '200 0.3' }]
  assert.match(gate(a).reasons.join(' '), /правило 4/)
  a.live = [{ cmd: 'curl', result: '200 0.3', ts: new Date().toISOString() }]
  assert.equal(gate(a).ok, true, gate(a).reasons.join(' · '))
  a.live = [{ cmd: 'curl', result: '200 0.3', ts: new Date(Date.now() - 3600e3).toISOString() }]
  assert.match(gate(a).reasons.join(' '), /не этого прогона/)
})

test('запретная зона: .private, .env и стенограммы — всегда, журнал диспетчера — нет', () => {
  assert.equal(forbidden('/a/.private/x.md'), true)
  assert.equal(forbidden('/a/.env.local'), true)
  assert.equal(forbidden('/a/sessions/abc.jsonl'), true)
  assert.equal(forbidden('/a/day/logs/dispatcher.jsonl'), false)
})

test('разбор путей: слэш-команда и проза путями не считаются', () => {
  const p = pathsInDoc('Промпт на /compact, маршрут ask/gate, модель opus/high, ветка feat/day16-operator-v1 и файл artifacts/docs/x/report.md')
  assert.deepEqual(p, ['artifacts/docs/x/report.md'])
})

test.after(() => cleanup(root))
