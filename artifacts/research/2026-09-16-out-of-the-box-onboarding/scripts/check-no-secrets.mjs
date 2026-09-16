/**
 * Приёмочный гейт: в артефакте не должно быть ЗНАЧЕНИЙ ключей и паролей.
 * Ищем присваивания секретов и длинные токеноподобные строки. Исключение одно и оно ЯВНОЕ:
 * пример токена из публичной документации Почты России — он опубликован ею самой и ничей доступ не открывает.
 * Запуск: node scripts/check-no-secrets.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, dirname, join } from "node:path"
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const ALLOW = [
  { value: "sDBaa9XNfFargSyQ8KIEM40GB_ndPmLu", why: "пример токена в документации otpravka.pochta.ru, опубликован самой Почтой" },
  { value: "bG9naW46cGFzc3dvcmQ=", why: "base64('login:password') — пример из документации Почты" },
  { value: "AOvVaw1WD8iSfwTtgbDQDFbb", why: "параметр usg= в ссылке Google-редиректа внутри документации Яндекса; доступа не открывает" },
]
const PATTERNS = [
  [/(?:password|passwd|pwd|secret|api[_-]?key|client[_-]?secret|token)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})/gi, "присваивание секрета"],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "ключ платёжного провайдера"],
  // Высокоэнтропийная строка: длинная, со СМЕШАННЫМ регистром И цифрой, без дефисов и точек.
  // Без этих условий гейт ловит слаги и имена файлов (замер: 97 находок, все ложные) — а гейт,
  // который кричит на каждый файл, перестают читать (8b «gate-by-name-not-by-measured-flow»).
  [/\b(?=[A-Za-z0-9_]{24,}\b)(?=[A-Za-z0-9_]*[a-z])(?=[A-Za-z0-9_]*[A-Z])(?=[A-Za-z0-9_]*\d)[A-Za-z0-9_]{24,}\b/g, "высокоэнтропийная строка"],
]
const walk = (d, acc = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, acc) : acc.push(p) } return acc }
const allow = new Set(ALLOW.map((a) => a.value))
let hits = 0, scanned = 0
for (const p of walk(ROOT)) {
  if (/\.(png|jpg|jpeg|webp|pdf|zip)$/i.test(p)) continue
  if (p.endsWith("check-no-secrets.mjs")) continue
  scanned++
  const text = readFileSync(p, "utf8")
  for (const [re, label] of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const v = m[1] || m[0]
      if (allow.has(v)) continue
      if (/^[а-яА-ЯёЁ_\-]+$/.test(v)) continue           // длинное русское слово — не токен
      if (/^(?:[A-Za-z]+[_-]){2,}[A-Za-z]+$/.test(v)) continue // слова-через-дефис (имена файлов, slug)
      hits++
      console.log(`  ${label}: ${p.replace(ROOT + "/", "")} → ${v.slice(0, 40)}`)
    }
  }
}
console.log(`просмотрено файлов: ${scanned}, находок: ${hits}`)
for (const a of ALLOW) console.log(`  исключение (осознанное): ${a.value.slice(0, 16)}… — ${a.why}`)
process.exit(hits ? 1 : 0)
