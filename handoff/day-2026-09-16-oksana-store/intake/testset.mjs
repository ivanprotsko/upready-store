#!/usr/bin/env node
// testset.mjs — приёмочная таблица Э1 по ШЕСТИ реальным вопросам дня (OPERATOR-SPEC §8).
// Число дешевле кадра там, где критерий — число (правило 47): приёмщик перезапускает одну команду
// и читает вопрос → тип → уровень → секунды → источники → найден ли ОЖИДАЕМЫЙ источник.
// CLI: testset.mjs [--json]
import { open } from './db.mjs'

export const QUESTIONS = [
  { ts: '07:03', q: 'где результат по done задачам?', expect: ['/REPORT.md', '2026-09-16-0809-7b183b97.md', '/report.md', '/report.json'] },
  { ts: '07:04', q: 'какие локальные адреса стендов, что сейчас поднято локально?', expect: ['/upready/memory/', '/.ai/resume/upready-store/'] },
  { ts: '07:06', q: 'как попасть в админку?', expect: ['/upready/memory/', '/.ai/resume/upready-store/'] },
  { ts: '07:08', q: 'документацию WB мы ведь сохраняли локально ранее, почему её не используют?', expect: ['INTAKE.md', 'w01-wb-readonly-client', 'w10-marketplace-spec', '_worker-preamble.md', '2026-09-16-0809-7b183b97.md'] },
  { ts: '08:31', q: 'почему интеграции robokassa и apiship от gorgojs.com взяли не через модуль интеграций?', expect: ['i01-robokassa-checkout', 'i02-apiship-cdek-shipping', 'INTAKE.md'] },
  { ts: '20:22', q: 'что насчёт модуля интеграции от gorgojs, почему не использовали', expect: ['i01-robokassa-checkout', 'i02-apiship-cdek-shipping', 'INTAKE.md'] },
]

// Единица приёмки — ВОПРОС, а не запись: haiku законно разбивает один вопрос на две записи
// («какие адреса стендов, что поднято локально» → howto + status), и ожидаемый источник должен найтись
// у промпта, а не у каждой его половины. Гейт при этом обязан быть зелёным у ВСЕХ записей вопроса.
const db = open()
const rows = []
for (const item of QUESTIONS) {
  const p = db.prepare('select id, text, parse, seconds from prompts where text = ? order by ts desc limit 1').get(item.q)
  if (!p) { rows.push({ ts: item.ts, q: item.q, miss: 'промпта с таким текстом в базе нет' }); continue }
  const recs = []
  for (const r of db.prepare('select * from records where prompt_id = ? order by ts').all(p.id)) {
    const a = db.prepare('select * from answers where record_id = ? order by ts desc limit 1').get(r.id)
    let sources = [], gateOk = null
    try { sources = a ? JSON.parse(a.sources) : [] } catch {}
    try { gateOk = a ? JSON.parse(a.gate).ok : null } catch {}
    recs.push({ id: r.id, kind: r.kind, status: r.status, level: a?.level || '—', gate: gateOk, seconds: a?.seconds ?? 0, sources: sources.map((s) => s.path) })
  }
  const all = recs.flatMap((r) => r.sources)
  const hit = item.expect.filter((e) => all.some((s) => String(s).includes(e)))
  rows.push({ ts: item.ts, q: item.q, parse: p.parse, parseSeconds: p.seconds, records: recs,
    kinds: recs.map((r) => r.kind), levels: [...new Set(recs.map((r) => r.level))],
    green: recs.length > 0 && recs.every((r) => r.gate === true),
    answerSeconds: recs.reduce((s, r) => s + (r.seconds || 0), 0), sources: all.length, expect: item.expect, expectHit: hit })
}
db.close()

if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0) }
console.log('| вопрос (WITA) | записей (kind) | уровень | гейт | разбор, с | ответ, с | источников | ожидаемый источник найден |')
console.log('|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  if (r.miss) { console.log(`| ${r.ts} ${r.q.slice(0, 44)} | — | — | — | — | — | — | ${r.miss} |`); continue }
  console.log(`| ${r.ts} ${r.q.slice(0, 44)} | ${r.records.length} (${r.kinds.join(', ')}) | ${r.levels.join(', ')} | ${r.green ? 'зелёный' : 'КРАСНЫЙ'} | ${(r.parseSeconds ?? 0).toFixed(1)} | ${r.answerSeconds.toFixed(1)} | ${r.sources} | ${r.expectHit.length ? 'да: ' + r.expectHit.join(', ') : 'НЕТ'} |`)
}
const bad = rows.filter((r) => r.miss || !r.green || !r.expectHit.length)
console.log(`\nвопросов ${rows.length} · зелёных с ожидаемым источником ${rows.length - bad.length} · требуют внимания ${bad.length}`)
process.exit(bad.length ? 1 : 0)
