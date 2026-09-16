/**
 * Индекс шаблонов Tilda. Галерея /ru/tpls/ рисуется скриптом cc-tplslist.min.js,
 * который дёргает POST https://tilda.cc/tpls/get/gettplslist/ (lang=RU) и получает
 * "#bsf" + base64(JSON). Берём ИМЕННО этот источник: один запрос вместо headless-браузера.
 *
 * Выход: raw/tilda/00-index.md (человекочитаемый срез) + tilda-index.json (сырые записи).
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const UA = "upready-research/1.0 (+https://upready.dev)"
const URL_ENDPOINT = "https://tilda.cc/tpls/get/gettplslist/"

const res = await fetch(URL_ENDPOINT, {
  method: "POST",
  headers: {
    "User-Agent": UA,
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://tilda.cc/ru/tpls/",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "lang=RU",
  signal: AbortSignal.timeout(20000),
})
const raw = await res.text()
if (res.status !== 200 || !raw.startsWith("#bsf")) {
  console.error(`отказ: HTTP ${res.status}, тело начинается с ${JSON.stringify(raw.slice(0, 40))}`)
  process.exit(1)
}
const data = JSON.parse(Buffer.from(raw.slice(4), "base64").toString("utf8"))
const items = data.examplepages || []

/** type в выдаче Tilda: st — интернет-магазин, bu — бизнес, cp — мультиссылка, fr — формы/квизы,
 *  zb — Zero Block, ev — события, in — внутренние, ed — образование, em — письма. */
const TYPE_LABEL = {
  st: "Интернет-магазин", bu: "Бизнес и услуги", cp: "Мультиссылка", fr: "Формы и квизы",
  zb: "Zero Block", ev: "События", in: "Прочее", ed: "Образование", em: "Письма",
}
const counts = {}
for (const t of items) counts[t.type] = (counts[t.type] || 0) + 1

const rows = items.map((t) => ({
  source: "tilda",
  name: (t.title || "").trim(),
  type: t.type,
  category: TYPE_LABEL[t.type] || t.type,
  alias: t.alias || "",
  url: t.link?.startsWith("http") ? t.link : `https://tilda.cc${t.link || ""}`,
  demo: t.alias ? `http://examples-ru.tilda.ws/${t.alias}` : "",
  descr: (t.descr || "").replace(/\s+/g, " ").trim(),
}))

mkdirSync(`${ROOT}/raw/tilda`, { recursive: true })
writeFileSync(`${ROOT}/tilda-index.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), total: items.length, counts, rows }, null, 1))

const md = [
  `# Source: ${URL_ENDPOINT} (POST lang=RU; данные галереи https://tilda.cc/ru/tpls/)`,
  `# Fetched: ${new Date().toISOString()}`,
  `# Topic: store-templates-functionality`,
  `# HTTP: ${res.status}`,
  "",
  `## Всего шаблонов в выдаче: ${items.length}`,
  "",
  "## По типам",
  ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k} (${TYPE_LABEL[k] || k}): ${v}`),
  "",
  "## Шаблоны",
  ...rows.map((r) => `- [${r.type}] ${r.name} — ${r.descr} | страница: ${r.url} | демо: ${r.demo}`),
  "",
].join("\n")
writeFileSync(`${ROOT}/raw/tilda/00-index.md`, md)
console.log(`Tilda: ${items.length} шаблонов, типы ${JSON.stringify(counts)}`)
