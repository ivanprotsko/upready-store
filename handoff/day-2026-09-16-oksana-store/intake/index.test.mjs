// Индекс корпуса: русские словоформы находятся, секрет замаскирован, запретные зоны не читаются вовсе.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpRoot, makeCorpus, makeConfig, cleanup } from './testkit.mjs'

const root = tmpRoot('index')
const corpus = makeCorpus(root)
process.env.OPERATOR_CORPUS = makeConfig(root, corpus)
process.env.OPERATOR_DB = path.join(root, 'operator.db')

const { indexAll, maskSecrets, sections, MASK } = await import('./index.mjs')
const { open } = await import('./db.mjs')

test('маска секретов: имя переменной остаётся, значение — нет', () => {
  const m = maskSecrets('WB_API_KEY=ochen-sekretnoe-123 и MEDUSA_BACKEND_URL=http://x', 'TOKEN|SECRET|API_KEY|PASS')
  assert.ok(m.includes('WB_API_KEY='), 'имя переменной должно уцелеть — по нему ищут')
  assert.ok(m.includes(MASK))
  assert.ok(!m.includes('ochen-sekretnoe-123'))
  assert.ok(m.includes('http://x'), 'не-секретные значения не трогаем')
})

test('разбор на разделы: заголовки и длинные тела', () => {
  const s = sections('# А\nтело а\n## Б\nтело б', 2000)
  assert.deepEqual(s.map((x) => x.heading), ['А', 'Б'])
  const long = sections('# А\n' + 'я'.repeat(4500), 2000)
  assert.equal(long.length, 3)
})

test('индекс: запретные зоны не попадают, русские формы находятся, значение секрета не лежит в базе', () => {
  const r = indexAll()
  assert.equal(r.files, 2, 'индексируются только два .md: .private, .env.local и .jsonl не читаются')
  const db = open()
  const paths = db.prepare('select path from corpus').all().map((x) => x.path)
  assert.ok(!paths.some((p) => p.includes('.private')))
  assert.ok(!paths.some((p) => p.endsWith('.jsonl') || p.includes('.env')))
  // trigram: запрос должен быть ПОДСТРОКОЙ, поэтому ищем основу 6 знаков
  const hit = db.prepare('select path, heading from corpus_fts where corpus_fts match ?').all('"сопост"')
  assert.ok(hit.length >= 1, 'русская словоформа «Сопоставление» находится по основе «сопост»')
  const bodies = db.prepare('select body from corpus_fts').all().map((x) => x.body).join('\n')
  assert.ok(!bodies.includes('ochen-sekretnoe-znachenie-123'), 'значение секрета в индекс не попало')
  assert.ok(bodies.includes('WB_API_KEY='), 'имя переменной в индексе осталось')
  db.close()
  const bytes = fs.readFileSync(process.env.OPERATOR_DB)
  assert.ok(!bytes.includes('ochen-sekretnoe-znachenie-123'), 'значения секрета нет и в БАЙТАХ базы')
})

test('инкрементальность: второй прогон не перечитывает неизменившиеся файлы', () => {
  const r = indexAll()
  assert.equal(r.changed, 0)
  fs.appendFileSync(path.join(corpus, 'docs', 'admin.md'), '\nдописали строку\n')
  assert.equal(indexAll().changed, 1)
})

test.after(() => cleanup(root))
