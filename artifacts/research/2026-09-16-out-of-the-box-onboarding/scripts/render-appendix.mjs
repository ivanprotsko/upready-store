/**
 * Приложение А отчёта генерируется ИЗ claims.json, а не перепечатывается руками:
 * цитата в отчёте тогда дословна по построению, а не по внимательности.
 * Всё, что в report.md стоит после маркера, переписывается при каждом прогоне.
 * Запуск: node scripts/render-appendix.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const MARK = "<!-- ПРИЛОЖЕНИЕ-А: генерируется scripts/render-appendix.mjs, руками не править -->"

const claims = JSON.parse(readFileSync(`${ROOT}/claims.json`, "utf8"))
const report = readFileSync(`${ROOT}/report.md`, "utf8")
const NAMES = { robokassa: "Robokassa", yookassa: "ЮKassa", cdek: "СДЭК", pochta: "Почта России", "yandex-id": "Яндекс ID", apiship: "ApiShip" }
const QS = { 1: "Вопрос 1 — партнёрские программы", 2: "Вопрос 2 — путь клиента", 3: "Вопрос 3 — денежный поток", 4: "Вопрос 4 — доступы и учётные данные" }

const out = ["", "---", "", MARK, "", "## Приложение А. Все 60 цитат с источниками", "",
  `Сгенерировано из \`claims.json\`, проверено \`scripts/verify-claims.mjs\`. Каждая цитата найдена дословно в файле из колонки «Сырьё».`, ""]
for (const svc of Object.keys(NAMES)) {
  const mine = claims.filter((c) => c.service === svc)
  if (!mine.length) continue
  out.push(`### ${NAMES[svc]}`, "")
  for (const q of [1, 2, 3, 4]) {
    const g = mine.filter((c) => c.question === q)
    if (!g.length) continue
    out.push(`**${QS[q]}**`, "")
    out.push("| id | Утверждение | Дословная цитата | Источник | Сырьё |", "|---|---|---|---|---|")
    for (const c of g) {
      const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ")
      out.push(`| ${c.id} | ${esc(c.claim)} | «${esc(c.quote)}» | ${esc(c.url)} | \`${esc(c.source)}\` |`)
    }
    out.push("")
  }
}
const head = report.includes(MARK) ? report.slice(0, report.indexOf(MARK)).replace(/\n+---\n+$/, "\n") : report
writeFileSync(`${ROOT}/report.md`, head.replace(/\s+$/, "") + "\n" + out.join("\n") + "\n")
console.log(`приложение А: ${claims.length} цитат по ${Object.keys(NAMES).length} сервисам`)
