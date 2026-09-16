#!/usr/bin/env node
// parse.mjs — шаг 2 (OPERATOR-SPEC §2): свободный текст Ивана → записи по records.schema.json.
// Единственное место Э1, где работает модель, и самая дешёвая из доступных (haiku).
// Замер 2026-09-16: `--restricted --tools "" --no-session-persistence` даёт 8,6 с и $0,0147 против
// 32,2 с и $0,134 у того же вызова без них (тулы не грузятся в системный промпт) — в 9 раз дешевле.
// Провал вызова НИКОГДА не молчит (правило 20a): одна запись kind=fact с parse:"fallback" и текстом ошибки.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// Читаются в момент ВЫЗОВА, а не при загрузке модуля: иначе окружение резидента (и теста) уже не изменить,
// а подмена бинаря в кэшированном модуле молча остаётся старой — так провалился первый прогон теста.
export const claudeBin = () => process.env.OPERATOR_CLAUDE || path.join(process.env.HOME || '/Users/ivanprotsko', '.local/bin/claude')
export const model = () => process.env.OPERATOR_PARSE_MODEL || 'haiku'
export const timeoutMs = () => Number(process.env.OPERATOR_PARSE_TIMEOUT || 120000)

const firstSentence = (s) => {
  const t = String(s).trim().replace(/\s+/g, ' ')
  const m = /^(.{8,200}?)([.!?]\s|$)/.exec(t)
  return (m ? m[1] : t.slice(0, 200)).trim() || 'сообщение Ивана'
}

/** Пакет контекста собирает СКРИПТ, а не модель: последние записи потока для разрешения «тот вопрос про X». */
export function buildPrompt(text, recent = []) {
  const ctx = recent.length
    ? ['КОНТЕКСТ ПОТОКА (последние записи, от новых к старым):', ...recent.map((r, i) => `${i + 1}. [${r.kind}/${r.area}] ${r.title} — Иван: «${String(r.ivan || '').slice(0, 300)}»`), ''].join('\n')
    : 'КОНТЕКСТ ПОТОКА: пусто, это первое сообщение.\n'
  return `${ctx}\nСООБЩЕНИЕ ИВАНА (разбери его, дословный текст клади в поле ivan):\n"""\n${text}\n"""`
}

export function fallbackRecords(text, why) {
  return [{
    kind: 'fact', area: 'other', title: firstSentence(text), ivan: String(text).trim(),
    target: '', goal: '', acceptance: '', priority: 2, live: false, refs: [],
    notes: `разбор не состоялся: ${String(why).slice(0, 600)}`, parse: 'fallback',
  }]
}

/**
 * @returns {{records: object[], usage: object|null, parse: 'haiku'|'fallback', seconds: number, error: string|null, cost: number|null}}
 */
export function parsePrompt(text, { recent = [], schemaFile = path.join(HERE, 'records.schema.json'), systemFile = path.join(HERE, 'parse-system.md') } = {}) {
  const t0 = Date.now()
  const done = (o) => ({ usage: null, error: null, cost: null, ...o, seconds: (Date.now() - t0) / 1000 })
  let out
  try {
    // CLI сам не тянет мета-схему: `$schema: .../draft/2020-12/schema` он отвергает целиком
    // («no schema with key or ref»). В файле ссылку оставляем — её читают люди и тесты, — а в вызов не отдаём.
    const schemaObj = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
    delete schemaObj.$schema
    const schema = JSON.stringify(schemaObj)
    const system = fs.readFileSync(systemFile, 'utf8')
    const args = ['-p', '--model', model(), '--output-format', 'json', '--json-schema', schema,
      '--append-system-prompt', system, '--restricted', '--tools', '', '--no-session-persistence',
      '--strict-mcp-config', '--mcp-config', path.join(process.env.HOME || '', '.claude/mcp-profiles/none.json')]
    out = execFileSync(claudeBin(), args, { input: buildPrompt(text, recent), encoding: 'utf8', timeout: timeoutMs(), maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e) {
    const why = `${e.code || 'exit ' + (e.status ?? '?')}: ${String(e.stderr || e.stdout || e.message).slice(0, 400)}`
    return done({ records: fallbackRecords(text, why), parse: 'fallback', error: why })
  }
  let j
  try { j = JSON.parse(out) } catch { return done({ records: fallbackRecords(text, `не JSON: ${String(out).slice(0, 300)}`), parse: 'fallback', error: 'non-json' }) }
  if (j.is_error) return done({ records: fallbackRecords(text, `claude is_error: ${String(j.result || '').slice(0, 300)}`), parse: 'fallback', error: String(j.result || '').slice(0, 400), usage: j.usage || null })
  let body = j.structured_output
  if (!body) { try { body = JSON.parse(j.result) } catch { body = null } }
  const recs = Array.isArray(body?.records) ? body.records.filter((r) => r && r.kind && r.title) : []
  if (!recs.length) return done({ records: fallbackRecords(text, `модель не вернула ни одной записи: ${String(j.result || '').slice(0, 300)}`), parse: 'fallback', error: 'empty', usage: j.usage || null, cost: j.total_cost_usd ?? null })
  for (const r of recs) r.parse = 'haiku'
  return done({ records: recs, parse: 'haiku', usage: j.usage || null, cost: j.total_cost_usd ?? null })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = process.argv.slice(2).join(' ') || fs.readFileSync(0, 'utf8')
  const r = parsePrompt(text)
  console.log(JSON.stringify(r, null, 1))
}
