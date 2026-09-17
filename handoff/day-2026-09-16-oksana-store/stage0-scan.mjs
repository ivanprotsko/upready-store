// stage0-scan.mjs — разбор unified diff для машинного этапа 0 приёмки (accept-stage0.sh).
// Читает файл диффа (или stdin) и печатает JSON: список затронутых файлов, найденные секреты
// и выключенные тесты. Отдельный модуль, а не строки внутри .sh, потому что регулярки по
// добавленным строкам — ровно то место, где ошибка гварда стоит раунда приёмки: их проверяет
// ui/stage0.test.mjs поштучно, а не только через end-to-end прогон скрипта.
//
//   node stage0-scan.mjs <diff-file>            # или: cat x.diff | node stage0-scan.mjs
//
// Что считается уликой — только СТРОКИ, ДОБАВЛЕННЫЕ диффом (`+`, кроме заголовка `+++`).
// Осознанное исключение помечается в самой строке маркером `stage0:allow <причина>`.

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

// Значение, которое не является секретом: пусто, подстановка, плейсхолдер, дефолт стартера.
// `supersecret` — намеренный дефолт этого репозитория (AGENTS.md: «the `supersecret` defaults are deliberate»).
const PLACEHOLDER = /^(?:\$\{|\$\(|process\.env\b|<[^>]*>|\.{3}|x{3,}|\*{3,}|changeme|change_me|your[-_ ]|placeholder|example|dummy|sample|supersecret|secret|password|token|null|undefined|true|false|yes|no|1|0)$/i

// Ключ-подобные значения с узнаваемым префиксом.
const TOKEN_PATTERNS = [
  { name: 'yandex-oauth', re: /\bAQ\.[A-Za-z0-9_-]{15,}/ },
  { name: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  // Заголовок PEM собирается из кусков, чтобы исходник сканера не ловил сам себя.
  { name: 'private-key', re: new RegExp('-----BE' + 'GIN [A-Z ]*PRIVATE KEY-----') },
]

// `имя = значение`: и прозаическое (`password=...`), и переменная окружения (`FOO_SECRET=...`).
const ASSIGN_PATTERNS = [
  { name: 'password-assignment', re: /\b(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*[=:]\s*(.+)$/i },
  { name: 'env-secret-assignment', re: /\b([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY))\s*=\s*(.+)$/ },
]

// Выключенные тесты. Ищем только в файлах, которые ЯВЛЯЮТСЯ тестами или их конфигами:
// `.only(` в обычном коде — законный вызов (например `rows.only(...)`).
const TEST_FILE = /(?:^|\/)(?:tests?|__tests__|spec|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const TEST_CONFIG = /(?:^|\/)(?:jest|vitest|playwright|karma|ava)\.config\.[cm]?[jt]s$/
const DISABLED_PATTERNS = [
  { name: 'skip', re: /\b(?:describe|test|it|suite|context)\.skip\s*\(/ },
  { name: 'only', re: /\b(?:describe|test|it|suite|context)\.only\s*\(/ },
  { name: 'xit', re: /\bxit\s*\(/ },
  { name: 'xdescribe', re: /\bxdescribe\s*\(/ },
  { name: 'todo', re: /\b(?:test|it)\.todo\s*\(/ },
  { name: 'node-test-skip', re: /\b(?:skip|todo)\s*:\s*true\b/ },
]
const CONFIG_DISABLED_PATTERNS = [
  { name: 'testPathIgnorePatterns', re: /testPathIgnorePatterns/ },
  { name: 'exclude', re: /\bexclude\s*:/ },
]

const ALLOW = /stage0:allow/

// `.env.example` и подобные образцы — место, где значение-образец стоит по проекту.
const EXAMPLE_FILE = /(?:^|\/)\.env\.(?:example|sample|template)$|\.(?:example|sample|template|dist)$/

export function parseDiff(text) {
  const files = []
  let current = null
  for (const raw of String(text ?? '').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/ b\/(.+)$/)
      current = { path: m ? m[1] : null, added: [], deleted: false, lineNo: 0 }
      files.push(current)
      continue
    }
    if (!current) continue
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim()
      if (p === '/dev/null') current.deleted = true
      else if (p.startsWith('b/')) current.path = p.slice(2)
      continue
    }
    if (raw.startsWith('--- ') || raw.startsWith('index ') || raw.startsWith('new file') || raw.startsWith('deleted file') || raw.startsWith('similarity ') || raw.startsWith('rename ') || raw.startsWith('old mode') || raw.startsWith('new mode') || raw.startsWith('Binary files')) continue
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/)
      current.lineNo = m ? Number(m[1]) : 0
      continue
    }
    if (raw.startsWith('+')) {
      current.added.push({ no: current.lineNo, text: raw.slice(1) })
      current.lineNo += 1
      continue
    }
    if (raw.startsWith('-') || raw.startsWith('\\')) continue
    current.lineNo += 1
  }
  return files.filter((f) => f.path)
}

function valueIsSecret(rawValue) {
  let v = String(rawValue).trim()
  v = v.replace(/[,;]+$/, '').replace(/\s*(?:\/\/|#).*$/, '').trim()
  v = v.replace(/^['"`]/, '').replace(/['"`].*$/, '').trim()
  if (!v) return null
  if (PLACEHOLDER.test(v)) return null
  if (/^\$\{?[A-Za-z_]/.test(v)) return null
  if (v.length < 6) return null
  return v
}

export function scanSecrets(files) {
  const hits = []
  for (const f of files) {
    if (f.deleted) continue
    if (EXAMPLE_FILE.test(f.path)) continue
    for (const { no, text } of f.added) {
      if (ALLOW.test(text)) continue
      let hit = null
      for (const p of TOKEN_PATTERNS) {
        if (p.re.test(text)) { hit = { pattern: p.name, value: text.match(p.re)[0] }; break }
      }
      if (!hit) {
        for (const p of ASSIGN_PATTERNS) {
          const m = text.match(p.re)
          if (!m) continue
          const v = valueIsSecret(m[2])
          if (!v) continue
          hit = { pattern: p.name, value: `${m[1]}=${v.slice(0, 6)}…` }
          break
        }
      }
      if (hit) hits.push({ file: f.path, line: no, pattern: hit.pattern, evidence: hit.value })
    }
  }
  return hits
}

export function scanDisabledTests(files) {
  const hits = []
  for (const f of files) {
    if (f.deleted) continue
    const isTest = TEST_FILE.test(f.path)
    const isConfig = TEST_CONFIG.test(f.path)
    if (!isTest && !isConfig) continue
    const patterns = isConfig ? DISABLED_PATTERNS.concat(CONFIG_DISABLED_PATTERNS) : DISABLED_PATTERNS
    for (const { no, text } of f.added) {
      if (ALLOW.test(text)) continue
      for (const p of patterns) {
        if (p.re.test(text)) { hits.push({ file: f.path, line: no, pattern: p.name, evidence: text.trim().slice(0, 120) }); break }
      }
    }
  }
  return hits
}

export function scan(text) {
  const files = parseDiff(text)
  return {
    files: files.map((f) => f.path),
    added: files.reduce((n, f) => n + f.added.length, 0),
    secrets: scanSecrets(files),
    disabled: scanDisabledTests(files),
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  const file = process.argv[2]
  const text = file && file !== '-' ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8')
  process.stdout.write(JSON.stringify(scan(text), null, 2) + '\n')
}
