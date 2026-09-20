// Уровень «скрипт»: пассажи по русскому вопросу и три типовых документа на фикстурах штаба.
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { tmpRoot, makeCorpus, makeConfig, makeDayDir, cleanup } from './testkit.mjs'

const root = tmpRoot('ask')
const corpus = makeCorpus(root)
const day = makeDayDir(root)
process.env.OPERATOR_CORPUS = makeConfig(root, corpus, day)
process.env.OPERATOR_DB = path.join(root, 'operator.db')

const { indexAll } = await import('./index.mjs')
const { stems, passages, askPassages, askStatus, askWhere, askHowto, pickQuote } = await import('./ask.mjs')
const { gate } = await import('./gate.mjs')
indexAll()

test('основы слов: вопросительные слова выброшены, длинные обрезаны до шести знаков', () => {
  assert.deepEqual(stems('почему не использовали модуль интеграций gorgojs'), ['исполь', 'модуль', 'интегр', 'gorgoj'])
})

test('пассажи по вопросу: находит раздел «Решение», цитата дословна', () => {
  const r = passages('почему не взяли модуль интеграций gorgojs')
  assert.ok(r.passages.length >= 1, 'хотя бы один пассаж: ' + r.mode)
  assert.ok(r.passages.some((p) => p.path.endsWith('wb.md')))
  assert.ok(r.passages[0].quote.length >= 20)
})

test('ответ пассажами проходит гейт', () => {
  const a = askPassages('почему не взяли модуль интеграций gorgojs')
  const g = gate(a)
  assert.equal(g.ok, true, g.reasons.join(' · '))
  assert.equal(a.level, 'script')
})

test('типовой документ «статус»: считает по статусам, видит задачу в работе и события', () => {
  const a = askStatus('что в очереди дня')
  const g = gate(a)
  assert.equal(g.ok, true, g.reasons.join(' · '))
  assert.match(a.doc_md, /merged \| 1/)
  assert.match(a.doc_md, /p02-run/)
  assert.match(a.doc_md, /событие журнала диспетчера/)
  assert.ok(a.sources.some((s) => s.path.endsWith('tasks.json')))
})

test('типовой документ «где результат»: PR, отчёт и карточка отчёта', () => {
  const a = askWhere(null, 'где результат по done задачам')
  const g = gate(a)
  assert.equal(g.ok, true, g.reasons.join(' · '))
  assert.match(a.doc_md, /p01-demo/)
  assert.match(a.doc_md, /pull\/100/)
  assert.ok(a.sources.some((s) => s.path.endsWith('report.json')) || a.sources.some((s) => s.path.endsWith('REPORT.md')))
  assert.ok(!/p02-run/.test(a.doc_md), 'незавершённая задача в выборку done не попадает')
})

test('типовой документ «как»: указатель на .private без единого знака содержимого', () => {
  const a = askHowto('как попасть в админку')
  const g = gate(a)
  assert.equal(g.ok, true, g.reasons.join(' · '))
  assert.ok(a.pointers.length >= 1, 'указатель на файл с доступами')
  assert.ok(a.pointers.every((p) => p.path.includes('.private')))
  assert.ok(!a.doc_md.includes('ne-chitat'), 'содержимое .private в документ не попадает')
  assert.ok(!a.sources.some((s) => s.path.includes('.private')), '.private источником не бывает')
})

test('дословный кусок файла: то, что вернул pickQuote, есть в файле', () => {
  const f = path.join(day, 'tasks.json')
  const q = pickQuote(f, 'p01-demo')
  assert.ok(q.length >= 20)
  assert.ok(fs.readFileSync(f, 'utf8').includes(q))
})

test.after(() => cleanup(root))
