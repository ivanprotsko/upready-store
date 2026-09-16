#!/usr/bin/env node
// secret-audit.mjs — приёмочная проверка: ни одно ЗНАЧЕНИЕ секрета из ~/upready/.env.keys не лежит
// ни в operator.db, ни в документах ответов. Значения читаются в памяти и НИКУДА не печатаются —
// наружу выходят только ИМЕНА переменных и вердикт (правило 2a).
// CLI: secret-audit.mjs [<путь к .env.keys>]  → rc 0 (чисто) | rc 1 (утечка)
import fs from 'node:fs'
import path from 'node:path'
import { dbPath, answersDir } from './db.mjs'

const keysFile = process.argv[2] || path.join(process.env.HOME || '', 'upready/.env.keys')
const MIN = 8 // короткие значения («1», «true») дают ложные совпадения и секретами не являются

function pairs(file) {
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim().replace(/^["'`]|["'`]$/g, '')
    if (v.length < MIN) continue
    out.push([m[1], v])
  }
  return out
}

function haystacks() {
  const h = []
  for (const s of ['', '-wal', '-shm']) { const p = dbPath() + s; if (fs.existsSync(p)) h.push([p, fs.readFileSync(p)]) }
  const dir = answersDir()
  const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else h.push([p, fs.readFileSync(p)]) } }
  walk(dir)
  return h
}

// Секрет опознаётся по ИМЕНИ переменной — тем же правилом, каким индекс маскирует значение.
// Всё прочее в .env.keys (IP хоста, базовый URL API, домен, почта, имя бакета, логин пользователя)
// секретом не является и в каноне стоит НАМЕРЕННО: памятка protected-infra прямо печатает адрес хоста.
// Поэтому вердикт даёт только жёсткий класс; мягкий печатается СПИСКОМ ИМЁН, чтобы было что глазами
// проверить, и на код возврата не влияет (иначе гейт краснеет на строке «/Users/ivanprotsko/…»).
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|COOKIE|PASS|PRIVATE_KEY|CREDENTIAL/i

if (!fs.existsSync(keysFile)) { console.error(`нет файла ключей: ${keysFile}`); process.exit(2) }
const ps = pairs(keysFile)
const hs = haystacks()
const hard = new Map(); const soft = new Map()
for (const [name, value] of ps) {
  const buf = Buffer.from(value, 'utf8')
  for (const [where, hay] of hs) {
    if (!hay.includes(buf)) continue
    const bucket = SECRET_NAME.test(name) ? hard : soft
    if (!bucket.has(name)) bucket.set(name, new Set())
    bucket.get(name).add(where)
  }
}
const secrets = ps.filter(([n]) => SECRET_NAME.test(n))
console.log(`значений в ${keysFile}: ${ps.length}, из них по ИМЕНИ секретных: ${secrets.length}`)
console.log(`просмотрено файлов: ${hs.length} (operator.db + ${answersDir()})`)
if (soft.size) console.log(`не-секретные значения, встречающиеся в корпусе (норма, это конфигурация): ${[...soft.keys()].join(', ')}`)
if (hard.size) {
  for (const [n, where] of hard) console.log(`УТЕЧКА СЕКРЕТА: ${n} → ${[...where].join(' · ')}`)
  process.exit(1)
}
console.log(`чисто: ни одного значения из ${secrets.length} секретных переменных нет ни в operator.db, ни в документах ответов`)
