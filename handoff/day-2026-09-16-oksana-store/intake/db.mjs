// db.mjs — единственный открыватель operator.db. Все скрипты оператора ходят в базу только через него.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const dbPath = () => process.env.OPERATOR_DB || path.join(HERE, 'operator.db')
export const answersDir = () => process.env.OPERATOR_ANSWERS || path.join(path.dirname(dbPath()), 'answers')
export const promptsDir = () => process.env.OPERATOR_PROMPTS || path.join(path.dirname(dbPath()), 'prompts')
export const escalationsLog = () => process.env.OPERATOR_ESCALATIONS || path.join(path.dirname(dbPath()), 'escalations.log')

export function loadCorpusConfig() {
  const p = process.env.OPERATOR_CORPUS || path.join(HERE, 'corpus.json')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/** Открыть базу. readOnly=true — для UI: читает, пока operator.mjs пишет (WAL). */
export function open({ readOnly = false } = {}) {
  const file = dbPath()
  if (readOnly && !fs.existsSync(file)) return null
  if (!readOnly) fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file, readOnly ? { readOnly: true } : {})
  if (!readOnly) {
    db.exec(fs.readFileSync(path.join(HERE, 'schema.sql'), 'utf8'))
  }
  return db
}

export const nowIso = () => new Date().toISOString()
const p2 = (n) => String(n).padStart(2, '0')
/** Локальная метка WITA-машины, как её читает Иван. Берётся из системных часов в момент вызова (правило 17a). */
export function wita(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())} WITA`
}
export const stamp = (d = new Date()) =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
export const rid = (prefix) => `${prefix}-${stamp()}-${Math.random().toString(36).slice(2, 6)}`
