// node --test intake.test.mjs — стандарт записи, проверка путей, дедупликация, детерминированная склейка пачек
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'))
process.env.INTAKE_HOME = home
process.env.INTAKE_ROOT = home
process.env.INTAKE_TASKS = path.join(home, 'tasks.json')
process.env.INTAKE_FEATURES = path.join(home, 'features.json')
fs.writeFileSync(process.env.INTAKE_TASKS, JSON.stringify({ tasks: [{ id: 't-old', title: 'Реорганизация настроек панели интеграций сайдбар' }] }))
fs.writeFileSync(process.env.INTAKE_FEATURES, JSON.stringify([{ id: 'checkout-form', name_ru: 'Оформление заказа (форма с контактами)', name_en: 'Checkout form', insales: { count: 1 }, tilda: { count: 21 } }]))
fs.writeFileSync(path.join(home, 'exists.txt'), 'x')
const M = await import('./intake.mjs')

const base = { kind: 'task', area: 'checkout', title: 'Форма оформления заказа: подсказка адреса', ivan: 'нужна подсказка адреса на чекауте', goal: 'подсказка адреса', acceptance: 'ввод 3 букв даёт список', refs: ['exists.txt', 'nope/missing.ts'] }

test('validate: отказ без области и без приёмки', () => {
  assert.ok(M.validate({ ...base, area: 'кухня' }).some((e) => e.startsWith('area')))
  assert.ok(M.validate({ ...base, acceptance: '' }).some((e) => e.includes('acceptance')))
  assert.equal(M.validate({ kind: 'question', area: 'engine', title: 'Почему не gorgojs?', ivan: 'почему не gorgojs' }).length, 0)
})

test('add: пути проверяются на диске, конкуренты из реестра, статус new', () => {
  const { record: r } = M.add(base)
  assert.deepEqual(r.refs, ['exists.txt']); assert.deepEqual(r.refsMissing, ['nope/missing.ts'])
  assert.equal(r.competitors.feature, 'checkout-form'); assert.equal(r.competitors.tilda, 21)
  assert.equal(r.status, 'new'); assert.equal(r.urgent, false)
})

test('add: дубль по заголовку помечается, точный повтор отвергается', () => {
  const { record: r } = M.add({ ...base, title: 'Реорганизация настроек панели интеграций и сайдбара', area: 'panel', goal: 'g', acceptance: 'a', refs: [] })
  assert.ok(r.dup.includes('t-old'))
  assert.ok(M.add(base).error[0].includes('уже ждёт'))
})

test('batch: две записи одной области не склеиваются, три — склеиваются, вопрос уходит сразу', () => {
  assert.equal(M.planBatches(M.loadInbox()).length, 0)
  M.add({ ...base, title: 'Карта пунктов выдачи на чекауте показывает Москву', refs: [] })
  M.add({ ...base, title: 'Курьерская доставка: срок в днях склоняется', refs: [] })
  const plans = M.planBatches(M.loadInbox())
  assert.deepEqual(plans.map((p) => [p.area, p.ids.length, p.urgent]), [['checkout', 3, false]])
  M.add({ kind: 'question', area: 'engine', title: 'Почему не gorgojs модуль?', ivan: 'почему не gorgojs' })
  const p2 = M.planBatches(M.loadInbox())
  assert.ok(p2.some((p) => p.urgent && p.ids.length === 1 && p.reason === 'вопрос'))
})

test('batch: одиночная запись старше 120 мин уходит сама; cap 7', () => {
  const inbox = M.loadInbox(); const lone = inbox.find((r) => r.area === 'panel'); lone.ts = new Date(Date.now() - 130 * 60000).toISOString()
  assert.ok(M.planBatches(inbox).some((p) => p.area === 'panel' && p.reason.startsWith('ждёт')))
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, ts: new Date().toISOString(), kind: 'task', area: 'content', title: `t${i}`, goal: 'g', acceptance: 'a', priority: 2, urgent: false, status: 'new' }))
  assert.equal(M.planBatches(many)[0].ids.length, M.RULES.maxBatch)
})

test('batch(): пишет файл пачки, строку в batches.log и переводит записи в batched', () => {
  const lines = M.batch()
  assert.ok(lines.length >= 2)
  const log = fs.readFileSync(path.join(home, 'batches.log'), 'utf8').trim().split('\n')
  assert.equal(log.length, lines.length)
  for (const l of lines) assert.ok(fs.existsSync(l.split(' ').at(-1)))
  // одиночная свежая запись panel (её «старение» выше было только в памяти) законно остаётся new
  const left = M.loadInbox().filter((r) => r.status === 'new')
  assert.deepEqual(left.map((r) => r.area), ['panel'])
  assert.equal(M.batch().length, 0)
})
