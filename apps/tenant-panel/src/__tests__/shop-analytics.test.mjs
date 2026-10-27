import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import i18next from "i18next"

import { averageOrdersOf, chartDaysOf, previousDaysOf, productSharesOf, tilesOf } from "../routes/analytics/view-model.ts"
import { activePresetOf, daysIn, resolveDays, summaryQueryOf } from "../components/analytics-period/period.ts"

/**
 * «Аналитика магазина» (t-2026-10-20-45), read as the other tests of this
 * package read screens: the plain parts run, the React parts are source text.
 *
 *   node --test apps/tenant-panel/src/__tests__/shop-analytics.test.mjs
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = (...parts) => readFileSync(join(root, ...parts), "utf8")
const catalog = (lang) => JSON.parse(src("i18n", "translations", `${lang}.json`))
const get = (json, path) => path.split(".").reduce((node, key) => node?.[key], json)

const PAGE = src("routes", "analytics", "analytics.tsx")
const SUMMARY = src("routes", "home", "sales-summary.tsx")
const METRICS = src("routes", "home", "sales-summary-metrics.tsx")
const MP = src("routes", "marketplaces", "mp-analytics", "mp-analytics.tsx")
const APP = src("app.tsx")

const day = (n) => `2026-09-${String(n).padStart(2, "0")}`
const series = (length, revenue) =>
  Array.from({ length }, (_, i) => ({ date: day(1 + (i % 28)), revenue: revenue(i), order_count: revenue(i) > 0 ? 1 : 0 }))

const summary = (overrides = {}) => ({
  current: { revenue: 300, order_count: 3, aov: 100 },
  canceled: { order_count: 1, revenue: 40 },
  change: { revenue_pct: 20, order_count_pct: 0, aov_pct: 20, canceled_pct: null },
  daily: series(3, () => 100),
  previous_daily: series(3, () => 80),
  top_products: [
    { product_id: "a", title: "A", quantity: 2, revenue: 200 },
    { product_id: "b", title: "B", quantity: 1, revenue: 50 },
  ],
  ...overrides,
})

test("the four tiles carry the very fields the sales summary on «Обзор» prints", () => {
  const data = summary()
  const tiles = tilesOf(data)
  assert.equal(tiles.revenue.value, data.current.revenue)
  assert.equal(tiles.revenue.change, data.change.revenue_pct)
  assert.equal(tiles.orders.value, data.current.order_count)
  assert.equal(tiles.orders.change, data.change.order_count_pct)
  assert.equal(tiles.aov.value, data.current.aov)
  assert.equal(tiles.aov.change, data.change.aov_pct)
  assert.equal(tiles.canceled.value, data.canceled.order_count)
  assert.equal(tiles.canceled.amount, data.canceled.revenue)
  // The summary reads the same fields and the page asks the same route.
  for (const field of ["current.revenue", "change.revenue_pct", "current.order_count", "change.order_count_pct", "current.aov", "change.aov_pct", "canceled.revenue"]) {
    assert.ok(METRICS.includes(field), field)
  }
  assert.match(PAGE, /useTenantAnalyticsSummary\(query/)
  assert.match(SUMMARY, /useTenantAnalyticsSummary\(/)
})

test("one order: one day with revenue, the share chart is one slice", () => {
  const data = summary({
    current: { revenue: 100, order_count: 1, aov: 100 },
    canceled: { order_count: 0, revenue: 0 },
    daily: series(1, () => 100),
    previous_daily: series(1, () => 0),
    top_products: [{ product_id: "a", title: "A", quantity: 1, revenue: 100 }],
  })
  assert.equal(chartDaysOf(data.daily).length, 1)
  const shares = productSharesOf(data)
  assert.equal(shares.named.length, 1)
  assert.equal(shares.named[0].share, 100)
  assert.equal(shares.rest, null)
})

test("an empty period draws no share chart and zero tiles, not a crash", () => {
  const data = summary({
    current: { revenue: 0, order_count: 0, aov: 0 },
    canceled: { order_count: 0, revenue: 0 },
    daily: series(7, () => 0),
    previous_daily: series(7, () => 0),
    top_products: [],
  })
  assert.equal(productSharesOf(data), null)
  assert.equal(tilesOf(data).revenue.value, 0)
  assert.equal(previousDaysOf(data).length, 7)
})

test("60 days: the chart and the dashed line stay the same length; a short previous series is dropped", () => {
  const data = summary({ daily: series(60, (i) => i), previous_daily: series(60, (i) => i + 1) })
  assert.equal(chartDaysOf(data.daily).length, 60)
  assert.equal(previousDaysOf(data).length, 60)
  assert.equal(previousDaysOf({ ...data, previous_daily: series(59, () => 1) }), null)
  assert.equal(previousDaysOf({ ...data, previous_daily: undefined }), null)
})

test("the shares add up to the whole: named products plus the rest", () => {
  const shares = productSharesOf(summary())
  const total = shares.named.reduce((sum, row) => sum + row.revenue, 0) + (shares.rest?.revenue ?? 0)
  assert.equal(total, 300)
  assert.equal(shares.rest.revenue, 50)
})

test("the period of the address: default 30 days, a range goes to the route as custom", () => {
  const today = new Date(2026, 9, 28)
  assert.deepEqual(summaryQueryOf(undefined, undefined, today), { period: "30d" })
  assert.deepEqual(summaryQueryOf("2026-10-22", undefined, today), { period: "custom", from: "2026-10-22", to: "2026-10-28" })
  assert.equal(daysIn(resolveDays("2026-10-22", undefined, today)), 7)
  assert.equal(activePresetOf(undefined, undefined, today), 30)
  assert.equal(activePresetOf("2026-10-22", undefined, today), 7)
  assert.equal(activePresetOf("2026-10-01", "2026-10-05", today), null)
})

test("the period control is the shared one: both pages import it, neither keeps a copy", () => {
  assert.match(PAGE, /from "\.\.\/\.\.\/components\/analytics-period\/period-bar"/)
  assert.match(MP, /from "\.\.\/\.\.\/\.\.\/components\/analytics-period\/period-bar"/)
  assert.equal((PAGE.match(/<PeriodBar/g) ?? []).length, 1)
  assert.doesNotMatch(MP, /const PeriodBar/)
  assert.doesNotMatch(PAGE, /const PeriodBar/)
})

test("the page uses the shared chart in colour, the donut with hues, and the summary's currency rule", () => {
  assert.match(PAGE, /<SalesChart\s+hue/)
  assert.match(PAGE, /<ShareDonut hue/)
  assert.match(PAGE, /SalesSummaryCurrencyPicker/)
  assert.match(PAGE, /getStylizedAmount/)
})

test("the route exists, is reached from the summary heading and sits under «Обзор»", () => {
  assert.match(APP, /path: "\/analytics",\s+children: shopAnalyticsChildren/)
  assert.match(src("routes", "analytics", "routes.tsx"), /handle: \{ breadcrumb: \(\) => t\("shopAnalytics\.title"\) \}/)
  assert.match(SUMMARY, /to="\/analytics"/)
  assert.match(src("components", "layout", "owner-nav", "nav-model.ts"), /match:\s*\["\/analytics"\]/)
})

test("every shopAnalytics key the page uses exists in ru and en, and en is English", () => {
  const used = new Set([...PAGE.matchAll(/["`](shopAnalytics\.[\w.]+)["`]/g)].map((match) => match[1]))
  assert.ok(used.size > 10, `${used.size} keys`)
  for (const lang of ["ru", "en"]) {
    for (const key of [...used, "salesSummary.openAnalytics"]) {
      // A plural key lives as `key_one`, `key_few` ... beside the base name.
      const found = get(catalog(lang), key) ?? get(catalog(lang), `${key}_other`)
      assert.equal(typeof found, "string", `${lang}: ${key}`)
    }
  }
  const flat = (node) => (typeof node === "string" ? [node] : Object.values(node).flatMap(flat))
  for (const text of flat(catalog("en").shopAnalytics)) {
    assert.doesNotMatch(text, /[А-Яа-яЁё]/, text)
  }
  const baseKeys = (lang) => Object.keys(catalog(lang).shopAnalytics.chart).filter((key) => !/_(one|few|many|other)$/.test(key))
  assert.equal(baseKeys("ru").join(), baseKeys("en").join())
  assert.equal(Object.keys(catalog("ru").shopAnalytics).join(), Object.keys(catalog("en").shopAnalytics).join())
})

test("orders a day: the noun agrees with the number, and a small shop is not told «0 заказов»", async () => {
  const sentence = async (lng, orderCount, days) => {
    const instance = i18next.createInstance()
    await instance.init({ lng, resources: { ru: { translation: catalog("ru") }, en: { translation: catalog("en") } } })
    const averageOrders = averageOrdersOf(orderCount, days)
    const orders = new Intl.NumberFormat(lng === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(averageOrders)
    return instance.t("shopAnalytics.chart.average", { revenue: "R", count: averageOrders, orders })
  }
  assert.equal(await sentence("ru", 30, 30), "В среднем R и 1 заказ в день.")
  assert.equal(await sentence("ru", 60, 30), "В среднем R и 2 заказа в день.")
  assert.equal(await sentence("ru", 150, 30), "В среднем R и 5 заказов в день.")
  assert.equal(await sentence("ru", 39, 30), "В среднем R и 1,3 заказа в день.")
  assert.equal(await sentence("ru", 3, 30), "В среднем R и 0,1 заказа в день.")
  assert.equal(await sentence("ru", 0, 30), "В среднем R и 0 заказов в день.")
  assert.equal(await sentence("en", 30, 30), "On average R and 1 order a day.")
  assert.equal(await sentence("en", 39, 30), "On average R and 1.3 orders a day.")
  assert.equal(await sentence("en", 150, 30), "On average R and 5 orders a day.")
  // From ten a day it is a whole number.
  assert.equal(averageOrdersOf(305, 30), 10)
  assert.equal(averageOrdersOf(1000, 30), 33)
})

test("an empty shop gets the panel's NoRecords with a way to «Обзор», not a bare line", () => {
  assert.match(PAGE, /<NoRecords\s+title=\{t\("shopAnalytics\.empty\.title"\)\}/)
  assert.match(PAGE, /action=\{\{ to: "\/", label: t\("shopAnalytics\.empty\.action"\) \}\}/)
  assert.doesNotMatch(PAGE, /salesSummary\.noOrdersYet/)
})

test("the heading of the sales summary looks like a link, and the best sellers sit in a Panel with the sums at the right edge", () => {
  assert.match(SUMMARY, /<TriangleRightMini className="text-ui-fg-muted rtl:rotate-180" \/>/)
  assert.match(PAGE, /<Panel title=\{t\("salesSummary\.topProducts"\)\} testId="shop-analytics-top-products">/)
  const list = src("routes", "home", "sales-summary-top-products.tsx")
  assert.match(list, /justify-between/)
  assert.match(list, /narrow \? "flex flex-col gap-y-2 md:max-w-2xl" : "flex flex-col gap-y-2"/)
})
