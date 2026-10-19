// The prototype's components: plain functions, props → HTML, no state code (rule 60 p.1–2).
// They draw the tenant panel as it is (apps/tenant-panel: main-layout.tsx, owner-nav, routes/home)
// in its own colours (src/theme/hub-theme.css) plus what this task adds: «Сводка», the shop list
// in the «…» menu, the sign-in once.
import { changePct, count, escape, money, moscowTime, plural, shortDate } from "./format.mjs"

const PERIOD_LABELS = { today: "Сегодня", "7d": "7 дней", "30d": "30 дней" }

// ---- icons: 15 px, the size of @medusajs/icons, stroke 1.5 --------------------------------------------

const ICONS = {
  ellipsis: '<circle cx="3.5" cy="7.5" r=".9"/><circle cx="7.5" cy="7.5" r=".9"/><circle cx="11.5" cy="7.5" r=".9"/>',
  chevronRight: '<path d="m6 3.5 4 4-4 4"/>',
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

export const shell = ({ panel, active, menuOpen = false, drawerOpen = false, links, title, body }) => `
  <div class="app${drawerOpen ? " drawer-open" : ""}">
    ${drawerOpen ? `<a class="scrim" href="${escape(links.closeMenu)}" aria-label="Закрыть меню"></a>` : ""}
    ${sidebar({ panel, active, menuOpen, links })}
    <div class="main">
      ${mobileBar({ panel, links, drawerOpen, title })}
      <div class="topbar">
        <span class="crumb">${escape(title)}</span>
        <span class="host">${icon("lock", "muted")}${escape(panel.host)}</span>
      </div>
      <main class="page">${body}</main>
    </div>
  </div>`

// ---- «Сводка» ------------------------------------------------------------------------------------------

const instanceWord = { ru: "Россия", intl: "Германия" }

const freshnessLine = (entry, summary) => {
  if (entry.freshness === "missing") {
    return `<span class="fresh missing">${icon("info")}Данных ещё нет</span>`
  }
  const at = moscowTime(summary.generated_at)
  return entry.freshness === "late"
    ? `<span class="fresh late" data-proto="late">${icon("clock")}на ${at}</span>`
    : `<span class="fresh ok">на ${at}</span>`
}

const totalsCard = ({ label, rows, proto }) => `
  <div class="stat" ${proto ? `data-proto="${proto}"` : ""}>
    <span class="txt-subtle">${escape(label)}</span>
    ${rows
      .map(
        (row) => `<div class="stat-row"><span class="stat-value">${row.value}</span>${row.badge ?? ""}${row.caption ? `<span class="txt-subtle stat-caption">${escape(row.caption)}</span>` : ""}</div>`,
      )
      .join("")}
  </div>`

const ordersByDay = ({ shops, days, panelShops }) => {
  // The 30 days of the period, with each shop's orders on the day, one colour a shop.
  const series = shops.map((entry) => {
    const byDate = new Map()
    for (const row of entry.summary?.daily ?? []) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.order_count)
    return byDate
  })
  const max = Math.max(1, ...days.map((day) => series.reduce((a, s) => a + (s.get(day) ?? 0), 0)))
  const bars = days
    .map((day) => {
      const parts = series
        .map((s, i) => {
          const n = s.get(day) ?? 0
          return n ? `<span class="bar-part shop-${i}" style="height:${((n / max) * 100).toFixed(1)}%"></span>` : ""
        })
        .join("")
      return `<span class="bar" title="${shortDate(day)}">${parts}</span>`
    })
    .join("")
  return `
    <div class="chart" data-proto="chart">
      <div class="chart-bars">${bars}</div>
      <div class="chart-axis"><span>${shortDate(days[0])}</span><span>${shortDate(days[days.length - 1])}</span></div>
      <div class="legend">${shops
        .map((entry, i) => `<span><span class="dot shop-${i}"></span>${escape(entry.summary?.shop.primary_domain ?? panelShops.find((shop) => shop.tenant_id === entry.tenant_id)?.domain ?? "")}${entry.summary ? "" : ", итогов ещё нет"}</span>`)
        .join("")}</div>
    </div>`
}

const shopRow = ({ entry, period, panelShops, index }) => {
  const summary = entry.summary
  const link = panelShops.find((shop) => shop.tenant_id === entry.tenant_id)
  if (!summary) {
    return `
      <div class="shop-row is-missing" role="row">
        <div class="shop-cell-name">${avatar("?", "sm")}<span>${escape(link?.domain ?? "")}</span></div>
        <div class="shop-missing">Магазин ещё не прислал итоги. Они появятся в течение пяти минут после подключения.</div>
      </div>`
  }
  const buckets = summary.periods[period].currencies
  const revenue = buckets
    .map((b) => `<span class="nowrap">${money(b.current.revenue, b.currency_code)} ${changeBadge(changePct(b.current.revenue, b.previous.revenue))}</span>`)
    .join("")
  const orders = buckets.reduce((a, b) => a + b.current.order_count, 0)
  const aov = buckets.map((b) => `<span class="nowrap">${money(b.current.aov, b.currency_code)}</span>`).join("")
  const reviews = summary.reviews
  return `
    <a class="shop-row" role="row" href="${escape(link?.href ?? "#")}" data-proto="shop-row-${index}">
      <div class="shop-cell-name">
        <span class="dot shop-${index}"></span>
        <span class="shop-name">
          <span class="txt-plus truncate">${escape(summary.shop.name)}</span>
          <span class="txt-subtle truncate">${escape(summary.shop.primary_domain)}${link?.current ? ", открыт сейчас" : ""}</span>
        </span>
      </div>
      <div class="cell" data-label="Выручка">${revenue}</div>
      <div class="cell num" data-label="Заказы">${count(orders)}</div>
      <div class="cell" data-label="Средний чек">${aov}</div>
      <div class="cell num" data-label="Ждут сборки">${summary.orders.to_pack ? `<span class="pill">${count(summary.orders.to_pack)}</span>` : "—"}</div>
      <div class="cell" data-label="Отзывы"><span class="nowrap">${icon("star", "star")} ${reviews.average_rating ?? "—"}</span>${reviews.pending ? `<span class="txt-subtle">${reviews.pending} на проверке</span>` : ""}</div>
      <div class="cell" data-label="Данные">${freshnessLine(entry, summary)}<span class="txt-subtle">${instanceWord[summary.instance]}</span></div>
      <div class="cell go">${link?.current ? "" : `<span class="go-label">Открыть</span>`}${icon("chevronRight", "muted")}</div>
    </a>`
}

const topProducts = ({ shops, period }) => `
  <div class="tops">
    ${shops
      .filter((entry) => entry.summary)
      .map(
        (entry, i) => `
      <div class="top">
        <div class="top-head"><span class="dot shop-${i}"></span><span class="txt-plus">${escape(entry.summary.shop.primary_domain)}</span></div>
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

export const summaryPage = ({ data, panel, period = "7d", periodLinks = {}, days, loading = false, lateNote }) => {
  const shops = data.shops
  const totals = data.totals[period]
  const header = `
    <div class="page-head">
      <div>
        <h1 class="h1">Сводка</h1>
        <p class="txt-subtle">${shops.length} ${plural(shops.length, "магазин", "магазина", "магазинов")}: ${shops
          .map((s) => escape(s.summary?.shop.primary_domain ?? panel.shops.find((p) => p.tenant_id === s.tenant_id)?.domain ?? ""))
          .join(" и ")}</p>
      </div>
      ${periodButtons(period, periodLinks)}
    </div>`

  if (loading) {
    return `
      <section class="container" data-proto="summary">
        ${header}
        <div class="stats">${[1, 2, 3, 4].map(() => '<div class="stat"><span class="skeleton w-60"></span><span class="skeleton h-24 w-120"></span></div>').join("")}</div>
        <div class="skeleton-table">${[1, 2].map(() => '<span class="skeleton h-40 w-full"></span>').join("")}</div>
      </section>`
  }

  const orders = totals.reduce((a, row) => a + row.order_count, 0)
  const late = shops.find((s) => s.freshness === "late")
  return `
    <section class="container" data-proto="summary">
      ${header}
      ${
        late
          ? `<div class="alert" data-proto="late-alert">${icon("clock")}<div><span class="txt-plus">Цифры ${escape(late.summary.shop.primary_domain)} — на ${moscowTime(late.summary.generated_at)}</span><span class="txt-subtle">${escape(lateNote ?? "")}</span></div></div>`
          : ""
      }
      <div class="stats">
        ${totalsCard({
          label: "Выручка",
          proto: "total-revenue",
          rows: totals.map((row) => ({
            value: money(row.revenue, row.currency_code),
            badge: changeBadge(changePct(row.revenue, row.previous_revenue)),
          })),
        })}
        ${totalsCard({ label: "Заказы", proto: "total-orders", rows: [{ value: count(orders) }] })}
        ${totalsCard({ label: "Средний чек", rows: totals.map((row) => ({ value: money(row.aov, row.currency_code) })) })}
        ${totalsCard({
          label: "Ждут сборки",
          rows: [{ value: count(data.attention.to_pack), caption: `отзывов на проверке: ${data.attention.reviews_pending}` }],
        })}
      </div>
      <p class="txt-subtle note">Выручка в разных валютах показана отдельно: рубли и евро не складываются.</p>
    </section>

    <section class="container flush" data-proto="shops">
      <div class="section-head"><h2 class="h2">Магазины</h2></div>
      <div class="shop-table" role="table">
        <div class="shop-row shop-head" role="row">
          <div>Магазин</div><div>Выручка</div><div class="num">Заказы</div><div>Средний чек</div><div class="num">Ждут сборки</div><div>Отзывы</div><div>Данные</div><div></div>
        </div>
        ${shops.map((entry, index) => shopRow({ entry, period, panelShops: panel.shops, index })).join("")}
      </div>
    </section>

    <section class="container">
      <div class="section-head-row"><h2 class="h2">Заказы по дням</h2><span class="txt-subtle">30 дней</span></div>
      ${ordersByDay({ shops, days, panelShops: panel.shops })}
    </section>

    <section class="container">
      <div class="section-head-row"><h2 class="h2">Топ товаров</h2><span class="txt-subtle">${PERIOD_LABELS[period]}</span></div>
      ${topProducts({ shops, period })}
    </section>

    <p class="privacy" data-proto="privacy">${icon("lock", "muted")}<span>В сводку магазины присылают только итоги: суммы, количество заказов, названия своих товаров и число отзывов. Имена, телефоны, адреса и почта покупателей остаются в своём магазине и в своей стране.</span></p>`
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
  overviewPage,
  loginRu,
  loginCom,
  linkFirst,
  switching,
  ticketUsed,
}
