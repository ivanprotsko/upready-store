#!/usr/bin/env node
// t-2026-10-20-23: writes the example payloads of the owner's «Сводка» from a fixed seed, so the
// files are the same on every run. Shapes are the contract's (shop-summary.v1, owner-summary.v1);
// every value is synthetic. The product titles are the cherkashino catalogue's own names
// (docs/storefront/live-content-punch-list-cherkashino.md), which are the shop's words, not a
// buyer's. The prototype reads these files, so its numbers and the contract never drift apart.
//
//   node docs/owner-cabinet/contract/make-examples.mjs
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

// The moment of the example: 20.10.2026, 09:00 in Moscow.
const NOW = "2026-10-20T06:00:00Z"
const TODAY = "2026-10-20"

const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const ulid = (rand) => Array.from({ length: 26 }, () => CROCKFORD[Math.floor(rand() * 32)]).join("")

const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const round = (value, step) => Math.round(value / step) * step

const OWNER_SUB = "own_01JAB3CH3RK45H1N0WN3R0000X"

const SHOPS = {
  ru: {
    seed: 2310,
    instance: "ru",
    tenant: "ten_01JAB3CH3RK45H1N0R00000001",
    name: "Черкашино",
    domain: "cherkashino.ru",
    panel: "https://panel.cherkashino.ru",
    timezone: "Europe/Moscow",
    currency: "rub",
    ordersPerDay: 9,
    price: [390, 2490],
    step: 10,
    products: [
      "Мазь-бальзам живичный",
      "Зубная паста тайская с углём",
      "Шампунь-концентрат тайский для блеска, 90 г",
      "Мазь от варикоза с каштаном",
      "Книга рецептов для мультиварок",
      "Прополис",
      "Таблетки от варикоза с каштаном",
    ],
    catalog: { published: 41, draft: 3 },
    reviews: { 1: 2, 2: 3, 3: 9, 4: 38, 5: 131 },
    pending: 4,
    toPack: 6,
    seq: 18342,
  },
  intl: {
    seed: 2320,
    instance: "intl",
    tenant: "ten_01JAB3CH3RK45H1N0C0M000002",
    name: "Cherkashino",
    domain: "cherkashino.com",
    panel: "https://panel.cherkashino.com",
    timezone: "Europe/Berlin",
    currency: "eur",
    ordersPerDay: 2,
    price: [9, 49],
    step: 0.5,
    products: [
      "Thai toothpaste with charcoal",
      "Pine resin balm",
      "Horse chestnut vein ointment",
      "Propolis",
      "Thai concentrated shampoo, 90 g",
    ],
    catalog: { published: 24, draft: 7 },
    reviews: { 1: 0, 2: 1, 3: 2, 4: 7, 5: 19 },
    pending: 1,
    toPack: 2,
    seq: 6117,
    // A few orders of the .com shop are paid in dollars: the second currency row of a period.
    second: { currency: "usd", share: 0.2 },
  },
  // The marketplace accounts of cherkashino.ru (Ivan 20.10, mark 1: «Источники продаж» with
  // Wildberries and Ozon). They belong to the RU shop and are computed on the RU instance.
  wildberries: {
    seed: 2330,
    instance: "ru",
    source: "wildberries",
    tenant: "ten_01JAB3CH3RK45H1N0R00000001",
    name: "Черкашино",
    domain: "cherkashino.ru",
    panel: "https://panel.cherkashino.ru",
    timezone: "Europe/Moscow",
    currency: "rub",
    ordersPerDay: 14,
    price: [290, 1490],
    step: 10,
    products: [
      "Зубная паста тайская с углём",
      "Мазь-бальзам живичный",
      "Шампунь-концентрат тайский для блеска, 90 г",
      "Прополис",
      "Мазь от варикоза с каштаном",
    ],
    catalog: { published: 28, draft: 0 },
    reviews: { 1: 9, 2: 6, 3: 21, 4: 88, 5: 412 },
    pending: 0,
    toPack: 11,
    seq: 9021,
  },
  ozon: {
    seed: 2340,
    instance: "ru",
    source: "ozon",
    tenant: "ten_01JAB3CH3RK45H1N0R00000001",
    name: "Черкашино",
    domain: "cherkashino.ru",
    panel: "https://panel.cherkashino.ru",
    timezone: "Europe/Moscow",
    currency: "rub",
    ordersPerDay: 5,
    price: [290, 1490],
    step: 10,
    products: [
      "Мазь-бальзам живичный",
      "Прополис",
      "Зубная паста тайская с углём",
      "Мазь от варикоза с каштаном",
      "Таблетки от варикоза с каштаном",
    ],
    catalog: { published: 19, draft: 2 },
    reviews: { 1: 3, 2: 2, 3: 8, 4: 31, 5: 96 },
    pending: 0,
    toPack: 3,
    seq: 4410,
  },
}

// The Bank of Russia's rate on the day of the example, rubles for one unit (synthetic). Every
// amount of another currency is shown in rubles at this rate (Ivan 21.10, mark 17: «показывать в
// рублях»); the tooltip names the real amount, the rate and its date.
const RATES = { eur: 94.37, usd: 81.05 }
const DISPLAY = "rub"

// The periods of the bar (Ivan 21.10, mark 15: «чтобы работал переключатель»): the presets and one
// range picked in the calendar, 1–14 October. `previous` is the period of the same length just before.
const PERIODS = {
  today: [TODAY, TODAY],
  yesterday: [addDays(TODAY, -1), addDays(TODAY, -1)],
  "7d": [addDays(TODAY, -6), TODAY],
  "30d": [addDays(TODAY, -29), TODAY],
  "90d": [addDays(TODAY, -89), TODAY],
  "365d": [addDays(TODAY, -364), TODAY],
  range: ["2026-10-01", "2026-10-14"],
}
const spanDays = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1

// Orders by hour of the day: few at night, most in the day and the evening.
const HOUR_WEIGHT = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6, 7, 7, 6, 4, 2]
const HOUR_SUM = HOUR_WEIGHT.reduce((a, w) => a + w, 0)

const shopSummary = (def) => {
  const rand = mulberry32(def.seed)
  const productIds = def.products.map(() => `prod_${ulid(rand)}`)
  const currencies = [def.currency, ...(def.second ? [def.second.currency] : [])]
  const pickHour = (upTo) => {
    let left = rand() * HOUR_WEIGHT.slice(0, upTo).reduce((a, w) => a + w, 0)
    for (let hour = 0; hour < upTo; hour += 1) {
      left -= HOUR_WEIGHT[hour]
      if (left < 0) return hour
    }
    return upTo - 1
  }

  // Two years of orders, oldest first, for a year and the year before it; days without orders are
  // left out. Sales grow slowly over the two years and rise before the New Year.
  const days = []
  const hours = []
  for (let back = 729; back >= 0; back -= 1) {
    const date = addDays(TODAY, -back)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const month = Number(date.slice(5, 7))
    const lift = (weekday === 0 || weekday === 6 ? 0.7 : 1) * (0.7 + (0.3 * (729 - back)) / 729) * (month === 12 ? 1.4 : month === 1 ? 0.8 : 1)
    // «today» is 09:00 in the morning: the hours before nine.
    const upTo = back === 0 ? 9 : 24
    const share = back === 0 ? HOUR_WEIGHT.slice(0, 9).reduce((a, w) => a + w, 0) / HOUR_SUM : 1
    for (const currency of currencies) {
      const part = currency === def.currency ? 1 - (def.second?.share ?? 0) : def.second.share
      const orders = Math.round(def.ordersPerDay * lift * share * part * (0.5 + rand()))
      if (orders === 0) continue
      let revenue = 0
      const byHour = new Map()
      for (let i = 0; i < orders; i += 1) {
        const amount = round(def.price[0] + rand() * (def.price[1] - def.price[0]), def.step) * (1 + Math.floor(rand() * 2))
        revenue += amount
        if (back <= 1) {
          const hour = pickHour(upTo)
          const row = byHour.get(hour) ?? { revenue: 0, order_count: 0 }
          row.revenue += amount
          row.order_count += 1
          byHour.set(hour, row)
        }
      }
      days.push({ date, currency_code: currency, revenue: round(revenue, def.step), order_count: orders })
      for (const [hour, row] of [...byHour].sort((a, b) => a[0] - b[0])) {
        hours.push({ hour: `${date}T${String(hour).padStart(2, "0")}`, currency_code: currency, revenue: round(row.revenue, def.step), order_count: row.order_count })
      }
    }
  }

  const sum = (from, to, currency) => {
    const rows = days.filter((d) => d.currency_code === currency && d.date >= from && d.date <= to)
    const revenue = round(rows.reduce((a, d) => a + d.revenue, 0), def.step)
    const order_count = rows.reduce((a, d) => a + d.order_count, 0)
    return { revenue, order_count, aov: order_count ? Math.round((revenue / order_count) * 100) / 100 : 0 }
  }

  // «Today» is compared with yesterday up to the same hour, not with the whole of yesterday.
  const untilNow = (day, currency) => {
    const rows = hours.filter((h) => h.currency_code === currency && h.hour.startsWith(day) && Number(h.hour.slice(11)) < 9)
    const revenue = round(rows.reduce((a, h) => a + h.revenue, 0), def.step)
    const order_count = rows.reduce((a, h) => a + h.order_count, 0)
    return { revenue, order_count, aov: order_count ? Math.round((revenue / order_count) * 100) / 100 : 0 }
  }

  const period = ([from, to]) => {
    const prevTo = addDays(from, -1)
    const prevFrom = addDays(prevTo, -(spanDays(from, to) - 1))
    const buckets = currencies
      .map((currency_code) => {
        const current = sum(from, to, currency_code)
        const canceledCount = Math.floor(current.order_count * 0.04)
        return {
          currency_code,
          current,
          previous: from === TODAY ? untilNow(prevFrom, currency_code) : sum(prevFrom, prevTo, currency_code),
          canceled: { order_count: canceledCount, revenue: round(canceledCount * current.aov, def.step) },
        }
      })
      // The main currency always stays, a second one only when the period holds it.
      .filter((bucket, index) => index === 0 || bucket.current.order_count > 0)
    const main = buckets[0].current
    const top_products = def.products.slice(0, 5).map((title, index) => {
      const weight = [0.24, 0.17, 0.12, 0.09, 0.07][index]
      const revenue = round(main.revenue * weight, def.step)
      return {
        product_id: productIds[index],
        title,
        currency_code: def.currency,
        quantity: Math.max(1, Math.round(revenue / ((def.price[0] + def.price[1]) / 2))),
        revenue,
      }
    })
    return { from, to, currencies: buckets, top_products: main.revenue > 0 ? top_products : [] }
  }

  // The year's chart: the days of the «365d» period by calendar month, so the first and the last
  // month are partial and the months add up to the period's totals.
  const monthly = []
  for (const row of days.filter((d) => d.date >= PERIODS["365d"][0])) {
    const month = row.date.slice(0, 7)
    const at = monthly.find((m) => m.month === month && m.currency_code === row.currency_code)
    if (at) {
      at.revenue = round(at.revenue + row.revenue, def.step)
      at.order_count += row.order_count
    } else monthly.push({ month, currency_code: row.currency_code, revenue: row.revenue, order_count: row.order_count })
  }

  const published = Object.values(def.reviews).reduce((a, n) => a + n, 0)
  const stars = Object.entries(def.reviews).reduce((a, [star, n]) => a + Number(star) * n, 0)

  return {
    schema: "upready.shop-summary/v1",
    instance: def.instance,
    source: def.source ?? "storefront",
    seq: def.seq,
    generated_at: NOW,
    owner_sub: OWNER_SUB,
    shop: { tenant_id: def.tenant, name: def.name, primary_domain: def.domain, panel_url: def.panel },
    timezone: def.timezone,
    periods: Object.fromEntries(Object.entries(PERIODS).map(([key, span]) => [key, period(span)])),
    daily: days.filter((d) => d.date > addDays(TODAY, -90)),
    hourly: hours,
    monthly,
    fx: {
      display_currency: DISPLAY,
      source: "cbr",
      rates: currencies.filter((code) => code !== DISPLAY).map((currency_code) => ({ currency_code, rate: RATES[currency_code], date: TODAY })),
    },
    orders: { to_pack: def.toPack },
    catalog: def.catalog,
    reviews: {
      published,
      pending: def.pending,
      average_rating: published ? Math.round((stars / published) * 10) / 10 : null,
      by_rating: def.reviews,
      new_30d: Math.round(published * 0.08),
    },
  }
}

const ru = shopSummary(SHOPS.ru)
const intl = shopSummary(SHOPS.intl)
const wildberries = shopSummary(SHOPS.wildberries)
const ozon = shopSummary(SHOPS.ozon)

// What the panel's GET /tenants/owner/summary answers on cherkashino.ru when the page loads: the
// sources of this instance read locally, the .com shop asked through the relay at that moment
// (Ivan 20.10, mark 6: «данные должны быть всегда актуальные на момент загрузки страницы»). The
// totals are in rubles over the sources that answered (Ivan 21.10, marks 17, 19, 20: «валюту нужно
// показывать одну … в рублях», «в поповере показывать уже список валют»): an amount in another
// currency is converted at the rate its source sent in `fx`, and `by_currency` keeps the real
// amounts for the popover.
const toDisplay = (amount, code, rates) => (code === DISPLAY ? amount : Math.round(amount * rates.get(code).rate))

const ownerSummary = (current, entries) => {
  const answered = entries.filter((e) => e.summary && (e.state ?? "ok") === "ok")
  const rates = new Map(answered.flatMap(({ summary }) => summary.fx.rates.map((rate) => [rate.currency_code, rate])))
  const totals = {}
  for (const key of Object.keys(PERIODS)) {
    const byCurrency = new Map()
    for (const { summary } of answered) {
      for (const bucket of summary.periods[key].currencies) {
        const rate = rates.get(bucket.currency_code)
        const row = byCurrency.get(bucket.currency_code) ?? {
          currency_code: bucket.currency_code,
          revenue: 0,
          previous_revenue: 0,
          order_count: 0,
          rate: rate?.rate ?? null,
          rate_date: rate?.date ?? null,
          revenue_converted: 0,
          previous_converted: 0,
          shops: 0,
        }
        row.revenue = Math.round((row.revenue + bucket.current.revenue) * 100) / 100
        row.previous_revenue = Math.round((row.previous_revenue + bucket.previous.revenue) * 100) / 100
        row.order_count += bucket.current.order_count
        row.revenue_converted += toDisplay(bucket.current.revenue, bucket.currency_code, rates)
        row.previous_converted += toDisplay(bucket.previous.revenue, bucket.currency_code, rates)
        row.shops += 1
        byCurrency.set(bucket.currency_code, row)
      }
    }
    const by_currency = [...byCurrency.values()]
    const revenue = by_currency.reduce((a, row) => a + row.revenue_converted, 0)
    const order_count = by_currency.reduce((a, row) => a + row.order_count, 0)
    totals[key] = {
      revenue,
      previous_revenue: by_currency.reduce((a, row) => a + row.previous_converted, 0),
      order_count,
      aov: order_count ? Math.round(revenue / order_count) : 0,
      by_currency,
    }
  }
  return {
    schema: "upready.owner-summary/v1",
    owner_sub: OWNER_SUB,
    current_tenant_id: current,
    computed_at: NOW,
    display_currency: DISPLAY,
    rate_source: "cbr",
    shops: entries.map(({ summary, state = "ok", def }) => ({
      tenant_id: def.tenant,
      instance: def.instance,
      source: def.source ?? "storefront",
      state,
      fetched_at: state === "ok" ? summary.generated_at : null,
      summary: state === "ok" ? summary : null,
    })),
    totals,
    attention: {
      to_pack: entries.reduce((a, e) => a + ((e.state ?? "ok") === "ok" ? e.summary.orders.to_pack : 0), 0),
      reviews_pending: entries.reduce((a, e) => a + ((e.state ?? "ok") === "ok" ? e.summary.reviews.pending : 0), 0),
    },
  }
}

const write = (name, value) => {
  writeFileSync(join(here, name), `${JSON.stringify(value, null, 2)}\n`)
  console.log(`wrote ${join(here, name)}`)
}

write("example.shop-summary.ru.json", ru)
write("example.shop-summary.intl.json", intl)
// The four sources on cherkashino.ru, all answering.
write(
  "example.owner-summary.ru.json",
  ownerSummary(SHOPS.ru.tenant, [
    { summary: ru, def: SHOPS.ru },
    { summary: intl, def: SHOPS.intl },
    { summary: wildberries, def: SHOPS.wildberries },
    { summary: ozon, def: SHOPS.ozon },
  ]),
)
// The same owner on cherkashino.com when the RU instance did not answer in time: its three sources
// are rows without numbers, the totals hold cherkashino.com only. (The file keeps its v1 name.)
write(
  "example.owner-summary.intl-late.json",
  ownerSummary(SHOPS.intl.tenant, [
    { state: "no_answer", def: SHOPS.ru },
    { summary: intl, def: SHOPS.intl },
    { state: "no_answer", def: SHOPS.wildberries },
    { state: "no_answer", def: SHOPS.ozon },
  ]),
)
// cherkashino.com belongs to the owner but is not linked to her RU sign-in yet.
write(
  "example.owner-summary.ru-missing.json",
  ownerSummary(SHOPS.ru.tenant, [
    { summary: ru, def: SHOPS.ru },
    { state: "not_connected", def: SHOPS.intl },
    { summary: wildberries, def: SHOPS.wildberries },
    { summary: ozon, def: SHOPS.ozon },
  ]),
)
write("example.shop-summary.wildberries.json", wildberries)
