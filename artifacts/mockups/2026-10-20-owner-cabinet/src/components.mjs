// The prototype's components: plain functions, props → HTML, no state code (rule 60 p.1–2).
// They draw the tenant panel as it is (apps/tenant-panel: main-layout.tsx, owner-nav, routes/home)
// in its own colours (src/theme/hub-theme.css) plus what this task adds: «Сводка», the shop list
// in the «…» menu, the sign-in once.
import { changePct, count, escape, money, shortDate } from "./format.mjs"

const PERIOD_LABELS = { today: "Сегодня", "7d": "7 дней", "30d": "30 дней" }

// ---- icons: 15 px, the size of @medusajs/icons, stroke 1.5 --------------------------------------------

const ICONS = {
  ellipsis: '<circle cx="3.5" cy="7.5" r=".9"/><circle cx="7.5" cy="7.5" r=".9"/><circle cx="11.5" cy="7.5" r=".9"/>',
  chevronRight: '<path d="m6 3.5 4 4-4 4"/>',
  chevronLeft: '<path d="m9 3.5-4 4 4 4"/>',
  chevronDown: '<path d="m3.5 6 4 4 4-4"/>',
  check: '<path d="m3 8 3 3 6-7"/>',
  arrowOut: '<path d="M6 3.5H3.5v8h8V9"/><path d="M8.5 3.5h3v3M11.5 3.5 7 8"/>',
  house: '<path d="M2.5 7 7.5 2.5l5 4.5v5.5h-3.5V9h-3v3.5H2.5z"/>',
  stack: '<rect x="2.5" y="2.5" width="10" height="4" rx="1"/><rect x="2.5" y="8.5" width="10" height="4" rx="1"/>',
  receipt: '<path d="M3.5 1.5h8v12l-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M5.5 5h4M5.5 8h4"/>',
  tag: '<path d="M2 2h5.5l6 6-5.5 5.5-6-6z"/><circle cx="5" cy="5" r=".8"/>',
  shop: '<path d="M2 5.5 3 2.5h9l1 3"/><path d="M2 5.5c0 1.2 1 2 2 2s2-.8 2-2c0 1.2 1 2 1.5 2s2-.8 2-2c0 1.2 1 2 2 2s1.5-.8 1.5-2"/><path d="M3 7.5v5h9v-5"/>',
  megaphone: '<path d="M2.5 6v3h2l5 3V3l-5 3z"/><path d="M11.5 6a2 2 0 0 1 0 3"/>',
  grid: '<rect x="2.5" y="2.5" width="4" height="4" rx=".8"/><rect x="8.5" y="2.5" width="4" height="4" rx=".8"/><rect x="2.5" y="8.5" width="4" height="4" rx=".8"/><rect x="8.5" y="8.5" width="4" height="4" rx=".8"/>',
  cog: '<circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2M3.3 3.3l1.4 1.4M10.3 10.3l1.4 1.4M3.3 11.7l1.4-1.4M10.3 4.7l1.4-1.4"/>',
  search: '<circle cx="6.5" cy="6.5" r="4"/><path d="m9.5 9.5 3.5 3.5"/>',
  logout: '<path d="M6 2.5H3v10h3"/><path d="M9 4.5 12 7.5 9 10.5M12 7.5H5.5"/>',
  menu: '<path d="M2 4h11M2 7.5h11M2 11h11"/>',
  lock: '<rect x="3" y="6.5" width="9" height="6.5" rx="1.2"/><path d="M5 6.5V4.8a2.5 2.5 0 0 1 5 0v1.7"/>',
  info: '<circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 7v3.5M7.5 4.8v.1"/>',
  clock: '<circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 4v3.5l2.2 1.4"/>',
  telegram: '<path d="m13 2.5-11 4.3 3.6 1.3 1.3 4 2-2.3 2.9 2.2z"/><path d="m5.6 8.1 5.4-3.6"/>',
  star: '<path d="m7.5 1.8 1.7 3.6 3.9.4-2.9 2.6.8 3.8-3.5-2-3.5 2 .8-3.8L1.9 5.8l3.9-.4z"/>',
  help: '<circle cx="7.5" cy="7.5" r="6"/><path d="M5.8 5.8a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.3M7.5 10.6v.1"/>',
}

export const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 15 15" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`

const avatar = (letter, size = "xs") => `<span class="avatar avatar-${size}">${escape(letter)}</span>`

const button = ({ label, variant = "secondary", href, size = "small", iconName, full = false, attrs = "" }) => {
  const cls = `btn btn-${variant} btn-${size}${full ? " btn-full" : ""}`
  const inner = `${iconName ? icon(iconName) : ""}<span>${escape(label)}</span>`
  return href
    ? `<a class="${cls}" href="${escape(href)}" ${attrs}>${inner}</a>`
    : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`
}

const changeBadge = (pct) =>
  pct === null ? "" : `<span class="change ${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "+" : ""}${pct}%</span>`

const periodButtons = (active, links = {}) =>
  `<div class="periods">${Object.entries(PERIOD_LABELS)
    .map(([key, label]) =>
      button({ label, variant: key === active ? "primary" : "secondary", href: links[key], attrs: `data-period="${key}"` }),
    )
    .join("")}</div>`

// ---- the shell: sidebar + page, as main-layout.tsx and shell.tsx draw it ------------------------------

const shopMenu = (panel) => `
  <div class="dropdown" data-proto="shop-menu" role="menu">
    <div class="dropdown-head">
      ${avatar(panel.shop.letter, "sm")}
      <div class="dropdown-head-text">
        <span class="txt-plus truncate">${escape(panel.shop.name)}</span>
        <span class="txt-subtle truncate">${escape(panel.shop.domain)}</span>
      </div>
    </div>
    <div class="dropdown-sep"></div>
    <div class="dropdown-label">Мои магазины</div>
    ${panel.shops
      .map(
        (shop) => `
      <a class="dropdown-item${shop.current ? " is-current" : ""}" href="${escape(shop.href)}" role="menuitemradio" aria-checked="${shop.current ? "true" : "false"}" data-proto="shop-${escape(shop.instance)}">
        <span class="dropdown-check">${shop.current ? icon("check") : ""}</span>
        <span class="dropdown-item-text">
          <span class="truncate">${escape(shop.name)}</span>
          <span class="txt-subtle truncate">${escape(shop.domain)}</span>
        </span>
        ${shop.current ? "" : `<span class="dropdown-hint">без входа</span>`}
      </a>`,
      )
      .join("")}
    <div class="dropdown-sep"></div>
    <a class="dropdown-item" href="${escape(panel.logoutHref)}" role="menuitem">
      <span class="dropdown-check">${icon("logout", "muted")}</span>
      <span class="dropdown-item-text"><span>Выйти</span></span>
    </a>
  </div>`

const navLink = ({ label, iconName, href, active, counter, proto }) => `
  <a class="nav-item${active ? " is-active" : ""}" href="${escape(href ?? "#")}"${proto ? ` data-proto="${proto}"` : ""}>
    ${iconName ? icon(iconName, "muted") : '<span class="nav-indent"></span>'}
    <span class="truncate">${escape(label)}</span>
    ${counter ? `<span class="nav-counter">${count(counter)}</span>` : ""}
  </a>`

const navGroup = ({ label, iconName, open, items = [] }) => `
  <div class="nav-group">
    <div class="nav-item nav-group-head">
      ${icon(iconName, "muted")}<span class="truncate">${escape(label)}</span>
      ${icon(open ? "chevronDown" : "chevronRight", "muted nav-fold")}
    </div>
    ${open ? items.map((item) => navLink(item)).join("") : ""}
  </div>`

const sidebar = ({ panel, active, menuOpen, links }) => `
  <aside class="sidebar" data-proto="sidebar">
    <div class="sidebar-top">
      <div class="sidebar-header">
        <a class="shop-trigger${menuOpen ? " is-open" : ""}" href="${escape(menuOpen ? links.closeMenu : links.openMenu)}" data-proto="shop-trigger" aria-haspopup="menu" aria-expanded="${menuOpen ? "true" : "false"}">
          ${avatar(panel.shop.letter)}
          <span class="txt-plus truncate">${escape(panel.shop.name)}</span>
          ${icon("ellipsis", "muted")}
        </a>
        ${menuOpen ? shopMenu(panel) : ""}
      </div>
      <div class="dashed"></div>
    </div>
    <div class="sidebar-nav">
      <div class="search-trigger">${icon("search", "muted")}<span>Поиск</span><kbd>⌘K</kbd></div>
      <nav class="nav">
        ${
          panel.shops.length > 1
            ? navLink({ label: "Сводка", iconName: "stack", href: links.summary, active: active === "summary", proto: "nav-summary" })
            : ""
        }
        ${navLink({ label: "Обзор", iconName: "house", href: links.overview, active: active === "overview", proto: "nav-overview" })}
        ${navGroup({
          label: "Продажи",
          iconName: "receipt",
          open: true,
          items: [
            { label: "Заказы", counter: panel.counters.ordersToPack },
            { label: "Клиенты" },
            { label: "Отзывы", counter: panel.counters.reviewsToModerate },
          ],
        })}
        ${navGroup({ label: "Каталог", iconName: "tag" })}
        ${navGroup({ label: "Витрина", iconName: "shop" })}
        ${navGroup({ label: "Маркетинг", iconName: "megaphone" })}
        ${
          panel.marketplaces
            ? `<div class="nav-heading">Торговые площадки</div>
               ${navLink({ label: "Wildberries", iconName: "grid" })}
               ${navLink({ label: "Ozon", iconName: "grid" })}`
            : ""
        }
        ${navGroup({ label: "Настройки", iconName: "cog" })}
      </nav>
    </div>
    <div class="sidebar-bottom">
      <a class="nav-item" href="#">${icon("help", "muted")}<span>Справка</span></a>
      <div class="dashed"></div>
      <div class="user-row">${avatar(panel.user.letter)}<span class="truncate">${escape(panel.user.name)}</span>${icon("ellipsis", "muted")}</div>
    </div>
  </aside>`

/** The phone's top bar: the menu button and the shop's name, as shell.tsx draws it under 768 px. */
const mobileBar = ({ panel, links, drawerOpen, title }) => `
  <header class="mobile-bar">
    <a class="icon-btn" href="${escape(drawerOpen ? links.closeMenu : links.openDrawer ?? links.openMenu)}" aria-label="Открыть меню">${icon("menu")}</a>
    <span class="txt-plus truncate">${escape(title)}</span>
    <span class="mobile-shop">${avatar(panel.shop.letter)}</span>
  </header>`

export const shell = ({ panel, active, menuOpen = false, drawerOpen = false, links, title, bar, body }) => `
  <div class="app${drawerOpen ? " drawer-open" : ""}">
    ${drawerOpen ? `<a class="scrim" href="${escape(links.closeMenu)}" aria-label="Закрыть меню"></a>` : ""}
    ${sidebar({ panel, active, menuOpen, links })}
    <div class="main">
      <div class="head${bar ? " has-bar" : ""}">
        ${mobileBar({ panel, links, drawerOpen, title })}
        <div class="topbar">
          <span class="crumb">${escape(title)}</span>
          <span class="host">${icon("lock", "muted")}${escape(panel.host)}</span>
        </div>
        ${bar ?? ""}
      </div>
      <main class="page">${body}</main>
    </div>
  </div>`

// ---- the period bar pinned under the top bar (Ivan 20.10, mark 4: «контролы нужно загрепить в хедере по аналогии
// как в яндекс метрике») ------------------------------------------------------------------------------------------

const BAR_PERIODS = [
  ["today", "Сегодня"],
  ["yesterday", "Вчера"],
  ["7d", "Неделя"],
  ["30d", "Месяц"],
  ["90d", "Квартал"],
]
const PERIOD_DAYS = { today: 1, "7d": 7, "30d": 30 }

export const periodBar = ({ period = "7d", days }) => {
  const shown = days.slice(-PERIOD_DAYS[period])
  const range =
    shown.length > 1 ? `${shortDate(shown[0]).replace(/ .*/, "")} — ${shortDate(shown[shown.length - 1])}` : shortDate(shown[0])
  return `
    <div class="period-bar" data-proto="period-bar">
      <div class="seg seg-periods" role="radiogroup" aria-label="Период">
        ${BAR_PERIODS.map(([key, label]) => `<span class="seg-item${key === period ? " is-on" : ""}" role="radio" aria-checked="${key === period}">${label}</span>`).join("")}
        <span class="seg-item seg-range is-on-soft">${range}${icon("chevronDown", "muted")}</span>
      </div>
      <span class="btn btn-secondary btn-small bar-pill bar-pill-range">${range}${icon("chevronDown", "muted")}</span>
      <span class="btn btn-secondary btn-small bar-pill">По дням${icon("chevronDown", "muted")}</span>
    </div>`
}

// ---- «Сводка»: the sales sources of the owner ---------------------------------------------------------------------

const SOURCE_LABEL = { wildberries: "Wildberries", ozon: "Ozon" }
const instanceWord = { ru: "cherkashino.ru", intl: "cherkashino.com" }

/** A row's name: the shop's domain for a storefront (mark 5: «в магазине просто писать домен»), the marketplace's name otherwise. */
const sourceLabel = (entry, panelShops) =>
  SOURCE_LABEL[entry.source] ??
  entry.summary?.shop.primary_domain ??
  panelShops.find((shop) => shop.tenant_id === entry.tenant_id)?.domain ??
  ""

const sourceKey = (entry) => `${entry.instance}-${entry.source}`

const totalsCard = ({ label, rows, proto }) => `
  <div class="stat" ${proto ? `data-proto="${proto}"` : ""}>
    <span class="txt-subtle">${escape(label)}</span>
    ${rows.map((row) => `<div class="stat-row"><span class="stat-value">${row.value}</span>${row.badge ?? ""}</div>`).join("")}
  </div>`

// A chart scale with round steps: 1, 2, 2.5 or 5 times a power of ten, four or five lines; whole steps for counts.
const niceScale = (max, whole) => {
  const raw = Math.max(Math.max(max, 1) / 4, whole ? 1 : 0)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)
  const top = Math.ceil(Math.max(max, 1) / step) * step
  return { step, top }
}
const compact = (value) => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value)
const CURRENCY_SIGN = { rub: "₽", eur: "€", usd: "$" }

const plot = ({ series, days, value, format, proto, whole = false }) => {
  const totals = days.map((day) => series.reduce((a, s) => a + (value(s, day) ?? 0), 0))
  const { step, top } = niceScale(Math.max(...totals), whole)
  const ticks = []
  for (let v = top; v >= 0; v -= step) ticks.push(v)
  const every = days.length > 14 ? 5 : 1
  const bars = days
    .map((day, d) => {
      const parts = series
        .map((s) => {
          const n = value(s, day) ?? 0
          return n ? `<span class="bar-part shop-${s.color}" style="height:${((n / totals[d]) * 100).toFixed(2)}%"></span>` : ""
        })
        .join("")
      const tip = `${shortDate(day)}: ${series.map((s) => `${s.label} ${format(value(s, day) ?? 0)}`).join(", ")}`
      const label = (days.length - 1 - d) % every === 0 ? shortDate(day) : ""
      return `<div class="col" title="${escape(tip)}">
        <div class="col-bar">${days.length <= 14 && totals[d] ? `<span class="col-total">${format(totals[d])}</span>` : ""}<div class="col-stack" style="height:${((totals[d] / top) * 100).toFixed(2)}%">${parts}</div></div>
        <span class="col-date">${label}</span>
      </div>`
    })
    .join("")
  return `
    <div class="plot" data-proto="${proto}">
      <div class="plot-grid">${ticks.map((v) => `<div class="grid-line"><span class="grid-label">${format(v)}</span></div>`).join("")}</div>
      <div class="plot-cols">${bars}</div>
    </div>`
}

/**
 * Orders or sales by day of the period, one colour per source (marks 3 and 14). «Заказы | Сумма» and the currency are
 * radio buttons styled as a segmented control: CSS shows the chosen plot, the page carries no script. Sums are drawn one
 * currency at a time, never added across currencies.
 */
export const salesChart = ({ series, days, mode = "orders", currency, title = "Продажи по дням" }) => {
  const inPeriod = new Set(days)
  const currencies = [...new Set(series.flatMap((s) => s.daily.filter((row) => inPeriod.has(row.date)).map((row) => row.currency_code)))]
  const chosen = currency ?? currencies[0]
  const ordersOf = (s, day) => s.daily.filter((row) => row.date === day).reduce((a, row) => a + row.order_count, 0)
  const revenueOf = (code) => (s, day) => s.daily.find((row) => row.date === day && row.currency_code === code)?.revenue ?? 0
  const legend = (valueOf, format, list) =>
    `<div class="legend">${list
      .map((s) => `<span><span class="dot shop-${s.color}"></span>${escape(s.label)}<span class="legend-value">${format(days.reduce((a, day) => a + valueOf(s, day), 0))}</span></span>`)
      .join("")}</div>`
  const withCurrency = (code) => series.filter((s) => s.daily.some((row) => inPeriod.has(row.date) && row.currency_code === code))
  return `
    <section class="container chart-block" data-proto="chart">
      <input class="sr" type="radio" name="chart-mode" id="mode-orders"${mode === "orders" ? " checked" : ""}>
      <input class="sr" type="radio" name="chart-mode" id="mode-sum"${mode === "sum" ? " checked" : ""}>
      ${currencies.map((code) => `<input class="sr" type="radio" name="chart-cur" id="cur-${code}"${code === chosen ? " checked" : ""}>`).join("")}
      <div class="chart-head">
        <h2 class="h2">${escape(title)}</h2>
        <div class="chart-tools">
          <div class="seg" data-proto="chart-mode"><label class="seg-item" for="mode-orders">Заказы</label><label class="seg-item" for="mode-sum">Сумма</label></div>
          ${currencies.length > 1 ? `<div class="seg seg-cur" data-proto="chart-currency">${currencies.map((code) => `<label class="seg-item" for="cur-${code}">${CURRENCY_SIGN[code] ?? code.toUpperCase()}</label>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="plots">
        <div class="plot-wrap plot-orders">
          <span class="axis-caption">заказов в день</span>
          ${plot({ series, days, value: ordersOf, format: count, proto: "plot-orders", whole: true })}
          ${legend(ordersOf, count, series)}
        </div>
        ${currencies
          .map(
            (code) => `
        <div class="plot-wrap plot-sum plot-sum-${code}">
          <span class="axis-caption">сумма заказов в день, ${CURRENCY_SIGN[code] ?? code.toUpperCase()}</span>
          ${plot({ series: withCurrency(code), days, value: revenueOf(code), format: compact, proto: `plot-sum-${code}` })}
          ${legend(revenueOf(code), (v) => money(v, code), withCurrency(code))}
        </div>`,
          )
          .join("")}
      </div>
    </section>`
}

const chartSeries = (sources, panelShops) =>
  sources
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.state === "ok")
    .map(({ entry, index }) => ({ label: sourceLabel(entry, panelShops), color: index, daily: entry.summary.daily }))

const rowState = ({ entry, label, index, links }) => {
  const text =
    entry.state === "no_answer"
      ? `${instanceWord[entry.instance]} не ответил при загрузке страницы. Цифр нет, в итоги не вошёл.`
      : "Магазин ещё не связан с вашим входом. Цифры появятся после первого входа через cherkashino.ru."
  const action =
    entry.state === "no_answer"
      ? button({ label: "Повторить", href: links.retry })
      : button({ label: "Связать", href: links.connect })
  return `
      <div class="shop-row is-quiet" role="row" data-proto="source-row-${index}" data-state="${entry.state}">
        <div class="shop-cell-name"><span class="dot shop-${index}"></span><span class="txt-plus truncate">${escape(label)}</span></div>
        <div class="row-state">${icon("info", "muted")}<span>${text}</span></div>
        <div class="row-action">${action}</div>
      </div>`
}

const sourceRow = ({ entry, period, panelShops, index, links }) => {
  const label = sourceLabel(entry, panelShops)
  if (entry.state !== "ok") return rowState({ entry, label, index, links })
  const summary = entry.summary
  const buckets = summary.periods[period].currencies
  const revenue = buckets
    .map((b) => `<span class="nowrap">${money(b.current.revenue, b.currency_code)} ${changeBadge(changePct(b.current.revenue, b.previous.revenue))}</span>`)
    .join("")
  const orders = buckets.reduce((a, b) => a + b.current.order_count, 0)
  const aov = buckets.map((b) => `<span class="nowrap">${money(b.current.aov, b.currency_code)}</span>`).join("")
  return `
    <a class="shop-row" role="row" href="${escape(links.detail[sourceKey(entry)] ?? "#")}" data-proto="source-row-${index}">
      <div class="shop-cell-name"><span class="dot shop-${index}"></span><span class="txt-plus truncate">${escape(label)}</span></div>
      <div class="cell" data-label="Выручка">${revenue}</div>
      <div class="cell" data-label="Заказы">${count(orders)}</div>
      <div class="cell" data-label="Ср. чек">${aov}</div>
      <div class="cell" data-label="В сборке">${summary.orders.to_pack ? count(summary.orders.to_pack) : "—"}</div>
      <div class="cell" data-label="Отзывы"><span class="nowrap">${icon("star", "star")} ${summary.reviews.average_rating ?? "—"}</span></div>
      <div class="cell go">${icon("chevronRight", "muted")}</div>
    </a>`
}

const topProducts = ({ sources, period, panelShops }) => `
  <div class="tops">
    ${sources
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.state === "ok")
      .map(
        ({ entry, index }) => `
      <div class="top">
        <div class="top-head"><span class="dot shop-${index}"></span><span class="txt-plus">${escape(sourceLabel(entry, panelShops))}</span></div>
        <ol class="top-list">
          ${entry.summary.periods[period].top_products
            .map(
              (p) => `<li><span class="truncate">${escape(p.title)}</span><span class="txt-subtle nowrap">${count(p.quantity)} шт — ${money(p.revenue, p.currency_code)}</span></li>`,
            )
            .join("")}
        </ol>
      </div>`,
      )
      .join("")}
  </div>`

export const summaryPage = ({ data, panel, period = "7d", days, loading = false, chartMode = "orders", chartCurrency, links }) => {
  const sources = data.shops
  const totals = data.totals[period]
  const header = `<div class="page-head"><h1 class="h1">Сводка</h1></div>`
  const shown = days.slice(-PERIOD_DAYS[period])

  if (loading) {
    return `
      <section class="container" data-proto="summary">
        ${header}
        <div class="stats">${[1, 2, 3, 4].map(() => '<div class="stat"><span class="skeleton w-60"></span><span class="skeleton h-24 w-120"></span></div>').join("")}</div>
      </section>
      <section class="container flush" data-proto="sources">
        <div class="section-head"><h2 class="h2">Источники продаж</h2></div>
        <div class="skeleton-table">${sources.map(() => '<span class="skeleton h-40 w-full"></span>').join("")}</div>
      </section>`
  }

  const orders = totals.reduce((a, row) => a + row.order_count, 0)
  const silent = sources.filter((entry) => entry.state !== "ok")
  return `
    <section class="container" data-proto="summary">
      ${header}
      <div class="stats">
        ${totalsCard({
          label: "Выручка",
          proto: "total-revenue",
          rows: totals.map((row) => ({ value: money(row.revenue, row.currency_code), badge: changeBadge(changePct(row.revenue, row.previous_revenue)) })),
        })}
        ${totalsCard({ label: "Заказы", proto: "total-orders", rows: [{ value: count(orders) }] })}
        ${totalsCard({ label: "Ср. чек", rows: totals.map((row) => ({ value: money(row.aov, row.currency_code) })) })}
        ${totalsCard({ label: "В сборке", rows: [{ value: count(data.attention.to_pack) }] })}
      </div>
      <p class="txt-subtle note">Выручка в разных валютах показана отдельно: рубли и евро не складываются.${
        silent.length ? ` В итогах нет: ${silent.map((entry) => escape(sourceLabel(entry, panel.shops))).join(", ")}.` : ""
      }</p>
    </section>

    <section class="container flush" data-proto="sources">
      <div class="section-head"><h2 class="h2">Источники продаж</h2></div>
      <div class="shop-table" role="table">
        <div class="shop-row shop-head" role="row">
          <div>Источник</div><div>Выручка</div><div>Заказы</div><div>Ср. чек</div><div>В сборке</div><div>Отзывы</div><div></div>
        </div>
        ${sources.map((entry, index) => sourceRow({ entry, period, panelShops: panel.shops, index, links })).join("")}
      </div>
    </section>

    ${salesChart({ series: chartSeries(sources, panel.shops), days: shown, mode: chartMode, currency: chartCurrency })}

    <section class="container">
      <div class="section-head-row"><h2 class="h2">Топ товаров</h2></div>
      ${topProducts({ sources, period, panelShops: panel.shops })}
    </section>`
}

// ---- a source's own statistics, opened from its row (mark 2) ----------------------------------------------------

export const sourcePage = ({ data, index, panel, period = "7d", days, chartMode = "orders", links }) => {
  const entry = data.shops[index]
  const summary = entry.summary
  const label = sourceLabel(entry, panel.shops)
  const buckets = summary.periods[period].currencies
  const shown = days.slice(-PERIOD_DAYS[period])
  const kind = entry.source === "storefront" ? `Сайт магазина «${escape(summary.shop.name)}»` : `Маркетплейс, магазин ${escape(summary.shop.primary_domain)}`
  const orders = buckets.reduce((a, b) => a + b.current.order_count, 0)
  const previousOrders = buckets.reduce((a, b) => a + b.previous.order_count, 0)
  const canceled = buckets.reduce((a, b) => a + b.canceled.order_count, 0)
  const reviews = summary.reviews
  const ratingMax = Math.max(1, ...Object.values(reviews.by_rating))
  const main = buckets[0]
  const products = summary.periods[period].top_products
  return `
    <section class="container" data-proto="source-head">
      <a class="back" href="${escape(links.summary)}">${icon("chevronLeft", "muted")}<span>Сводка</span></a>
      <div class="page-head">
        <div><h1 class="h1">${escape(label)}</h1><p class="txt-subtle">${kind}</p></div>
      </div>
      <div class="stats five">
        ${totalsCard({ label: "Выручка", rows: buckets.map((b) => ({ value: money(b.current.revenue, b.currency_code), badge: changeBadge(changePct(b.current.revenue, b.previous.revenue)) })) })}
        ${totalsCard({ label: "Заказы", rows: [{ value: count(orders), badge: changeBadge(changePct(orders, previousOrders)) }] })}
        ${totalsCard({ label: "Ср. чек", rows: buckets.map((b) => ({ value: money(b.current.aov, b.currency_code), badge: changeBadge(changePct(b.current.aov, b.previous.aov)) })) })}
        ${totalsCard({ label: "Отменены", rows: [{ value: count(canceled) }] })}
        ${totalsCard({ label: "В сборке", rows: [{ value: count(summary.orders.to_pack) }] })}
      </div>
    </section>

    ${salesChart({ series: [{ label, color: index, daily: summary.daily }], days: shown, mode: chartMode })}

    <div class="split">
      <section class="container flush" data-proto="source-products">
        <div class="section-head"><h2 class="h2">Топ товаров</h2></div>
        <div class="prod-table">
          <div class="prod-row prod-head"><span>Товар</span><span>Продано</span><span>Выручка</span><span>Доля</span></div>
          ${products
            .map(
              (p) => `<div class="prod-row"><span class="truncate">${escape(p.title)}</span><span>${count(p.quantity)} шт</span><span class="nowrap">${money(p.revenue, p.currency_code)}</span><span>${main.current.revenue ? Math.round((p.revenue / main.current.revenue) * 100) : 0}%</span></div>`,
            )
            .join("")}
        </div>
      </section>
      <section class="container" data-proto="source-reviews">
        <div class="section-head-row"><h2 class="h2">Отзывы</h2><span class="nowrap">${icon("star", "star")} <span class="txt-plus">${reviews.average_rating ?? "—"}</span></span></div>
        <div class="rating-bars">
          ${[5, 4, 3, 2, 1]
            .map(
              (star) => `<div class="rating-row"><span>${star}</span><span class="rating-track"><span style="width:${((reviews.by_rating[star] / ratingMax) * 100).toFixed(1)}%"></span></span><span class="txt-subtle">${count(reviews.by_rating[star])}</span></div>`,
            )
            .join("")}
        </div>
        <div class="kv"><span class="txt-subtle">Всего опубликовано</span><span>${count(reviews.published)}</span></div>
        <div class="kv"><span class="txt-subtle">Новых за 30 дней</span><span>${count(reviews.new_30d)}</span></div>
        <div class="kv"><span class="txt-subtle">Ждут проверки</span><span>${count(reviews.pending)}</span></div>
      </section>
    </div>

    <section class="container" data-proto="source-catalog">
      <div class="section-head-row"><h2 class="h2">Товары</h2></div>
      <div class="stats two">
        ${totalsCard({ label: "Опубликовано", rows: [{ value: count(summary.catalog.published) }] })}
        ${totalsCard({ label: "Черновики", rows: [{ value: count(summary.catalog.draft) }] })}
      </div>
    </section>`
}

// ---- a shop's «Обзор», as routes/home/home.tsx draws it ----------------------------------------------

export const overviewPage = ({ summary, plan, period = "7d", days }) => {
  const bucket = summary.periods[period].currencies[0]
  const others = summary.periods[period].currencies.slice(1)
  const attention = [
    summary.orders.to_pack && {
      n: summary.orders.to_pack,
      title: "Заказы ждут сборки",
      hint: "Соберите посылки и передайте их в доставку.",
    },
    summary.reviews.pending && {
      n: summary.reviews.pending,
      title: "Отзывы ждут проверки",
      hint: "Покупатели увидят отзыв после того, как вы его одобрите.",
    },
    summary.catalog.draft && {
      n: summary.catalog.draft,
      title: "Товары в черновиках",
      hint: "Покупатели их не видят, пока вы их не опубликуете.",
    },
  ].filter(Boolean)
  const daily = new Map(summary.daily.filter((d) => d.currency_code === bucket.currency_code).map((d) => [d.date, d.revenue]))
  const shown = days.slice(-7)
  const max = Math.max(1, ...shown.map((d) => daily.get(d) ?? 0))
  const metric = (label, value, pct) => `
    <div class="stat"><span class="txt-subtle">${label}</span><div class="stat-row"><span class="stat-value">${value}</span>${changeBadge(pct)}</div></div>`
  return `
    <section class="container flush" data-proto="attention">
      <div class="section-head"><h2 class="h2">Что сделать сейчас</h2></div>
      ${attention
        .map(
          (row) => `
        <a class="attention-row" href="#">
          <span class="count-pill">${row.n}</span>
          <span class="attention-text"><span class="txt-plus">${row.title}</span><span class="txt-subtle">${row.hint}</span></span>
          ${icon("chevronRight", "muted")}
        </a>`,
        )
        .join("")}
    </section>
    <section class="container" data-proto="overview">
      <div class="page-head">
        <h1 class="h1">${escape(summary.shop.name)}</h1>
        <span class="txt-subtle">Тариф: ${escape(plan)}</span>
      </div>
      <div class="stats two">
        <div class="stat"><span class="txt-subtle">Опубликовано</span><span class="stat-value">${count(summary.catalog.published)}</span></div>
        <div class="stat"><span class="txt-subtle">Черновики</span><span class="stat-value">${count(summary.catalog.draft)}</span></div>
      </div>
      <div class="ruled">
        <div class="page-head"><h2 class="h2">Продажи</h2>${periodButtons(period)}</div>
        <div class="stats three">
          ${metric("Выручка", money(bucket.current.revenue, bucket.currency_code), changePct(bucket.current.revenue, bucket.previous.revenue))}
          ${metric("Заказы", count(bucket.current.order_count), changePct(bucket.current.order_count, bucket.previous.order_count))}
          ${metric("Средний чек", money(bucket.current.aov, bucket.currency_code), changePct(bucket.current.aov, bucket.previous.aov))}
        </div>
        ${
          bucket.canceled.order_count
            ? `<p class="txt-subtle note">Отменённых заказов за период: ${bucket.canceled.order_count} на ${money(bucket.canceled.revenue, bucket.currency_code)}. В выручку они не входят.</p>`
            : ""
        }
        ${
          others.length
            ? `<p class="txt-subtle note">Ещё заказы в других валютах: ${others.map((o) => `${money(o.current.revenue, o.currency_code)} — заказов: ${o.current.order_count}`).join(", ")}. В цифры выше они не входят — переключите валюту, чтобы посмотреть.</p>`
            : ""
        }
        <div class="mini-chart">
          <span class="txt-subtle">Выручка по дням</span>
          <div class="mini-bars">${shown
            .map((d) => `<span class="mini-bar"><span style="height:${(((daily.get(d) ?? 0) / max) * 100).toFixed(1)}%"></span><span class="txt-subtle">${shortDate(d)}</span></span>`)
            .join("")}</div>
        </div>
        <div class="top">
          <span class="txt-subtle">Топ товаров</span>
          <ol class="top-list">${summary.periods[period].top_products
            .map((p) => `<li><span class="truncate">${escape(p.title)}</span><span class="txt-subtle nowrap">${count(p.quantity)} шт — ${money(p.revenue, p.currency_code)}</span></li>`)
            .join("")}</ol>
        </div>
      </div>
    </section>`
}

// ---- the plain pages: sign-in, the switch on its way, the first link --------------------------------

export const plain = ({ body }) => `<div class="plain">${body}</div>`

const brandHead = ({ letter, title, hint, host }) => `
  <div class="auth-head">
    ${avatar(letter, "lg")}
    <h1 class="h1">${escape(title)}</h1>
    ${hint ? `<p class="txt-subtle">${escape(hint)}</p>` : ""}
    ${host ? `<span class="host">${icon("lock", "muted")}${escape(host)}</span>` : ""}
  </div>`

const field = ({ label, value = "", type = "text", placeholder = "" }) => `
  <label class="field"><span class="field-label">${escape(label)}</span><span class="input${value ? "" : " is-empty"}">${escape(value || placeholder)}${type === "password" && value ? "" : ""}</span></label>`

export const loginRu = ({ next }) => `
  <div class="auth" data-proto="login-ru">
    ${brandHead({ letter: "Ч", title: "Вход в панель магазина", hint: "Войдите, чтобы получить доступ к панели управления", host: "panel.cherkashino.ru" })}
    <div class="auth-form">
      ${field({ label: "Почта", value: "owner@cherkashino.ru" })}
      ${field({ label: "Пароль", value: "••••••••••", type: "password" })}
      ${button({ label: "Продолжить", variant: "primary", href: next, full: true, attrs: 'data-proto="login-submit"' })}
    </div>
    <p class="auth-once" data-proto="once">${icon("info", "muted")}<span>Один вход на все ваши магазины. После него cherkashino.com откроется из меню «…» без пароля.</span></p>
    <p class="txt-subtle auth-foot">Забыли пароль? <a class="link" href="#">Сбросить</a></p>
  </div>`

export const loginCom = ({ viaRu, other }) => `
  <div class="auth" data-proto="login-com">
    ${brandHead({ letter: "C", title: "Вход в панель магазина", hint: "Cherkashino, cherkashino.com", host: "panel.cherkashino.com" })}
    <div class="auth-form">
      ${button({ label: "Войти через cherkashino.ru", variant: "primary", href: viaRu, full: true, size: "large", attrs: 'data-proto="via-ru"' })}
      <p class="txt-subtle auth-why">Ваш вход хранится в России, на cherkashino.ru. Сюда пароль не передаётся: cherkashino.ru только подтверждает, что это вы.</p>
      <div class="or"><span>или</span></div>
      ${button({ label: "Войти через Telegram", variant: "secondary", href: other, full: true, iconName: "telegram" })}
      ${button({ label: "Войти по почте", variant: "transparent", href: other, full: true })}
    </div>
  </div>`

export const linkFirst = ({ next, back }) => `
  <div class="auth" data-proto="link-first">
    ${brandHead({ letter: "C", title: "Связать cherkashino.com с вашим входом", host: "panel.cherkashino.com" })}
    <div class="auth-form">
      <p class="auth-text">cherkashino.ru подтвердил, что вы — владелец «Черкашино». На cherkashino.com есть магазин Cherkashino с почтой o•••@cherkashino.ru.</p>
      <p class="auth-text">Введите пароль от cherkashino.com один раз. Дальше он не понадобится: оба магазина будут открываться одним входом.</p>
      ${field({ label: "Пароль от cherkashino.com", value: "••••••••", type: "password" })}
      ${button({ label: "Связать и открыть", variant: "primary", href: next, full: true, attrs: 'data-proto="link-submit"' })}
      ${button({ label: "Не сейчас", variant: "transparent", href: back, full: true })}
    </div>
  </div>`

export const switching = ({ next, target }) => `
  <div class="auth" data-proto="switching">
    ${brandHead({ letter: "C", title: `Открываем ${target}`, host: "panel.cherkashino.com" })}
    <div class="auth-form">
      <div class="progress"><span></span></div>
      <p class="auth-text">Вход подтверждён в cherkashino.ru. Пароль вводить не нужно.</p>
      ${button({ label: "Открыть сейчас", variant: "secondary", href: next, full: true })}
    </div>
  </div>`

export const ticketUsed = ({ next, back }) => `
  <div class="auth" data-proto="ticket-used">
    ${brandHead({ letter: "C", title: "Ссылка для входа устарела", host: "panel.cherkashino.com" })}
    <div class="auth-form">
      <p class="auth-text">Ссылка из cherkashino.ru живёт одну минуту и открывается один раз. Эту уже открыли, или минута прошла.</p>
      <p class="auth-text">Ваш вход в cherkashino.ru в порядке: откройте магазин из меню «…» ещё раз.</p>
      ${button({ label: "Открыть через cherkashino.ru", variant: "primary", href: next, full: true })}
      ${button({ label: "Вернуться в cherkashino.ru", variant: "transparent", href: back, full: true })}
    </div>
  </div>`

export const components = {
  shell,
  plain,
  summaryPage,
  sourcePage,
  periodBar,
  overviewPage,
  loginRu,
  loginCom,
  linkFirst,
  switching,
  ticketUsed,
}
