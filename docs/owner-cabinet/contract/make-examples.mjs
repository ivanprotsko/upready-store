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

const shopSummary = (def) => {
  const rand = mulberry32(def.seed)
  const productIds = def.products.map(() => `prod_${ulid(rand)}`)

  // 90 days of orders, oldest first; days without orders are left out.
  const days = []
  for (let back = 89; back >= 0; back -= 1) {
    const date = addDays(TODAY, -back)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const lift = weekday === 0 || weekday === 6 ? 0.7 : 1
    // «today» is 09:00 in the morning: a third of a day.
    const share = back === 0 ? 0.35 : 1
    const currencies = [def.currency, ...(def.second ? [def.second.currency] : [])]
    for (const currency of currencies) {
      const part = currency === def.currency ? 1 - (def.second?.share ?? 0) : def.second.share
      const orders = Math.round(def.ordersPerDay * lift * share * part * (0.5 + rand()))
      if (orders === 0) continue
      let revenue = 0
      for (let i = 0; i < orders; i += 1) {
        revenue += round(def.price[0] + rand() * (def.price[1] - def.price[0]), def.step) * (1 + Math.floor(rand() * 2))
      }
      days.push({ date, currency_code: currency, revenue: round(revenue, def.step), order_count: orders })
    }
  }

  const sum = (from, to, currency) => {
    const rows = days.filter((d) => d.currency_code === currency && d.date >= from && d.date <= to)
    const revenue = round(rows.reduce((a, d) => a + d.revenue, 0), def.step)
    const order_count = rows.reduce((a, d) => a + d.order_count, 0)
    return { revenue, order_count, aov: order_count ? Math.round((revenue / order_count) * 100) / 100 : 0 }
  }

  const period = (length) => {
    const from = addDays(TODAY, -(length - 1))
    const prevTo = addDays(from, -1)
    const prevFrom = addDays(prevTo, -(length - 1))
    const currencyCodes = [def.currency, ...(def.second ? [def.second.currency] : [])]
    const currencies = currencyCodes
      .map((currency_code) => {
        const current = sum(from, TODAY, currency_code)
        const canceledCount = Math.floor(current.order_count * 0.04)
        return {
          currency_code,
          current,
          previous: sum(prevFrom, prevTo, currency_code),
          canceled: { order_count: canceledCount, revenue: round(canceledCount * current.aov, def.step) },
        }
      })
      // The main currency always stays, a second one only when the period holds it.
      .filter((bucket, index) => index === 0 || bucket.current.order_count > 0)
    const main = currencies[0].current
    let left = main.revenue
    const top_products = def.products.slice(0, 5).map((title, index) => {
      const weight = [0.24, 0.17, 0.12, 0.09, 0.07][index]
      const revenue = round(main.revenue * weight, def.step)
      left -= revenue
      return {
        product_id: productIds[index],
        title,
        currency_code: def.currency,
        quantity: Math.max(1, Math.round(revenue / ((def.price[0] + def.price[1]) / 2))),
        revenue,
      }
    })
    return { from, to: TODAY, currencies, top_products: main.revenue > 0 ? top_products : [] }
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
    periods: { today: period(1), "7d": period(7), "30d": period(30) },
    daily: days,
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
// totals are per currency over the sources that answered, never summed across currencies;
// `shops` counts the sources that hold that currency.
const ownerSummary = (current, entries) => {
  const totals = {}
  for (const key of ["today", "7d", "30d"]) {
    const byCurrency = new Map()
    for (const { summary } of entries.filter((e) => e.summary && (e.state ?? "ok") === "ok")) {
      for (const bucket of summary.periods[key].currencies) {
        const row = byCurrency.get(bucket.currency_code) ?? {
          currency_code: bucket.currency_code,
          revenue: 0,
          order_count: 0,
          previous_revenue: 0,
          shops: 0,
        }
        row.revenue = Math.round((row.revenue + bucket.current.revenue) * 100) / 100
        row.order_count += bucket.current.order_count
        row.previous_revenue = Math.round((row.previous_revenue + bucket.previous.revenue) * 100) / 100
        row.shops += 1
        byCurrency.set(bucket.currency_code, row)
      }
    }
    totals[key] = [...byCurrency.values()].map((row) => ({
      ...row,
      aov: row.order_count ? Math.round((row.revenue / row.order_count) * 100) / 100 : 0,
    }))
  }
  return {
    schema: "upready.owner-summary/v1",
    owner_sub: OWNER_SUB,
    current_tenant_id: current,
    computed_at: NOW,
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
