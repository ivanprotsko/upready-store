/**
 * Строит очереди загрузки по волнам. Каждая волна читает то, что уже лежит в raw/,
 * поэтому скрипт идемпотентен и его можно гонять после каждой волны.
 *
 *   node scripts/build-queue.mjs wave1   # insales: листинг + страницы тем; tilda: демо шаблонов
 *   node scripts/build-queue.mjs wave2   # insales: демо-магазины тем (адреса взяты со страниц тем)
 *   node scripts/build-queue.mjs wave3   # insales: подстраницы демо (каталог, товар, корзина, блог…)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const wave = process.argv[2]
const out = []
const pushed = new Set()
const push = (source, slug, url) => { if (pushed.has(url)) return; pushed.add(url); out.push([source, slug, url]) }
const slugify = (s) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)
const readRaw = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "")

if (wave === "wave1") {
  push("insales", "00-listing", "https://www.insales.ru/collection/themes")
  push("insales", "01-platform-features", "https://www.insales.ru/page/features")
  const listing = readRaw(`${ROOT}/raw/insales/00-listing.md`)
  for (const m of listing.matchAll(/https:\/\/www\.insales\.ru(\/collection\/[a-z0-9-]+\/product\/[a-z0-9-]+)/g)) {
    push("insales", `theme-${slugify(m[1].split("/product/")[1])}`, `https://www.insales.ru${m[1]}`)
  }
  const tilda = JSON.parse(readRaw(`${ROOT}/tilda-index.json`) || '{"rows":[]}')
  const STORE_ADJACENT = new Set(["storeoninstagram", "cardealership", "fashionstylist", "fooddeliveryru", "orderform", "quizoptics", "newsfeedrealestateru"])
  const picked = tilda.rows.filter((r) => r.type === "st" || STORE_ADJACENT.has(r.alias))
  push("tilda", "01-platform-build-online-store", "https://tilda.cc/ru/build-online-store/")
  for (const r of picked) if (r.demo) push("tilda", `demo-${slugify(r.alias)}`, r.demo)
} else if (wave === "wave2") {
  // адрес демо лежит в тексте страницы темы как ссылка на demo-*.myinsales.ru
  for (const f of readdirSync(`${ROOT}/raw/insales`).filter((x) => x.startsWith("theme-"))) {
    const txt = readRaw(`${ROOT}/raw/insales/${f}`)
    const m = txt.match(/https:\/\/([a-z0-9-]*demo[a-z0-9-]*\.myinsales\.ru)\/?/i) || txt.match(/https:\/\/([a-z0-9-]+\.myinsales\.ru)\/?/i)
    if (!m) { console.error(`демо не найдено: ${f}`); continue }
    push("insales", `demo-${slugify(m[1].split(".")[0])}`, `https://${m[1]}/`)
  }
} else if (wave === "wave3") {
  // по одной странице каталога на демо: там видны фильтры, сортировка, пагинация, карточки
  for (const f of readdirSync(`${ROOT}/raw/insales`).filter((x) => x.startsWith("demo-"))) {
    const txt = readRaw(`${ROOT}/raw/insales/${f}`)
    const links = [...txt.matchAll(/^- .*? \u2192 (https?:\/\/\S+)$/gm)].map((m) => m[1])
    const coll = links.find((u) => /\/collection\/(?!all)[a-z0-9-]+\/?$/.test(new URL(u).pathname)) || links.find((u) => /\/collection\//.test(u))
    if (coll) push("insales", `${f.replace(/\.md$/, "")}-collection`, coll)
  }
} else if (wave === "wave4") {
  // по одной карточке товара на демо — из уже загруженной страницы каталога
  for (const f of readdirSync(`${ROOT}/raw/insales`).filter((x) => x.endsWith("-collection.md"))) {
    const txt = readRaw(`${ROOT}/raw/insales/${f}`)
    const links = [...txt.matchAll(/^- .*? \u2192 (https?:\/\/\S+)$/gm)].map((m) => m[1])
    const prod = links.find((u) => /\/product\/[a-z0-9-]+\/?$/.test(new URL(u).pathname))
    if (prod) push("insales", `${f.replace(/-collection\.md$/, "")}-product`, prod)
    else console.error(`товар не найден: ${f}`)
  }
} else if (wave === "wave5") {
  // служебные страницы магазина на нескольких демо: корзина, блог, кабинет, сравнение, доставка/оплата
  const WANT = [[/\/cart_items?\/?$/, "cart"], [/\/blogs\/[a-z0-9-]+\/?$/, "blog"], [/client_account\/login/, "account"],
                [/\/page\/(payment|dostavka|delivery|oplata)/, "page-payment"], [/compare/, "compare"]]
  const DEMOS = (process.argv[3] || "demo-demo-cream,demo-demo-bubble,demo-demo-fine").split(",")
  for (const d of DEMOS) {
    const txt = readRaw(`${ROOT}/raw/insales/${d}.md`)
    const links = [...txt.matchAll(/^- .*? \u2192 (https?:\/\/\S+)$/gm)].map((m) => m[1])
    for (const [re, kind] of WANT) {
      const hit = links.find((u) => re.test(u))
      if (hit) push("insales", `${d}-${kind}`, hit)
    }
  }
} else { console.error("укажи волну: wave1 | wave2 | wave3"); process.exit(2) }

const file = `${ROOT}/scripts/queue-${wave}.tsv`
writeFileSync(file, out.map((r) => r.join("\t")).join("\n") + "\n")
console.log(`${file}: ${out.length} строк`)
