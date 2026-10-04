import type { FeedOrder } from "./marketplace-orders"
import type { DeskItem } from "./marketplace-desk"
import type {
  MarketplaceId,
  MpAnalyticsParams,
  MpAnalyticsResponse,
  MpLinkState,
  MpOrdersParams,
  MpOrdersResponse,
  MpPriceStockParams,
  MpPriceStockResponse,
  MpPriceStockRow,
  MpPriceStockState,
  MpProductRow,
  MpProductsParams,
  MpProductsResponse,
  MpReviewsParams,
  MpReviewsResponse,
  MpSyncResponse,
} from "./marketplace-section"

/**
 * TEST DATA for the marketplace screens (mp-section-design). Deterministic:
 * the same seed gives the same 423 cards, 7 516 orders and 55 reviews on every
 * run, so a screenshot taken today matches one taken tomorrow. Nothing here is
 * a real card, order or buyer; the shape follows what `mp_product`,
 * `mp_offer`, `mp_order` and `mp_review` hold on the stand (423 cards, 12 035
 * offer lines, 7 516 WB orders, 55 reviews).
 *
 * Only `VITE_MP_FIXTURES=1` reaches this file; see `marketplace-section.tsx`.
 */

/* ---- a small seeded generator, so the numbers do not change between renders */
const rng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const NOW = new Date("2026-10-05T02:40:00+08:00")
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const daysAgo = (days: number, hour = 12) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

const TITLES = [
  "Мумиё алтайское очищенное, 100 таблеток",
  "Мазь с АСД-3 15%, 100 мл",
  "Иван-чай ферментированный крупнолистовой, 100 г",
  "Касторовое масло индийское холодного отжима, 100 мл",
  "Зубная паста тайская травяная, 2 шт",
  "Стевия в таблетках, сахарозаменитель, 200 шт",
  "Антисептик-стимулятор Дорогова АСД-2, 100 мл",
  "Бальзам горного Алтая с мумиё, 250 мл",
  "Свечи с АСД и чесноком, 10 шт",
  "Сорбент натуральный от отравлений, 50 г",
  "Тройчатка плюс, растительный комплекс, 90 капсул",
  "Карандаш-бальзам 2 в 1 от простуды, 5 г",
  "Гепачисты, травяной сбор для печени, 50 г",
  "Капсулы Антисептик Стимулятор, 60 капсул",
  "Тестер для воды электронный TDS-3",
  "Масло чёрного тмина эфиопское, 100 мл",
  "Сбор травяной «Очищение печени», 100 г",
  "Мультиварка для дома и авто, 2 л",
  "Книга рецептов для мультиварки",
  "Крем-бальзам с прополисом и барсучьим жиром, 75 мл",
  "Соль гималайская розовая крупная, 1 кг",
  "Масло льняное нерафинированное, 500 мл",
  "Настойка прополиса 20%, 50 мл",
  "Мыло дегтярное ручной работы, 100 г",
]
const BRANDS = ["Черкашино", "Алтайвитамины", "Дорогова", "Сила природы", "Фитосила"]
const CATEGORIES = [
  "БАДы и витамины",
  "Травяные сборы",
  "Косметика",
  "Товары для здоровья",
  "Товары для кухни",
]
const REGIONS = [
  "Москва",
  "Московская область",
  "Санкт-Петербург",
  "Ростовская область",
  "Краснодарский край",
  "Свердловская область",
  "Новосибирская область",
  "Татарстан",
]
const STATUSES: Array<[FeedOrder["status_key"], string, string]> = [
  ["new", "new", "Новый"],
  ["processing", "confirm", "В сборке"],
  ["shipped", "complete", "В доставке"],
  ["delivered", "sold", "Доставлен"],
  ["cancelled", "cancel", "Отменён"],
]
const AUTHORS = ["Елена", "Ольга", "Наталья", "Сергей", "Ирина", "Андрей", "Татьяна", "Покупатель"]
const REVIEW_TEXTS = [
  "Заказываю уже третий раз. Качество стабильное, упаковка целая, пришло быстро.",
  "Хороший состав, запах натуральный. Единственное — крышка туго открывается.",
  "Не подошло по вкусу, но претензий к товару нет. Продавец отвечает быстро.",
  "Отличный товар за свои деньги, рекомендую. Буду брать ещё.",
  "Пришла с помятой коробкой, сам продукт в порядке.",
  "Пользуюсь две недели, эффект есть. Спасибо!",
]
const QUESTION_TEXTS = [
  "Подскажите, срок годности какой на момент отправки?",
  "Это тот же состав, что продаётся в аптеке?",
  "Есть ли сертификат на продукт?",
  "Можно ли принимать детям с 6 лет?",
]

const CARD_COUNT = 423
const ORDER_COUNT = 7516

let cardsCache: MpProductRow[] | null = null

const buildCards = (marketplace: MarketplaceId): MpProductRow[] => {
  if (cardsCache) {
    return cardsCache
  }
  const next = rng(20261005)
  const cards: MpProductRow[] = []
  for (let i = 0; i < CARD_COUNT; i++) {
    const title = `${TITLES[i % TITLES.length]}${i >= TITLES.length ? ` (${Math.floor(i / TITLES.length) + 1})` : ""}`
    const externalId = String(168523959 + i * 7)
    const vendor = `${168523959 + i * 7}-CHERKASHINO`
    const price = Math.round((190 + next() * 2400) / 10) * 10
    const discounted = next() < 0.7 ? Math.round(price * (0.72 + next() * 0.2)) : null
    const stockKnown = next() < 0.93
    const stock = stockKnown ? Math.floor(next() * (next() < 0.15 ? 3 : 140)) : null
    const linkRoll = next()
    const state: MpLinkState = linkRoll < 0.78 ? "linked" : linkRoll < 0.94 ? "not_found" : "needs_choice"
    const synced = minutesAgo(Math.floor(next() * 90) + 15)
    cards.push({
      id: `mpprod_${String(i + 1).padStart(4, "0")}`,
      marketplace,
      external_id: externalId,
      vendor_code: vendor,
      title,
      brand: BRANDS[Math.floor(next() * BRANDS.length)],
      category_name: CATEGORIES[Math.floor(next() * CATEGORIES.length)],
      thumbnail: null,
      photos_count: 1 + Math.floor(next() * 7),
      price,
      discount_price: discounted,
      currency: "RUB",
      stock,
      offers: 1 + Math.floor(next() * 6),
      link: {
        state,
        product_id: state === "linked" ? `prod_${String(i + 1).padStart(4, "0")}` : null,
        product_title: state === "linked" ? TITLES[i % TITLES.length] : null,
        variant_id: state === "linked" ? `variant_${String(i + 1).padStart(4, "0")}` : null,
        matched_by: state === "linked" ? (next() < 0.9 ? "vendor_code" : "manual") : null,
        candidates: state === "needs_choice" ? 2 + Math.floor(next() * 2) : state === "linked" ? 1 : 0,
      },
      mp_updated_at: daysAgo(Math.floor(next() * 40), 9),
      synced_at: synced,
      url: `https://www.wildberries.ru/catalog/${externalId}/detail.aspx`,
    })
  }
  cardsCache = cards
  return cards
}

const paged = <T,>(rows: T[], params: { limit?: number; offset?: number }) => {
  const limit = params.limit ?? 20
  const offset = params.offset ?? 0
  return { rows: rows.slice(offset, offset + limit), limit, offset }
}

const sortBy = <T,>(rows: T[], order: string | undefined, pick: (row: T, key: string) => string | number | null) => {
  if (!order) {
    return rows
  }
  const desc = order.startsWith("-")
  const key = desc ? order.slice(1) : order
  return [...rows].sort((a, b) => {
    const va = pick(a, key)
    const vb = pick(b, key)
    if (va === vb) {
      return 0
    }
    if (va === null) {
      return 1
    }
    if (vb === null) {
      return -1
    }
    const cmp = va < vb ? -1 : 1
    return desc ? -cmp : cmp
  })
}

const matchesDate = (value: string | null, filter: string | undefined): boolean => {
  if (!filter) {
    return true
  }
  if (!value) {
    return false
  }
  try {
    const parsed = JSON.parse(filter) as { $gte?: string; $lte?: string }
    const t = new Date(value).getTime()
    if (parsed.$gte && t < new Date(parsed.$gte).getTime()) {
      return false
    }
    if (parsed.$lte && t > new Date(parsed.$lte).getTime()) {
      return false
    }
    return true
  } catch {
    return true
  }
}

const has = (list: string[] | undefined, value: string | null) =>
  !list || list.length === 0 || (value !== null && list.includes(value))

/* ---------------------------------------------------------------- products */

export const fixtureProducts = (
  marketplace: MarketplaceId,
  params: MpProductsParams
): MpProductsResponse => {
  const all = buildCards(marketplace)
  const q = (params.q ?? "").toLowerCase()
  let rows = all.filter(
    (row) =>
      (!q ||
        row.title?.toLowerCase().includes(q) ||
        row.vendor_code?.toLowerCase().includes(q) ||
        row.external_id.includes(q)) &&
      has(params.link_state, row.link.state) &&
      has(params.category, row.category_name) &&
      has(params.brand, row.brand) &&
      matchesDate(row.synced_at, params.synced_at)
  )
  rows = sortBy(rows, params.order, (row, key) => {
    switch (key) {
      case "title":
        return row.title
      case "vendor_code":
        return row.vendor_code
      case "price":
        return row.discount_price ?? row.price
      case "stock":
        return row.stock
      case "synced_at":
        return row.synced_at
      default:
        return null
    }
  })
  const page = paged(rows, params)
  const count = (list: string[]) =>
    list.map((value) => ({ value, label: value, count: all.filter((r) => r.category_name === value || r.brand === value).length }))
  return {
    products: page.rows,
    count: rows.length,
    limit: page.limit,
    offset: page.offset,
    sync: { kind: "cards", last_success_at: minutesAgo(18), cards: all.length, status: "succeeded" },
    categories: count(CATEGORIES),
    brands: count(BRANDS),
  }
}

/* ------------------------------------------------------------- price-stock */

let priceStockCache: MpPriceStockRow[] | null = null

const buildPriceStock = (marketplace: MarketplaceId): MpPriceStockRow[] => {
  if (priceStockCache) {
    return priceStockCache
  }
  const next = rng(17)
  const cards = buildCards(marketplace)
  const rows: MpPriceStockRow[] = cards.map((card, i) => {
    const mpPrice = card.discount_price ?? card.price
    const shopPrice = card.link.state === "linked" && mpPrice !== null ? Math.round(mpPrice * (0.85 + next() * 0.3)) : null
    const shopStock = card.link.state === "linked" ? Math.floor(next() * 60) : null
    const priceAbs = shopPrice !== null && mpPrice !== null ? mpPrice - shopPrice : null
    const pricePct = priceAbs !== null && shopPrice ? Math.round((priceAbs / shopPrice) * 1000) / 10 : null
    const stockAbs = shopStock !== null && card.stock !== null ? card.stock - shopStock : null
    const state: MpPriceStockState = card.link.state === "linked" ? "both" : "marketplace_only"
    return {
      id: `ps_${i + 1}`,
      external_id: card.external_id,
      vendor_code: card.vendor_code ?? card.external_id,
      title: card.title,
      thumbnail: null,
      state,
      shop:
        state === "both"
          ? {
              product_id: card.link.product_id ?? "",
              variant_id: card.link.variant_id ?? "",
              title: card.link.product_title,
              price: shopPrice,
              stock: shopStock,
            }
          : null,
      mp: {
        price: card.price,
        discount_price: card.discount_price,
        stock: card.stock,
        reserved: card.stock !== null ? Math.floor(card.stock * 0.1) : null,
        lines: card.offers * 3,
        warehouses: 1 + Math.floor(next() * 4),
        sizes: card.offers,
        price_measured_at: minutesAgo(40 + Math.floor(next() * 200)),
        stock_measured_at: minutesAgo(10 + Math.floor(next() * 80)),
        price_stale: next() < 0.08,
        stock_stale: next() < 0.12,
      },
      diff: {
        price_abs: priceAbs,
        price_pct: pricePct,
        stock_abs: stockAbs,
        highlighted: (pricePct !== null && Math.abs(pricePct) >= 10) || (stockAbs !== null && Math.abs(stockAbs) >= 1 && next() < 0.3),
      },
      currency: "RUB",
    }
  })
  // The 38 shop-only articles of the stand: goods the shop has and the marketplace does not.
  for (let i = 0; i < 38; i++) {
    rows.push({
      id: `ps_shop_${i + 1}`,
      external_id: null,
      vendor_code: `CH-${1000 + i}`,
      title: `${TITLES[(i * 5) % TITLES.length]} — только в магазине`,
      thumbnail: null,
      state: "shop_only",
      shop: {
        product_id: `prod_shop_${i}`,
        variant_id: `variant_shop_${i}`,
        title: TITLES[(i * 5) % TITLES.length],
        price: Math.round((150 + next() * 1500) / 10) * 10,
        stock: Math.floor(next() * 30),
      },
      mp: null,
      diff: { price_abs: null, price_pct: null, stock_abs: null, highlighted: false },
      currency: "RUB",
    })
  }
  priceStockCache = rows
  return rows
}

export const fixturePriceStock = (
  marketplace: MarketplaceId,
  params: MpPriceStockParams
): MpPriceStockResponse => {
  const all = buildPriceStock(marketplace)
  const q = (params.q ?? "").toLowerCase()
  const pricePct = params.price_pct ?? 10
  const stockAbs = params.stock_abs ?? 1
  const withThreshold = all.map((row) => ({
    ...row,
    diff: {
      ...row.diff,
      highlighted:
        (row.diff.price_pct !== null && Math.abs(row.diff.price_pct) >= pricePct) ||
        (row.diff.stock_abs !== null && Math.abs(row.diff.stock_abs) >= stockAbs),
    },
  }))
  let rows = withThreshold.filter(
    (row) =>
      (!q || row.title?.toLowerCase().includes(q) || row.vendor_code.toLowerCase().includes(q)) &&
      has(params.state, row.state) &&
      (params.over_threshold !== "true" || row.diff.highlighted)
  )
  rows = sortBy(rows, params.order, (row, key) => {
    switch (key) {
      case "title":
        return row.title
      case "vendor_code":
        return row.vendor_code
      case "price_pct":
        return row.diff.price_pct === null ? null : Math.abs(row.diff.price_pct)
      case "stock_abs":
        return row.diff.stock_abs === null ? null : Math.abs(row.diff.stock_abs)
      default:
        return null
    }
  })
  const page = paged(rows, params)
  return {
    rows: page.rows,
    count: rows.length,
    limit: page.limit,
    offset: page.offset,
    thresholds: { price_pct: pricePct, stock_abs: stockAbs },
    counts: {
      both: withThreshold.filter((r) => r.state === "both").length,
      shop_only: withThreshold.filter((r) => r.state === "shop_only").length,
      marketplace_only: withThreshold.filter((r) => r.state === "marketplace_only").length,
      over_threshold: withThreshold.filter((r) => r.diff.highlighted).length,
    },
    measured: { prices_at: minutesAgo(55), stocks_at: minutesAgo(12) },
  }
}

/* ------------------------------------------------------------------ orders */

let ordersCache: FeedOrder[] | null = null

const buildOrders = (): FeedOrder[] => {
  if (ordersCache) {
    return ordersCache
  }
  const next = rng(7516)
  const orders: FeedOrder[] = []
  for (let i = 0; i < ORDER_COUNT; i++) {
    const [key, raw, label] = STATUSES[Math.floor(next() * STATUSES.length)]
    const minutes = Math.floor(next() * 60 * 24 * 30)
    const unspecified = next() < 0.2
    orders.push({
      id: `mpord_${String(i + 1).padStart(5, "0")}`,
      source: "wb",
      source_label: "Wildberries",
      number: `${1_832_000_000 + i * 13}`,
      scheme: next() < 0.78 ? "FBS" : null,
      status_raw: unspecified ? null : raw,
      status_detail: unspecified ? null : label,
      status_key: unspecified ? "unspecified" : key,
      status_label: unspecified ? "Статус площадка не присылает" : label,
      ordered_at: minutesAgo(minutes),
      buyer_region: REGIONS[Math.floor(next() * REGIONS.length)],
      warehouse_name: next() < 0.5 ? "Коледино" : "Электросталь",
      total: Math.round((250 + next() * 3200) / 1) ,
      currency: "RUB",
      is_cancelled: key === "cancelled",
      lines_count: 1 + Math.floor(next() * 3),
    })
  }
  orders.sort((a, b) => (b.ordered_at ?? "").localeCompare(a.ordered_at ?? ""))
  ordersCache = orders
  return orders
}

export const fixtureOrders = (marketplace: MarketplaceId, params: MpOrdersParams): MpOrdersResponse => {
  const all = buildOrders()
  const q = (params.q ?? "").toLowerCase()
  let rows = all.filter(
    (row) =>
      (!q || row.number.includes(q) || row.buyer_region?.toLowerCase().includes(q)) &&
      has(params.status, row.status_key) &&
      has(params.scheme, row.scheme ?? "none") &&
      matchesDate(row.ordered_at, params.ordered_at)
  )
  rows = sortBy(rows, params.order, (row, key) => {
    switch (key) {
      case "ordered_at":
        return row.ordered_at
      case "total":
        return row.total
      case "number":
        return row.number
      default:
        return null
    }
  })
  const page = paged(rows, params)
  const facet = (pick: (o: FeedOrder) => string | null, label: (v: string) => string) => {
    const counts = new Map<string, number>()
    for (const o of all) {
      const v = pick(o)
      if (v !== null) {
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }
    return [...counts.entries()].map(([value, count]) => ({ value, label: label(value), count }))
  }
  return {
    orders: page.rows,
    count: rows.length,
    limit: page.limit,
    offset: page.offset,
    facets: {
      schemes: facet((o) => o.scheme, (v) => v),
      statuses: facet(
        (o) => o.status_key,
        (v) => STATUSES.find((s) => s[0] === v)?.[2] ?? "Статус площадка не присылает"
      ),
    },
    connection: {
      marketplace,
      label: "Wildberries",
      connected: true,
      last_run: {
        kind: "orders",
        status: "succeeded",
        started_at: minutesAgo(9),
        finished_at: minutesAgo(8),
        rows: 62,
        error: null,
        is_fixture: false,
      },
      rows_in_period: all.length,
      notice: null,
    },
    undated: 0,
  }
}

/* ----------------------------------------------------------------- reviews */

let reviewsCache: DeskItem[] | null = null

const buildReviews = (marketplace: MarketplaceId): DeskItem[] => {
  if (reviewsCache) {
    return reviewsCache
  }
  const next = rng(55)
  const cards = buildCards(marketplace)
  const items: DeskItem[] = []
  for (let i = 0; i < 55; i++) {
    const card = cards[Math.floor(next() * 40)]
    const rating = Math.min(5, Math.max(1, Math.round(3.9 + (next() - 0.5) * 2.4)))
    const answered = next() < 0.6
    const hasDraft = !answered && next() < 0.4
    items.push({
      id: `mprev_${i + 1}`,
      kind: "reviews",
      marketplace,
      external_id: `fb_${90000 + i}`,
      rating,
      text: REVIEW_TEXTS[i % REVIEW_TEXTS.length],
      pros: next() < 0.4 ? "Цена, скорость доставки" : null,
      cons: rating <= 3 ? "Упаковка" : null,
      author: AUTHORS[Math.floor(next() * AUTHORS.length)],
      created_at: daysAgo(Math.floor(next() * 60), Math.floor(next() * 14) + 8),
      is_answered: answered,
      answer_draft: hasDraft ? "Здравствуйте! Спасибо за отзыв. Мы передали замечание по упаковке на склад." : null,
      answer_draft_at: hasDraft ? daysAgo(1, 10) : null,
      product: {
        vendor_code: card.vendor_code,
        mp_title: card.title,
        mp_external_id: card.external_id,
        product_id: card.link.product_id,
        product_title: card.link.product_title,
        linked: card.link.state === "linked",
      },
    })
  }
  for (let i = 0; i < 12; i++) {
    const card = cards[Math.floor(next() * 40)]
    items.push({
      id: `mpq_${i + 1}`,
      kind: "questions",
      marketplace,
      external_id: `q_${7000 + i}`,
      rating: null,
      text: QUESTION_TEXTS[i % QUESTION_TEXTS.length],
      pros: null,
      cons: null,
      author: AUTHORS[Math.floor(next() * AUTHORS.length)],
      created_at: daysAgo(Math.floor(next() * 30), 11),
      is_answered: next() < 0.5,
      answer_draft: null,
      answer_draft_at: null,
      product: {
        vendor_code: card.vendor_code,
        mp_title: card.title,
        mp_external_id: card.external_id,
        product_id: card.link.product_id,
        product_title: card.link.product_title,
        linked: card.link.state === "linked",
      },
    })
  }
  items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
  reviewsCache = items
  return items
}

export const fixtureReviews = (marketplace: MarketplaceId, params: MpReviewsParams): MpReviewsResponse => {
  const all = buildReviews(marketplace)
  const q = (params.q ?? "").toLowerCase()
  let rows = all.filter(
    (row) =>
      (!q || row.text?.toLowerCase().includes(q) || row.product.mp_title?.toLowerCase().includes(q)) &&
      has(params.kind, row.kind) &&
      has(params.rating, row.rating === null ? null : String(row.rating)) &&
      has(params.answered, row.is_answered ? "yes" : "no") &&
      matchesDate(row.created_at, params.created_at)
  )
  rows = sortBy(rows, params.order, (row, key) => {
    switch (key) {
      case "created_at":
        return row.created_at
      case "rating":
        return row.rating
      default:
        return null
    }
  })
  const page = paged(rows, params)
  const count = (kind: DeskItem["kind"]) => ({
    total: all.filter((r) => r.kind === kind).length,
    unanswered: all.filter((r) => r.kind === kind && !r.is_answered).length,
  })
  return {
    items: page.rows,
    count: rows.length,
    limit: page.limit,
    offset: page.offset,
    counts: { reviews: count("reviews"), questions: count("questions") },
    generator: { available: true, id: "draft-generator", reason: "", remote: false },
    sending: {
      enabled: false,
      reason: "Ответ сохраняется у нас как черновик. Опубликовать его покупателю можно в личном кабинете Wildberries.",
    },
  }
}

/* --------------------------------------------------------------- analytics */

export const fixtureAnalytics = (marketplace: MarketplaceId, params: MpAnalyticsParams): MpAnalyticsResponse => {
  const next = rng(2026)
  const days = 30
  const to = new Date(NOW)
  const from = new Date(NOW)
  from.setDate(from.getDate() - (days - 1))
  const byDay: MpAnalyticsResponse["by_day"] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const orders = 160 + Math.floor(next() * 140) + (d.getDay() === 0 || d.getDay() === 6 ? 60 : 0)
    const units = Math.round(orders * (1.1 + next() * 0.3))
    const cancelledUnits = Math.floor(units * (0.05 + next() * 0.08))
    byDay.push({
      day: isoDay(d),
      revenue: Math.round(units * (560 + next() * 120)),
      orders,
      units,
      cancelled_units: cancelledUnits,
      cancelled_revenue: Math.round(cancelledUnits * 600),
    })
  }
  const totals = byDay.reduce(
    (acc, day) => ({
      revenue: acc.revenue + day.revenue,
      orders: acc.orders + day.orders,
      units: acc.units + day.units,
      cancelled_orders: acc.cancelled_orders + Math.round(day.cancelled_units * 0.9),
      cancelled_revenue: acc.cancelled_revenue + day.cancelled_revenue,
    }),
    { revenue: 0, orders: 0, units: 0, cancelled_orders: 0, cancelled_revenue: 0 }
  )
  const cards = buildCards(marketplace)
  const sold: MpAnalyticsResponse["cards"] = cards.slice(0, 140).map((card, i) => {
    const units = Math.max(1, Math.round(((140 - i) ** 1.6) / 3))
    const avg = card.discount_price ?? card.price ?? 500
    const revenue = units * avg
    return {
      id: card.id,
      external_id: card.external_id,
      vendor_code: card.vendor_code,
      title: card.title,
      thumbnail: null,
      revenue,
      units,
      orders: Math.round(units * 0.9),
      avg_price: avg,
      revenue_share: 0,
      abc: "C",
      xyz: (i % 7 === 0 ? null : i % 3 === 0 ? "Y" : i % 5 === 0 ? "Z" : "X") as "X" | "Y" | "Z" | null,
      stock: card.stock,
      days_to_zero: card.stock !== null ? Math.round(card.stock / (units / days) || 0) : null,
    }
  })
  const sum = sold.reduce((s, c) => s + c.revenue, 0)
  let cumulative = 0
  for (const card of sold) {
    card.revenue_share = Math.round((card.revenue / sum) * 1000) / 10
    cumulative += card.revenue / sum
    card.abc = cumulative <= 0.8 ? "A" : cumulative <= 0.95 ? "B" : "C"
  }
  const q = (params.q ?? "").toLowerCase()
  const filtered = sold.filter((c) => !q || c.title?.toLowerCase().includes(q) || c.vendor_code?.toLowerCase().includes(q))
  const page = paged(filtered, { limit: params.limit ?? 20, offset: params.offset })
  return {
    period: { from_day: isoDay(from), to_day: isoDay(to), days, is_default: !params.from && !params.to, default_days: 30 },
    currency: "RUB",
    totals: {
      ...totals,
      avg_order: Math.round(totals.revenue / totals.orders),
      cards_with_sales: sold.length,
      cards_total: cards.length,
      stock_units: cards.reduce((s, c) => s + (c.stock ?? 0), 0),
      stock_days_left: 23,
    },
    by_day: byDay,
    cards: page.rows,
    cards_count: filtered.length,
    limit: page.limit,
    offset: page.offset,
    rating: { value: 4.8, scale: 5, detail: "Рейтинг продавца по данным Wildberries на 4 октября" },
    connection: {
      marketplace,
      label: "Wildberries",
      connected: true,
      last_run: { kind: "orders", status: "succeeded", started_at: minutesAgo(9), finished_at: minutesAgo(8), rows: 62, error: null, is_fixture: false },
      rows_in_period: totals.orders,
      notice: null,
    },
  }
}

/* -------------------------------------------------------------------- sync */

export const fixtureSync = (marketplace: MarketplaceId): MpSyncResponse => {
  const kind = (
    kind: string,
    status: string | null,
    minutes: number,
    rows: number,
    interval: number,
    failure: string | null = null,
    extra: Partial<MpSyncResponse["marketplace"]["kinds"][number]> = {}
  ) => ({
    kind,
    status,
    is_fixture: false,
    started_at: status ? minutesAgo(minutes + 1) : null,
    finished_at: status ? minutesAgo(minutes) : null,
    rows: status ? rows : null,
    requests: status ? Math.max(1, Math.round(rows / 100)) : null,
    attempts: 1,
    error: failure,
    last_success_at: status === "succeeded" || status === "rate_limited" ? minutesAgo(minutes + (status === "rate_limited" ? 240 : 0)) : null,
    last_success_rows: rows,
    last_failure_at: failure ? minutesAgo(minutes + 180) : null,
    last_failure_error: failure,
    retry_at: status === "rate_limited" ? new Date(NOW.getTime() + 22 * 60_000).toISOString() : null,
    runs: 48,
    interval_ms: interval * 60_000,
    next_at: new Date(NOW.getTime() + Math.max(1, interval - minutes) * 60_000).toISOString(),
    due: false,
    due_reason: "interval_elapsed" as const,
    ...extra,
  })
  return {
    marketplace: {
      id: marketplace,
      label: "Wildberries",
      connection: { key: { set: true, last4: "c6Sg" }, is_enabled: true },
      credentials: { expires_at: "2027-03-17T00:00:00.000Z", expired: false, expires_in_days: 163, expiring_soon: false, error: null },
      kinds: [
        kind("cards", "succeeded", 18, 423, 60),
        kind("prices", "succeeded", 55, 463, 60),
        kind("stocks", "succeeded", 12, 11823, 15),
        kind("orders", "succeeded", 8, 62, 10),
        kind("sales", "succeeded", 9, 37, 10),
        kind("feedbacks", "rate_limited", 30, 55, 30, null),
        kind("questions", "rate_limited", 31, 12, 30, null),
        kind("card_analytics", "succeeded", 320, 140, 1440),
        kind("supplies", "succeeded", 7, 1286, 10),
        kind(
          "fbs_orders",
          "failed",
          6,
          17096,
          10,
          "429 Too Many Requests: {\"title\":\"too many requests\",\"detail\":\"limit 1 per 6s\",\"requestId\":\"6e1f…\"}"
        ),
      ],
    },
    warnings: [],
    schedule: { cron: "*/5 * * * *", stale_lock_ms: 30 * 60_000, expiry_warning_days: 14 },
    now: NOW.toISOString(),
  }
}
