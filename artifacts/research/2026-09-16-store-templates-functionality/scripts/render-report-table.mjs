/**
 * §2 отчёта собирается ИЗ features.json, а не набирается руками: число в таблице
 * и число в реестре не могут разойтись (правило 18e — метрика с единицей и смыслом).
 * Подставляет таблицу вместо маркера <!--TABLE--> в report.md.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const rows = JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8"))

const CAT_RU = {
  navigation: "Навигация", "catalog-listing": "Каталог и списки", "filters-search": "Фильтры и поиск",
  "product-page": "Карточка товара", "cart-checkout": "Корзина и оформление", "promo-marketing": "Акции и маркетинг",
  content: "Контент", "trust-reviews": "Доверие и отзывы", account: "Личный кабинет",
  "b2b-wholesale": "Опт и B2B", integrations: "Интеграции", "seo-perf": "SEO и аналитика",
  "admin-customization": "Настройка владельцем",
}
const MARK = { "есть": "✅ есть", "частично": "🟡 частично", "нет": "❌ нет" }

const out = ["## 2. Функции по категориям", "",
  `Полный реестр с цитатами-уликами и ссылками на шаблоны — \`features.json\` (${rows.length} строк). «I» — в скольких шаблонах InSales функция найдена, «T» — в скольких у Tilda.`, ""]

for (const cat of Object.keys(CAT_RU)) {
  const inCat = rows.filter((r) => r.category === cat)
  if (!inCat.length) continue
  inCat.sort((a, b) => (b.insales.count + b.tilda.count) - (a.insales.count + a.tilda.count))
  out.push(`### ${CAT_RU[cat]}`, "", "| Функция | I | T | У нас | Где у нас / что нужно бэкенду |", "|---|--:|--:|---|---|")
  for (const r of inCat) {
    const where = r.upready_store === "нет"
      ? (r.backend_needed ? `бэкенд: ${r.backend_what}` : "витрина, данных хватает")
      : (r.upready_where || "—")
    out.push(`| ${r.name_ru} | ${r.insales.count} | ${r.tilda.count} | ${MARK[r.upready_store] || r.upready_store} | ${where.replace(/\|/g, "/").slice(0, 190)} |`)
  }
  out.push("")
}

const path = `${ROOT}/report.md`
const md = readFileSync(path, "utf8")
if (!md.includes("<!--TABLE-->")) { console.error("маркер <!--TABLE--> уже подставлен — нечего заменять"); process.exit(1) }
writeFileSync(path, md.replace("<!--TABLE-->", out.join("\n")))
console.log(`§2 собран: ${rows.length} функций в ${Object.keys(CAT_RU).filter((c) => rows.some((r) => r.category === c)).length} категориях`)
