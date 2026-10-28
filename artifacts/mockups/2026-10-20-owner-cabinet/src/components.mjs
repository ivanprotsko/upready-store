// The prototype's components: plain functions, props → HTML, no state code (rule 60 p.1–2).
// They draw the tenant panel as it is (apps/tenant-panel: main-layout.tsx, owner-nav, routes/home)
// in its own colours (src/theme/hub-theme.css) plus what this task adds: «Сводка», the shop list
// in the «…» menu, the sign-in once.
import { changePct, count, escape, money, plural, shortDate } from "./format.mjs"

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

/**
 * The shop menu (Ivan 21.10, mark 33: «убрать заголовок, оставить домен, убрать отступ слева»): a shop is its domain,
 * flush left; the current one carries a check on the right. Every shop opens at once: one sign-in for all of them.
 */
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
      <a class="dropdown-item shop-item${shop.current ? " is-current" : ""}" href="${escape(shop.href)}" role="menuitemradio" aria-checked="${shop.current ? "true" : "false"}" data-proto="shop-${escape(shop.instance)}">
        <span class="truncate">${escape(shop.domain)}</span>
        ${shop.current ? icon("check", "dropdown-tick") : ""}
      </a>`,
      )
      .join("")}
    <div class="dropdown-sep"></div>
    <a class="dropdown-item" href="${escape(panel.logoutHref)}" role="menuitem">
      ${icon("logout", "muted")}
      <span>Выйти из всех магазинов</span>
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
            { label: "Клиенты", href: links.customers, active: active === "customers", proto: "nav-customers" },
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
      <div class="head${bar ? " has-bar" : ""}" data-hide-on-scroll>
        ${mobileBar({ panel, links, drawerOpen, title })}
        <div class="topbar" data-proto="topbar">
          <span class="crumb">${escape(title)}</span>
        </div>
        ${bar ?? ""}
      </div>
      <main class="page">${body}</main>
    </div>
  </div>`

// ---- the period bar pinned under the top bar (Ivan 20.10, mark 4: «контролы нужно загрепить в хедере по аналогии
// как в яндекс метрике»). It works (Ivan 21.10, mark 15: «нужно сделать чтобы работал переключатель и я увидел как будет
// выглядеть график на разном количестве дней»): one radio per period, CSS shows the chosen period's figures, chart and
// rows (`.per-<key>`), the page carries no script. The range button opens the list of periods and the calendar's range.

const PERIODS = [
  { key: "today", label: "Сегодня", unit: "hour" },
  { key: "yesterday", label: "Вчера", unit: "hour" },
  { key: "7d", label: "Неделя", unit: "day" },
  { key: "30d", label: "Месяц", unit: "day" },
  { key: "90d", label: "Квартал", unit: "week" },
  { key: "365d", label: "Год", unit: "month" },
  { key: "range", label: "Свой период", unit: "day" },
]

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
const dayParts = (iso) => ({ d: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)) - 1, y: iso.slice(0, 4) })

/** «20 окт», «1 — 14 окт», «21 сен — 20 окт», «21 окт 2025 — 20 окт 2026». */
const rangeText = ({ from, to }) => {
  const a = dayParts(from)
  const b = dayParts(to)
  if (from === to) return `${b.d} ${MONTHS[b.m]}`
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m]} ${a.y} — ${b.d} ${MONTHS[b.m]} ${b.y}`
  if (a.m === b.m) return `${a.d} — ${b.d} ${MONTHS[b.m]}`
  return `${a.d} ${MONTHS[a.m]} — ${b.d} ${MONTHS[b.m]}`
}

/**
 * One copy per period; CSS keeps the chosen one (panel.css, «the period switch»). The state's own period comes first,
 * so a selector of the viewer's marks and comments finds the copy on screen.
 */
const perPeriod = (periods, draw, tag = "div", first = "7d") =>
  PERIODS.filter(({ key }) => periods[key])
    .sort((a, b) => (b.key === first) - (a.key === first))
    .map((p) => `<${tag} class="per per-${p.key}">${draw(p)}</${tag}>`)
    .join("")

export const periodBar = ({ period = "7d", periods }) => `
    <div class="period-bar" data-proto="period-bar">
      ${PERIODS.map(({ key }) => `<input class="sr" type="radio" name="period" id="period-${key}"${key === period ? " checked" : ""}>`).join("")}
      <div class="seg seg-periods" role="radiogroup" aria-label="Период">
        ${PERIODS.filter(({ key }) => key !== "range")
          .map(({ key, label }) => `<label class="seg-item" for="period-${key}">${label}</label>`)
          .join("")}
      </div>
      <button type="button" class="btn btn-secondary btn-small bar-pill bar-range" popovertarget="period-pick" data-proto="period-range">
        ${perPeriod(periods, ({ key, label }) => `<span class="bar-range-label">${label}</span>${rangeText(periods[key])}`, "span", period)}${icon("chevronDown", "muted")}
      </button>
      <div class="period-pick" id="period-pick" popover>
        ${PERIODS.map(
          ({ key, label }) => `
        <label class="dropdown-item" for="period-${key}">
          <span class="dropdown-check pick-${key}">${icon("check")}</span>
          <span>${label}</span>
          <span class="dropdown-hint">${rangeText(periods[key])}</span>
        </label>`,
        ).join("")}
      </div>
    </div>`

// ---- one currency: rubles (Ivan 21.10, marks 17, 19, 20: «валюту нужно показывать одну, пусть пересчитывается по какому
// то курсу, но показывать в рублях», «пунктирное подчеркивание и тултип с реальной валютой», «в поповере показывать уже
// список валют»). An amount in another currency is multiplied by the rate its source sent (shop-summary/v1 `fx`).

const CURRENCY_IN = { rub: "В рублях", eur: "В евро", usd: "В долларах" }
const CURRENCY_SIGN = { rub: "₽", eur: "€", usd: "$" }
const sign = (code) => CURRENCY_SIGN[code] ?? code.toUpperCase()
const rateNumber = (rate) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate)
const rateDay = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
const rub = (value) => money(value, "rub")

/** Rubles of an amount, at the rate of the source that sent it. */
const toRub = (fx, code, amount) => (code === "rub" ? amount : Math.round(amount * fx.rates.find((r) => r.currency_code === code).rate))

/** «По курсу ЦБ РФ на 20.10.2026: 1 € = 94,37 ₽, 1 $ = 81,05 ₽.» */
const rateLine = (rates) =>
  rates.length
    ? `По курсу ЦБ РФ на ${rateDay(rates[0].date)}: ${rates.map((r) => `1 ${sign(r.currency_code)} = ${rateNumber(r.rate)} ₽`).join(", ")}.`
    : ""

/**
 * A ruble figure; when some of it was sold in another currency, a dotted underline and a tooltip with the real amounts
 * and the rate. `parts` are [{ code, amount }] in their own currencies. Hover shows it, a tap focuses it on the phone.
 */
const rubFigure = ({ parts, fx, value, cls = "" }) => {
  const sold = parts.filter((p) => p.amount && p.code !== "rub")
  const text = rub(value ?? parts.reduce((a, p) => a + toRub(fx, p.code, p.amount), 0))
  if (!sold.length) return `<span class="${cls}">${text}</span>`
  const rates = fx.rates.filter((r) => sold.some((p) => p.code === r.currency_code))
  const real = parts.filter((p) => p.amount).map((p) => money(p.amount, p.code))
  return `<span class="conv ${cls}" tabindex="0">${text}<span class="tip" role="tooltip"><span>Продажи: ${real.join(" и ")}.</span><span class="txt-subtle">${rateLine(rates)}</span></span></span>`
}

// ---- «Сводка»: the sales sources of the owner ---------------------------------------------------------------------

const SOURCE_LABEL = { wildberries: "Wildberries", ozon: "Ozon", yandex_market: "Яндекс Маркет", megamarket: "Мегамаркет" }
const instanceWord = { ru: "cherkashino.ru", intl: "cherkashino.com" }

/** A row's name: the shop's domain for a storefront (mark 5: «в магазине просто писать домен»), the marketplace's name otherwise. */
const sourceLabel = (entry, panelShops) =>
  SOURCE_LABEL[entry.source] ??
  entry.summary?.shop.primary_domain ??
  panelShops.find((shop) => shop.tenant_id === entry.tenant_id)?.domain ??
  ""

const sourceKey = (entry) => `${entry.instance}-${entry.source}`

/** A source's period in rubles: revenue, the period before, orders, the average order, and the real amounts behind them. */
const inRub = (summary, key) => {
  const buckets = summary.periods[key].currencies
  const revenue = buckets.reduce((a, b) => a + toRub(summary.fx, b.currency_code, b.current.revenue), 0)
  const previous = buckets.reduce((a, b) => a + toRub(summary.fx, b.currency_code, b.previous.revenue), 0)
  const orders = buckets.reduce((a, b) => a + b.current.order_count, 0)
  const previousOrders = buckets.reduce((a, b) => a + b.previous.order_count, 0)
  return {
    revenue,
    previous,
    orders,
    previousOrders,
    aov: orders ? Math.round(revenue / orders) : 0,
    previousAov: previousOrders ? Math.round(previous / previousOrders) : 0,
    parts: buckets.map((b) => ({ code: b.currency_code, amount: b.current.revenue })),
    aovParts: buckets.map((b) => ({ code: b.currency_code, amount: b.current.aov })),
    canceled: buckets.reduce((a, b) => a + b.canceled.order_count, 0),
  }
}

const totalsCard = ({ label, value, badge = "", proto, pop = "" }) => `
  <div class="stat${pop ? " has-pop" : ""}" ${pop ? 'tabindex="0"' : ""} ${proto ? `data-proto="${proto}"` : ""}>
    <span class="txt-subtle">${escape(label)}</span>
    <div class="stat-row"><span class="stat-value${pop ? " dotted" : ""}">${value}</span>${badge}</div>
    ${pop}
  </div>`

/** The popover of a total: the amounts by currency behind the ruble figure (marks 19, 20). */
const currencyPop = ({ title, rows, rates }) => `
    <div class="pop" role="tooltip">
      <span class="txt-plus">${escape(title)}</span>
      ${rows
        .map(
          (row) => `<div class="pop-row"><span class="txt-subtle">${row.label}</span><span class="nowrap">${row.value}${row.rub ? ` <span class="txt-subtle">= ${row.rub}</span>` : ""}</span></div>`,
        )
        .join("")}
      ${rates.length ? `<span class="txt-subtle pop-foot">${rateLine(rates)}</span>` : ""}
    </div>`

const sourcesWord = (n) => `${n} ${plural(n, "источник", "источника", "источников")}`

// A chart scale with round steps: 1, 2, 2.5 or 5 times a power of ten, four or five lines; whole steps for counts.
const niceScale = (max, whole) => {
  const raw = Math.max(Math.max(max, 1) / 4, whole ? 1 : 0)
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)
  const top = Math.ceil(Math.max(max, 1) / step) * step
  return { step, top }
}
const compact = (value) => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value)

const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The bars of a period: hours for one day, days up to a month, weeks for a quarter, months for a year (mark 15). Each
 * bar names the rows of a source it takes: `pick(summary)` → the rows of `daily`, `hourly` or `monthly`.
 */
const bucketsOf = ({ from, to }, unit) => {
  // A day is always 24 hours, 00–23 (Ivan 21.10, mark 23: «единый формат 24 часа»); today's hours still to come stay
  // on the axis, empty.
  if (unit === "hour") {
    return Array.from({ length: 24 }, (_, h) => {
      const hour = `${from}T${String(h).padStart(2, "0")}`
      return {
        label: String(h).padStart(2, "0"),
        tip: `${shortDate(from)}, ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`,
        future: to === TODAY && h > NOW_HOUR,
        pick: (s) => s.hourly.filter((r) => r.hour === hour),
      }
    })
  }
  if (unit === "month") {
    const out = []
    for (let at = from.slice(0, 7); at <= to.slice(0, 7); ) {
      const month = at
      const { m, y } = dayParts(`${month}-01`)
      out.push({ label: m === 0 || !out.length ? `${MONTHS[m]} ${y}` : MONTHS[m], tip: `${MONTHS[m]} ${y}`, pick: (s) => s.monthly.filter((r) => r.month === month) })
      at = m === 11 ? `${Number(y) + 1}-01` : `${y}-${String(m + 2).padStart(2, "0")}`
    }
    return out
  }
  const out = []
  const step = unit === "week" ? 7 : 1
  for (let day = from; day <= to; day = addDays(day, step)) {
    const start = day
    const end = unit === "week" ? [addDays(day, 6), to].sort()[0] : day
    out.push({
      label: shortDate(start),
      tip: start === end ? shortDate(start) : `${shortDate(start)} — ${shortDate(end)}`,
      pick: (s) => s.daily.filter((r) => r.date >= start && r.date <= end),
    })
  }
  return out
}

// The example's moment (docs/owner-cabinet/contract/make-examples.mjs): 20.10.2026, 09:00 in Moscow.
const TODAY = "2026-10-20"
const NOW_HOUR = 8

/**
 * A stacked bar chart. Every bar names its bucket, its total and each source's part (`data-*`); client.js turns them
 * into the tooltip on hover and pins it on a click (Ivan 21.10, mark 24: «интерактив при наведении и клике, с подписью
 * проекта и значений выбранного блока в столбце»). Hours are labelled every 3 hours from midnight (mark 23); other
 * units from the last bar back, so today always has its label.
 */
const plot = ({ series, buckets, value, format, tipFormat = format, proto, whole = false, hourly = false }) => {
  const totals = buckets.map((bucket) => series.reduce((a, s) => a + value(s, bucket), 0))
  const { step, top } = niceScale(Math.max(...totals), whole)
  const ticks = []
  for (let v = top; v >= 0; v -= step) ticks.push(v)
  const n = buckets.length
  const every = hourly ? 3 : n <= 14 ? 1 : n <= 24 ? 3 : 5
  const cols = buckets
    .map((bucket, d) => {
      const parts = series
        .map((s) => {
          const v = value(s, bucket)
          return v
            ? `<span class="bar-part shop-${s.color}" style="height:${((v / totals[d]) * 100).toFixed(2)}%" data-src="${escape(s.label)}" data-color="${s.color}" data-value="${escape(tipFormat(v))}"></span>`
            : ""
        })
        .join("")
      const at = (hourly ? d : n - 1 - d) / every
      const label = Number.isInteger(at) ? `<span class="col-date${!hourly && n > 6 && at % 2 ? " minor" : ""}">${bucket.label}</span>` : '<span class="col-date"></span>'
      const rows = series.map((s) => `${s.color}|${s.label}|${tipFormat(value(s, bucket))}`).join(";")
      return `<div class="col${bucket.future ? " is-future" : ""}" data-tip="${escape(bucket.tip)}" data-total="${escape(bucket.future ? "ещё не наступил" : tipFormat(totals[d]))}" data-rows="${escape(bucket.future ? "" : rows)}">
        <div class="col-bar">${n <= 14 && totals[d] ? `<span class="col-total">${format(totals[d])}</span>` : ""}<div class="col-stack" style="height:${((totals[d] / top) * 100).toFixed(2)}%">${parts}</div></div>
        ${label}
      </div>`
    })
    .join("")
  return `
    <div class="plot${n > 20 ? " dense" : ""}" data-proto="${proto}" data-chart>
      <div class="plot-grid">${ticks.map((v) => `<div class="grid-line"><span class="grid-label">${format(v)}</span></div>`).join("")}</div>
      <div class="plot-cols">${cols}</div>
    </div>`
}

const UNIT_TITLE = { hour: "Продажи по часам", day: "Продажи по дням", week: "Продажи по неделям", month: "Продажи по месяцам" }
const UNIT_AXIS = { hour: "в час", day: "в день", week: "в неделю", month: "в месяц" }

/**
 * Orders or sales of a period, one colour per source (marks 3 and 14), bars by hour, day, week or month (mark 15).
 * «Заказы | Сумма» are the two radios of the page (`#mode-orders`, `#mode-sum`); the sum is in rubles (mark 17).
 */
const salesChart = ({ series, period, unit }) => {
  const buckets = bucketsOf(period, unit)
  const ordersOf = (s, bucket) => bucket.pick(s.summary).reduce((a, row) => a + row.order_count, 0)
  const rubOf = (s, bucket) => bucket.pick(s.summary).reduce((a, row) => a + toRub(s.summary.fx, row.currency_code, row.revenue), 0)
  const legend = (valueOf, format) =>
    `<div class="legend">${series
      .map((s) => `<span><span class="dot shop-${s.color}"></span>${escape(s.label)}<span class="legend-value">${format(buckets.reduce((a, bucket) => a + valueOf(s, bucket), 0))}</span></span>`)
      .join("")}</div>`
  return `
    <section class="container chart-block" data-proto="chart">
      <div class="chart-head">
        <h2 class="h2">${UNIT_TITLE[unit]}</h2>
        <div class="seg" data-proto="chart-mode"><label class="seg-item mode-orders" for="mode-orders">Заказы</label><label class="seg-item mode-sum" for="mode-sum">Сумма</label></div>
      </div>
      <div class="plot-wrap plot-orders">
        <span class="axis-caption">заказов ${UNIT_AXIS[unit]}</span>
        ${plot({ series, buckets, value: ordersOf, format: count, proto: "plot-orders", whole: true, hourly: unit === "hour" })}
        ${legend(ordersOf, count)}
      </div>
      <div class="plot-wrap plot-sum">
        <span class="axis-caption">сумма заказов ${UNIT_AXIS[unit]}, ₽</span>
        ${plot({ series, buckets, value: rubOf, format: compact, tipFormat: rub, proto: "plot-sum", hourly: unit === "hour" })}
        ${legend(rubOf, rub)}
      </div>
    </section>`
}

/** The page's «Заказы | Сумма»: two radios every copy of the chart reads (panel.css). */
const chartModes = (mode) =>
  `<input class="sr" type="radio" name="chart-mode" id="mode-orders"${mode === "orders" ? " checked" : ""}><input class="sr" type="radio" name="chart-mode" id="mode-sum"${mode === "sum" ? " checked" : ""}>`

const chartSeries = (sources, panelShops) =>
  sources
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.state === "ok")
    .map(({ entry, index }) => ({ label: sourceLabel(entry, panelShops), color: index, summary: entry.summary }))

const rowState = ({ entry, label, index, links }) => {
  const text =
    entry.state === "no_answer"
      ? `${instanceWord[entry.instance]} не ответил при загрузке страницы. Цифр нет, в итоги не вошёл.`
      : "Магазин ещё не добавлен в ваш вход. Добавьте его один раз — код придёт на почту магазина."
  const action =
    entry.state === "no_answer"
      ? button({ label: "Повторить", href: links.retry })
      : button({ label: "Добавить", href: links.connect })
  return `
      <div class="shop-row is-quiet" role="row" data-proto="source-row-${index}" data-state="${entry.state}">
        <div class="shop-cell-name"><span class="dot shop-${index}"></span><span class="txt-plus truncate">${escape(label)}</span></div>
        <div class="row-state">${icon("info", "muted")}<span>${text}</span></div>
        <div class="row-action">${action}</div>
      </div>`
}

/** A source's row. The whole row opens its statistics; a ruble figure with a tooltip sits above that link, so a tap on it opens the tooltip. */
const sourceRow = ({ entry, period, panelShops, index, links }) => {
  const label = sourceLabel(entry, panelShops)
  if (entry.state !== "ok") return rowState({ entry, label, index, links })
  const summary = entry.summary
  const p = inRub(summary, period)
  return `
    <div class="shop-row is-link" role="row" data-proto="source-row-${index}">
      <a class="row-link" href="${escape(links.detail[sourceKey(entry)] ?? "#")}" aria-label="Статистика: ${escape(label)}"></a>
      <div class="shop-cell-name"><span class="dot shop-${index}"></span><span class="txt-plus truncate">${escape(label)}</span></div>
      <div class="cell" data-label="Выручка">${rubFigure({ parts: p.parts, fx: summary.fx, value: p.revenue, cls: "nowrap" })}</div>
      <div class="cell" data-label="Динамика">${changeBadge(changePct(p.revenue, p.previous)) || "—"}</div>
      <div class="cell" data-label="Заказы">${count(p.orders)}</div>
      <div class="cell" data-label="Ср. чек">${rubFigure({ parts: p.aovParts, fx: summary.fx, value: p.aov, cls: "nowrap" })}</div>
      <div class="cell" data-label="В сборке">${summary.orders.to_pack ? count(summary.orders.to_pack) : "—"}</div>
      <div class="cell" data-label="Рейтинг"><span class="nowrap">${icon("star", "star")} ${summary.reviews.average_rating ?? "—"}</span></div>
      <div class="cell go">${icon("chevronRight", "muted")}</div>
    </div>`
}

// ---- «Топ товаров» as a donut with its legend under it (Ivan 21.10, mark 28: «pie chart + подписи, снизу с названиями и
// цветом товара, а также при клике на сегменты графика тоже показывались значения»). A segment's share is of the whole
// revenue of the view; what the top does not cover is the grey «Остальные товары». A click (a tap) on a segment or on its
// legend row puts its units and rubles into the middle (client.js).

const arc = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)].map((v) => v.toFixed(2)).join(" ")
  return { from: p(a0), to: p(a1), large: a1 - a0 > Math.PI ? 1 : 0 }
}

const segmentPath = (a0, a1) => {
  // a full circle cannot be one arc: two halves
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `${segmentPath(a0, a0 + Math.PI)} ${segmentPath(a0 + Math.PI, a1)}`
  const o = arc(100, 100, 92, a0, a1)
  const i = arc(100, 100, 58, a1, a0)
  return `M ${o.from} A 92 92 0 ${o.large} 1 ${o.to} L ${i.from} A 58 58 0 ${o.large} 0 ${i.to} Z`
}

/** `items`: [{ title, quantity, rub }] by rank; `total`: the view's revenue in rubles. */
const donut = ({ items, total, proto }) => {
  const rest = Math.max(0, total - items.reduce((a, item) => a + item.rub, 0))
  const all = [
    ...items.map((item, i) => ({ ...item, color: `prod-${i}` })),
    ...(rest > 0 ? [{ title: "Остальные товары", quantity: null, rub: rest, color: "prod-rest" }] : []),
  ]
  let at = 0
  const segments = all.map((item, i) => {
    const share = total ? item.rub / total : 0
    const a0 = at * Math.PI * 2
    at += share
    const a1 = at * Math.PI * 2
    const mid = (a0 + a1) / 2
    const pct = Math.round(share * 100)
    const data = `data-i="${i}" data-name="${escape(item.title)}" data-share="${pct}%" data-qty="${item.quantity === null ? "" : `${count(item.quantity)} шт`}" data-sum="${escape(rub(item.rub))}"`
    return {
      path: `<path class="seg-${item.color}" d="${segmentPath(a0, a1)}" ${data} tabindex="0" role="button" aria-label="${escape(`${item.title}: ${pct}%`)}"></path>`,
      label: share >= 0.07 ? `<text x="${(100 + 75 * Math.sin(mid)).toFixed(1)}" y="${(100 - 75 * Math.cos(mid)).toFixed(1)}">${pct}%</text>` : "",
      legend: `<li ${data} tabindex="0"><span class="dot ${item.color}"></span><span class="truncate">${escape(item.title)}</span><span class="txt-subtle nowrap">${item.quantity === null ? "" : `${count(item.quantity)} шт`}</span><span class="nowrap">${rub(item.rub)}</span><span class="txt-subtle pie-pct">${pct}%</span></li>`,
    }
  })
  if (!total) return `<p class="txt-subtle">За этот период продаж нет.</p>`
  return `
    <div class="pie" data-pie data-proto="${proto}">
      <div class="pie-chart">
        <svg viewBox="0 0 200 200" role="group" aria-label="Доля товаров в выручке">${segments.map((x) => x.path).join("")}<g class="pie-labels" aria-hidden="true">${segments.map((x) => x.label).join("")}</g></svg>
        <div class="pie-center" aria-live="polite">
          <span class="pie-center-value" data-default="${escape(rub(total))}">${rub(total)}</span>
          <span class="txt-subtle pie-center-caption" data-default="выручка за период">выручка за период</span>
        </div>
      </div>
      <ol class="pie-legend">${segments.map((x) => x.legend).join("")}</ol>
    </div>`
}

/** A source's top in rubles. */
const topOf = (summary, key) =>
  summary.periods[key].top_products.map((p) => ({ title: p.title, quantity: p.quantity, rub: toRub(summary.fx, p.currency_code, p.revenue) }))

/**
 * Several sources (mark 29): one donut over all the sources by default — the same product sold in several places adds up —
 * and a source switch that opens one source's donut. The switch is the period list's control: a button and a list, so it
 * holds any number of sources. The radios are the page's (`#top-src-*`), the CSS shows the chosen view.
 */
const topProducts = ({ sources, period, panelShops }) => {
  const ok = sources.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.state === "ok")
  if (ok.length === 1) {
    const { entry } = ok[0]
    return `
    <section class="container" data-proto="top-products">
      <div class="section-head-row"><h2 class="h2">Топ товаров</h2></div>
      ${donut({ items: topOf(entry.summary, period), total: inRub(entry.summary, period).revenue, proto: "pie" })}
    </section>`
  }
  const merged = new Map()
  for (const { entry } of ok) {
    for (const item of topOf(entry.summary, period)) {
      const at = merged.get(item.title) ?? { title: item.title, quantity: 0, rub: 0 }
      at.quantity += item.quantity
      at.rub += item.rub
      merged.set(item.title, at)
    }
  }
  const allItems = [...merged.values()].sort((a, b) => b.rub - a.rub).slice(0, 6)
  const allTotal = ok.reduce((a, { entry }) => a + inRub(entry.summary, period).revenue, 0)
  const pickId = `top-pick-${period}`
  return `
    <section class="container" data-proto="top-products">
      <div class="section-head-row">
        <h2 class="h2">Топ товаров</h2>
        <button type="button" class="btn btn-secondary btn-small bar-pill top-switch" popovertarget="${pickId}" style="anchor-name: --${pickId}" data-proto="top-source">
          <span class="tsl tsl-all">Все источники</span>${ok.map(({ entry, index }) => `<span class="tsl tsl-${index}"><span class="dot shop-${index}"></span>${escape(sourceLabel(entry, panelShops))}</span>`).join("")}${icon("chevronDown", "muted")}
        </button>
        <div class="period-pick top-pick" id="${pickId}" popover style="position-anchor: --${pickId}">
          <label class="dropdown-item" for="top-src-all"><span class="truncate">Все источники</span><span class="dropdown-check tpk-all">${icon("check")}</span></label>
          ${ok.map(({ entry, index }) => `<label class="dropdown-item" for="top-src-${index}"><span class="dot shop-${index}"></span><span class="truncate">${escape(sourceLabel(entry, panelShops))}</span><span class="dropdown-check tpk-${index}">${icon("check")}</span></label>`).join("")}
        </div>
      </div>
      <div class="topv topv-all">${donut({ items: allItems, total: allTotal, proto: "pie" })}</div>
      ${ok.map(({ entry, index }) => `<div class="topv topv-${index}">${donut({ items: topOf(entry.summary, period), total: inRub(entry.summary, period).revenue, proto: `pie-${index}` })}</div>`).join("")}
    </section>`
}

/** The page's source switch of «Топ товаров»: one radio per view, read by every period's copy (panel.css). */
const topModes = (sources) => {
  const ok = sources.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.state === "ok")
  if (ok.length < 2) return ""
  return `<input class="sr" type="radio" name="top-src" id="top-src-all" checked>${ok.map(({ index }) => `<input class="sr" type="radio" name="top-src" id="top-src-${index}">`).join("")}`
}

/** The totals of a period across the sources that answered: one ruble figure each, the currencies in a popover. */
const summaryStats = ({ data, key }) => {
  const total = data.totals[key]
  const rates = total.by_currency
    .filter((row) => row.rate)
    .map((row) => ({ currency_code: row.currency_code, rate: row.rate, date: row.rate_date }))
  const mixed = total.by_currency.some((row) => row.currency_code !== data.display_currency && row.revenue > 0)
  const previousOrders = data.shops
    .filter((entry) => entry.state === "ok")
    .reduce((a, entry) => a + inRub(entry.summary, key).previousOrders, 0)
  const revenuePop = mixed
    ? currencyPop({
        title: "Выручка по валютам",
        rows: total.by_currency.map((row) => ({
          label: `${CURRENCY_IN[row.currency_code] ?? row.currency_code} · ${sourcesWord(row.shops)}`,
          value: money(row.revenue, row.currency_code),
          rub: row.rate ? rub(row.revenue_converted) : "",
        })),
        rates,
      })
    : ""
  const aovPop = mixed
    ? currencyPop({
        title: "Средний чек по валютам",
        rows: total.by_currency.map((row) => ({
          label: CURRENCY_IN[row.currency_code] ?? row.currency_code,
          value: money(row.order_count ? Math.round((row.revenue / row.order_count) * 100) / 100 : 0, row.currency_code),
          rub: row.rate && row.order_count ? rub(Math.round(row.revenue_converted / row.order_count)) : "",
        })),
        rates,
      })
    : ""
  return `
      <div class="stats stats-page" data-proto="summary">
        ${totalsCard({ label: "Выручка", proto: "total-revenue", value: rub(total.revenue), badge: changeBadge(changePct(total.revenue, total.previous_revenue)), pop: revenuePop })}
        ${totalsCard({ label: "Заказы", proto: "total-orders", value: count(total.order_count), badge: changeBadge(changePct(total.order_count, previousOrders)) })}
        ${totalsCard({ label: "Ср. чек", proto: "total-aov", value: rub(total.aov), pop: aovPop })}
        ${totalsCard({ label: "В сборке", value: count(data.attention.to_pack) })}
      </div>`
}

/**
 * «Сводка» without a card around its figures and without the heading (Ivan 21.10, mark 22: «Убрать общий контейнер с
 * заголовком "сводка" и сам заголовок»; mark 21: the caption under the figures is gone).
 */
export const summaryPage = ({ data, panel, period = "7d", loading = false, chartMode = "orders", links }) => {
  const sources = data.shops
  const periods = sources.find((entry) => entry.state === "ok").summary.periods

  if (loading) {
    return `
      <div class="stats stats-page" data-proto="summary">${[1, 2, 3, 4].map(() => '<div class="stat"><span class="skeleton w-60"></span><span class="skeleton h-24 w-120"></span></div>').join("")}</div>
      <section class="container flush" data-proto="sources">
        <div class="section-head"><h2 class="h2">Источники продаж</h2></div>
        <div class="skeleton-table">${sources.map(() => '<span class="skeleton h-40 w-full"></span>').join("")}</div>
      </section>`
  }

  return `
    ${chartModes(chartMode)}
    ${topModes(sources)}
    ${perPeriod(
      periods,
      ({ key, unit }) => `
    ${summaryStats({ data, key })}

    <section class="container flush" data-proto="sources">
      <div class="section-head"><h2 class="h2">Источники продаж</h2></div>
      <div class="shop-table" role="table">
        <div class="shop-row shop-head" role="row">
          <div>Источник</div><div>Выручка</div><div>Динамика</div><div>Заказы</div><div>Ср. чек</div><div>В сборке</div><div>Рейтинг</div><div></div>
        </div>
        ${sources.map((entry, index) => sourceRow({ entry, period: key, panelShops: panel.shops, index, links })).join("")}
      </div>
    </section>

    <div class="duo">
      ${salesChart({ series: chartSeries(sources, panel.shops), period: periods[key], unit })}
      ${topProducts({ sources, period: key, panelShops: panel.shops })}
    </div>`,
      "div",
      period,
    )}`
}

// ---- a source's own statistics, opened from its row (mark 2) ----------------------------------------------------

export const sourcePage = ({ data, index, panel, period = "7d", chartMode = "orders", links }) => {
  const entry = data.shops[index]
  const summary = entry.summary
  const label = sourceLabel(entry, panel.shops)
  const kind = entry.source === "storefront" ? `Сайт магазина «${escape(summary.shop.name)}»` : `Маркетплейс, магазин ${escape(summary.shop.primary_domain)}`
  const reviews = summary.reviews
  const ratingMax = Math.max(1, ...Object.values(reviews.by_rating))
  const stats = (key) => {
    const p = inRub(summary, key)
    const mixed = p.parts.some((part) => part.code !== "rub" && part.amount > 0)
    const pop = (title, parts) =>
      mixed
        ? currencyPop({
            title,
            rows: parts.map((part) => ({ label: CURRENCY_IN[part.code] ?? part.code, value: money(part.amount, part.code), rub: part.code === "rub" ? "" : rub(toRub(summary.fx, part.code, part.amount)) })),
            rates: summary.fx.rates.filter((r) => parts.some((part) => part.amount && part.code === r.currency_code)),
          })
        : ""
    return `
      <div class="stats five">
        ${totalsCard({ label: "Выручка", value: rub(p.revenue), badge: changeBadge(changePct(p.revenue, p.previous)), pop: pop("Выручка по валютам", p.parts) })}
        ${totalsCard({ label: "Заказы", value: count(p.orders), badge: changeBadge(changePct(p.orders, p.previousOrders)) })}
        ${totalsCard({ label: "Ср. чек", value: rub(p.aov), badge: changeBadge(changePct(p.aov, p.previousAov)), pop: pop("Средний чек по валютам", p.aovParts) })}
        ${totalsCard({ label: "Отменены", value: count(p.canceled) })}
        ${totalsCard({ label: "В сборке", value: count(summary.orders.to_pack) })}
      </div>`
  }
  return `
    ${chartModes(chartMode)}
    <section class="container" data-proto="source-head">
      <a class="back" href="${escape(links.summary)}">${icon("chevronLeft", "muted")}<span>Сводка</span></a>
      <div class="page-head">
        <div><h1 class="h1">${escape(label)}</h1><p class="txt-subtle">${kind}</p></div>
      </div>
      ${perPeriod(summary.periods, ({ key }) => stats(key), "div", period)}
    </section>

    ${perPeriod(summary.periods, ({ key, unit }) => salesChart({ series: [{ label, color: index, summary }], period: summary.periods[key], unit }), "div", period)}

    <div class="split">
      <section class="container" data-proto="source-products">
        <div class="section-head-row"><h2 class="h2">Топ товаров</h2></div>
        ${perPeriod(summary.periods, ({ key }) => donut({ items: topOf(summary, key), total: inRub(summary, key).revenue, proto: "pie" }), "div", period)}
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
        ${totalsCard({ label: "Опубликовано", value: count(summary.catalog.published) })}
        ${totalsCard({ label: "Черновики", value: count(summary.catalog.draft) })}
      </div>
    </section>`
}

// ---- a shop's «Обзор», as routes/home/home.tsx draws it ----------------------------------------------

export const overviewPage = ({ summary, plan, period = "7d", days, color = 0 }) => {
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
            .map((d) => `<span class="mini-bar"><span class="shop-${color}" style="height:${(((daily.get(d) ?? 0) / max) * 100).toFixed(1)}%"></span><span class="txt-subtle">${shortDate(d)}</span></span>`)
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

// ---- the plain pages and the sign-in (Ivan 21.10, mark 33: «вошел в один магазин - вошел во все. А если это не
// безопасно, то можно к конфиденциальным данным при переходе на страницу, которая их содержит запрашивать авторизацию
// отдельно»). One sign-in opens every shop of the owner; a page with buyers' personal data asks to confirm it again.

export const plain = ({ body }) => `<div class="plain">${body}</div>`

const brandHead = ({ letter, title, hint }) => `
  <div class="auth-head">
    ${avatar(letter, "lg")}
    <h1 class="h1">${escape(title)}</h1>
    ${hint ? `<p class="txt-subtle">${escape(hint)}</p>` : ""}
  </div>`

const field = ({ label, value = "", placeholder = "" }) => `
  <label class="field"><span class="field-label">${escape(label)}</span><span class="input${value ? "" : " is-empty"}">${escape(value || placeholder)}</span></label>`

export const loginRu = ({ next }) => `
  <div class="auth" data-proto="login-ru">
    ${brandHead({ letter: "Ч", title: "Вход в панель магазина", hint: "Один вход — во все ваши магазины" })}
    <div class="auth-form">
      ${field({ label: "Почта", value: "owner@cherkashino.ru" })}
      ${field({ label: "Пароль", value: "••••••••••" })}
      ${button({ label: "Продолжить", variant: "primary", href: next, full: true, attrs: 'data-proto="login-submit"' })}
      <div class="or"><span>или</span></div>
      ${button({ label: "Войти через Telegram", variant: "secondary", href: next, full: true, iconName: "telegram" })}
    </div>
    <p class="auth-once" data-proto="once">${icon("info", "muted")}<span>После входа cherkashino.ru и cherkashino.com открываются из меню магазинов сразу, без второго входа.</span></p>
    <p class="txt-subtle auth-foot">Забыли пароль? <a class="link" href="#">Сбросить</a></p>
  </div>`

/** A shop of the owner that the sign-in does not know yet (another e-mail): added once, by a code sent to the shop's e-mail. */
export const linkFirst = ({ next, back }) => `
  <div class="auth" data-proto="link-first">
    ${brandHead({ letter: "C", title: "Добавить cherkashino.com в ваш вход" })}
    <div class="auth-form">
      <p class="auth-text">Магазин cherkashino.com зарегистрирован на почту o•••@cherkashino.com. Мы отправили на неё код.</p>
      <p class="auth-text">Введите его один раз: дальше магазин откроется из меню магазинов без входа.</p>
      ${field({ label: "Код из письма", value: "•••  •••" })}
      ${button({ label: "Добавить магазин", variant: "primary", href: next, full: true, attrs: 'data-proto="link-submit"' })}
      ${button({ label: "Не сейчас", variant: "transparent", href: back, full: true })}
    </div>
  </div>`

/**
 * A page with buyers' personal data («Клиенты») when the last confirmation is older than 15 minutes: the list stays
 * closed until the owner confirms it is her (docs/owner-cabinet/architecture.md §3, «Pages that ask again»).
 */
export const confirmPage = ({ next, back, email }) => `
  <section class="container confirm-wrap" data-proto="confirm-page">
    <div class="section-head-row"><h2 class="h2">Клиенты</h2></div>
    <div class="locked-list" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map(() => '<span class="skeleton h-40 w-full"></span>').join("")}</div>
    <div class="confirm-card" data-proto="confirm">
      <span class="confirm-icon">${icon("lock")}</span>
      <h2 class="h2">Подтвердите, что это вы</h2>
      <p class="txt-subtle">Здесь имена, телефоны и адреса покупателей. Мы спрашиваем пароль ещё раз, если с последнего подтверждения прошло больше 15 минут.</p>
      ${field({ label: "Пароль от входа", value: "••••••••••" })}
      <span class="txt-subtle confirm-who">${escape(email)}</span>
      ${button({ label: "Подтвердить", variant: "primary", href: next, full: true, attrs: 'data-proto="confirm-submit"' })}
      ${button({ label: "Подтвердить в Telegram", variant: "secondary", href: next, full: true, iconName: "telegram" })}
      ${button({ label: "Вернуться к сводке", variant: "transparent", href: back, full: true })}
    </div>
  </section>`

export const components = {
  shell,
  plain,
  summaryPage,
  sourcePage,
  periodBar,
  overviewPage,
  loginRu,
  linkFirst,
  confirmPage,
}
