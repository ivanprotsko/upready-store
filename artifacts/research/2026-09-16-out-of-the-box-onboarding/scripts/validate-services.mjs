/**
 * Проверка services.json: (1) по JSON-схеме services.schema.json — минимальный валидатор
 * под то подмножество draft-07, которое схема использует; (2) каждый id в claims[] существует
 * в claims.json. Вторая проверка и есть смысл: ссылка на несуществующую цитату = утверждение без источника.
 * Запуск: node scripts/validate-services.mjs
 */
import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const schema = JSON.parse(readFileSync(`${ROOT}/services.schema.json`, "utf8"))
const data = JSON.parse(readFileSync(`${ROOT}/services.json`, "utf8"))
const claims = JSON.parse(readFileSync(`${ROOT}/claims.json`, "utf8"))
const known = new Set(claims.map((c) => c.id))
const errors = []

function check(node, sch, path) {
  if (sch.enum && !sch.enum.includes(node)) errors.push(`${path}: значение ${JSON.stringify(node)} не входит в enum ${JSON.stringify(sch.enum)}`)
  if (sch.type === "object") {
    if (typeof node !== "object" || node === null || Array.isArray(node)) { errors.push(`${path}: ожидался объект`); return }
    for (const r of sch.required || []) if (!(r in node)) errors.push(`${path}: нет обязательного поля «${r}»`)
    if (sch.additionalProperties === false) for (const k of Object.keys(node)) if (!(sch.properties || {})[k]) errors.push(`${path}: лишнее поле «${k}»`)
    for (const [k, v] of Object.entries(node)) if ((sch.properties || {})[k]) check(v, sch.properties[k], `${path}.${k}`)
  } else if (sch.type === "array") {
    if (!Array.isArray(node)) { errors.push(`${path}: ожидался массив`); return }
    if (sch.minItems && node.length < sch.minItems) errors.push(`${path}: элементов ${node.length}, минимум ${sch.minItems}`)
    node.forEach((el, i) => sch.items && check(el, sch.items, `${path}[${i}]`))
  } else if (sch.type === "string") {
    if (typeof node !== "string") errors.push(`${path}: ожидалась строка`)
    else {
      if (sch.minLength && node.length < sch.minLength) errors.push(`${path}: короче ${sch.minLength}`)
      if (sch.pattern && !new RegExp(sch.pattern).test(node)) errors.push(`${path}: не подходит под ${sch.pattern}`)
    }
  } else if (sch.type === "integer") {
    if (!Number.isInteger(node)) errors.push(`${path}: ожидалось целое`)
  }
}
check(data, schema, "services.json")

let refs = 0, dead = 0
const walk = (n) => {
  if (Array.isArray(n)) return n.forEach(walk)
  if (n && typeof n === "object") {
    for (const [k, v] of Object.entries(n)) {
      if (k === "claims" && Array.isArray(v)) for (const id of v) { refs++; if (!known.has(id)) { dead++; errors.push(`ссылка на несуществующее утверждение: ${id}`) } }
      else walk(v)
    }
  }
}
walk(data)

// Тот же гейт для бэклога: задача, ссылающаяся на несуществующее утверждение, опирается на воздух.
const tasksFile = `${ROOT}/onboarding-tasks.json`
let tasksN = 0
if (existsSync(tasksFile)) {
  const tasks = JSON.parse(readFileSync(tasksFile, "utf8"))
  tasksN = tasks.tasks.length
  walk(tasks)
  const prio = new Set(tasks.tasks.map((t) => t.priority))
  for (const p of prio) if (!["must", "should", "later"].includes(p)) errors.push(`onboarding-tasks.json: приоритет «${p}» вне must/should/later`)
  if (tasksN < 8) errors.push(`onboarding-tasks.json: задач ${tasksN}, по приёмке нужно не меньше 8`)
  for (const t of tasks.tasks) for (const f of ["chtoDaetKlientu", "chtoNuzhnoOtServisa", "nuzhenDogovorIliPartnerka", "priority"])
    if (!t[f]) errors.push(`onboarding-tasks.json: у задачи ${t.id} нет поля «${f}»`)
}

console.log(`сервисов ${data.services.length}, задач ${tasksN}, ссылок на цитаты ${refs}, из них битых ${dead}`)
if (errors.length) { console.log("ОШИБКИ:"); for (const e of errors) console.log("  " + e); process.exit(1) }
console.log("OK services.json соответствует схеме, все ссылки на цитаты живые")
