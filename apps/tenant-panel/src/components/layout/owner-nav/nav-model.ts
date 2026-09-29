/**
 * The owner's menu as data: groups named after her jobs, one entry per screen,
 * and the tab rows of the sections that span several screens. It is pure data
 * on purpose, so the sidebar, the top bar title, the section tabs and
 * `src/__tests__/nav-routes.test.mjs` all read one list.
 *
 * `to` is where a click lands. `match` lists the other address prefixes that
 * belong to the same entry, so every route of the panel lights exactly one
 * item and opens its group (before this file ten settings screens lit nothing).
 */
export type OwnerCounter = "ordersToPack" | "reviewsToModerate"

export type OwnerNavItem = {
  labelKey: string
  to: string
  match?: string[]
  counter?: OwnerCounter
}

export type OwnerNavGroup = {
  id: string
  labelKey: string
  /** A group of one screen with the group's own name is drawn as one top-level entry. */
  flat?: boolean
  items: OwnerNavItem[]
}

export const OWNER_HOME: OwnerNavItem = {
  labelKey: "app.nav.owner.overview",
  to: "/",
}

export const OWNER_NAV: OwnerNavGroup[] = [
  {
    id: "sales",
    labelKey: "app.nav.owner.groups.sales",
    items: [
      { labelKey: "app.nav.owner.orders", to: "/orders", counter: "ordersToPack" },
      { labelKey: "app.nav.owner.customers", to: "/customers" },
      { labelKey: "app.nav.owner.reviews", to: "/reviews", counter: "reviewsToModerate" },
    ],
  },
  {
    id: "catalog",
    labelKey: "app.nav.owner.groups.catalog",
    items: [
      { labelKey: "app.nav.owner.products", to: "/products" },
      { labelKey: "app.nav.owner.categories", to: "/categories" },
      { labelKey: "app.nav.owner.attributes", to: "/product-attributes" },
      { labelKey: "app.nav.owner.courses", to: "/courses" },
    ],
  },
  {
    id: "storefront",
    labelKey: "app.nav.owner.groups.storefront",
    items: [
      { labelKey: "app.nav.owner.homePage", to: "/home-settings" },
      { labelKey: "app.nav.owner.pages", to: "/pages" },
      { labelKey: "app.nav.owner.journal", to: "/journal" },
      { labelKey: "app.nav.owner.branding", to: "/settings/branding" },
    ],
  },
  {
    id: "marketing",
    labelKey: "app.nav.owner.groups.marketing",
    items: [
      { labelKey: "app.nav.owner.promotions", to: "/promotions", match: ["/campaigns"] },
    ],
  },
  {
    id: "marketplaces",
    labelKey: "app.nav.owner.groups.marketplaces",
    flat: true,
    items: [
      {
        labelKey: "app.nav.owner.marketplaces",
        to: "/marketplaces/catalog",
        match: [
          "/marketplaces",
          "/marketplace-orders",
          "/settings/marketplaces",
          "/settings/wildberries",
          "/settings/ozon",
          "/settings/integrations",
        ],
      },
    ],
  },
  {
    id: "settings",
    labelKey: "app.nav.owner.groups.settings",
    items: [
      {
        labelKey: "app.nav.owner.delivery",
        to: "/shipping",
        match: [
          "/settings/delivery",
          "/settings/integrations/cdek",
          "/settings/integrations/apiship",
          "/settings/integrations/pochta",
        ],
      },
      {
        labelKey: "app.nav.owner.payments",
        to: "/settings/payments",
        match: ["/settings/integrations/robokassa"],
      },
      { labelKey: "app.nav.owner.requisites", to: "/settings/requisites" },
      { labelKey: "app.nav.owner.domains", to: "/settings/domains" },
      // t-2026-09-24-n12: the owner's sites with one catalogue, «Создать сайт».
      { labelKey: "app.nav.owner.sites", to: "/settings/sites" },
      { labelKey: "app.nav.owner.locale", to: "/settings/locale" },
      { labelKey: "app.nav.owner.notifications", to: "/settings/notifications" },
      { labelKey: "app.nav.owner.customerLogin", to: "/settings/customer-login" },
      {
        labelKey: "app.nav.owner.search",
        to: "/settings/seo",
        match: ["/settings/analytics", "/settings/redirects"],
      },
      { labelKey: "app.nav.owner.profile", to: "/settings/profile" },
    ],
  },
]

/** Segment-aware prefix test: `/products` owns `/products/1`, not `/product-attributes`. */
export const ownsPath = (prefix: string, pathname: string) =>
  prefix === "/"
    ? pathname === "/"
    : pathname === prefix || pathname.startsWith(prefix + "/")

/**
 * The entry a pathname belongs to. The LONGEST owning prefix wins, so
 * `/settings/integrations/cdek` goes to «Доставка» although the marketplaces
 * entry owns `/settings/integrations`.
 */
export const findActive = (
  pathname: string
): { group: OwnerNavGroup | null; item: OwnerNavItem } | null => {
  if (ownsPath("/", pathname)) {
    return { group: null, item: OWNER_HOME }
  }
  let best: { group: OwnerNavGroup; item: OwnerNavItem; length: number } | null = null
  for (const group of OWNER_NAV) {
    for (const item of group.items) {
      for (const prefix of [item.to, ...(item.match ?? [])]) {
        if (ownsPath(prefix, pathname) && (!best || prefix.length > best.length)) {
          best = { group, item, length: prefix.length }
        }
      }
    }
  }
  return best ? { group: best.group, item: best.item } : null
}

export type OwnerTab = { labelKey: string; to: string; match?: string[] }

/**
 * Sections whose screens sit side by side under one menu entry. The row of tabs
 * is drawn by the shell above the screen, so the screens themselves stay as
 * they are in the copied dashboard.
 */
export const OWNER_TABS: { owner: string; tabs: OwnerTab[] }[] = [
  {
    owner: "/marketplaces/catalog",
    tabs: [
      {
        labelKey: "app.nav.owner.tabs.mpConnection",
        to: "/settings/integrations",
        match: ["/settings/marketplaces", "/settings/wildberries", "/settings/ozon"],
      },
      { labelKey: "app.nav.owner.tabs.mpCatalog", to: "/marketplaces/catalog" },
      { labelKey: "app.nav.owner.tabs.mpPriceStock", to: "/marketplaces/price-stock" },
      { labelKey: "app.nav.owner.tabs.mpOrders", to: "/marketplace-orders" },
      { labelKey: "app.nav.owner.tabs.mpReviews", to: "/settings/marketplaces/reviews" },
      { labelKey: "app.nav.owner.tabs.mpSync", to: "/settings/marketplaces/sync" },
      { labelKey: "app.nav.owner.tabs.mpAnalytics", to: "/settings/marketplaces/analytics" },
    ],
  },
  {
    owner: "/promotions",
    tabs: [
      { labelKey: "app.nav.owner.tabs.promotions", to: "/promotions" },
      { labelKey: "app.nav.owner.tabs.campaigns", to: "/campaigns" },
    ],
  },
  {
    owner: "/shipping",
    tabs: [
      { labelKey: "app.nav.owner.tabs.deliveryMethods", to: "/shipping" },
      {
        labelKey: "app.nav.owner.tabs.deliveryCdek",
        to: "/settings/delivery",
        match: ["/settings/integrations/cdek", "/settings/integrations/apiship"],
      },
      {
        labelKey: "app.nav.owner.tabs.deliveryPochta",
        to: "/settings/integrations/pochta",
      },
    ],
  },
  {
    owner: "/settings/payments",
    tabs: [
      { labelKey: "app.nav.owner.tabs.paymentsMode", to: "/settings/payments" },
      { labelKey: "app.nav.owner.tabs.paymentsAccount", to: "/settings/integrations/robokassa" },
    ],
  },
  {
    owner: "/settings/seo",
    tabs: [
      { labelKey: "app.nav.owner.tabs.searchVerification", to: "/settings/seo" },
      { labelKey: "app.nav.owner.tabs.searchCounters", to: "/settings/analytics" },
      { labelKey: "app.nav.owner.tabs.searchRedirects", to: "/settings/redirects" },
    ],
  },
]

/** The tab row of the section a pathname is in, with the active tab's `to`. */
export const findTabs = (pathname: string) => {
  const active = findActive(pathname)
  if (!active) {
    return null
  }
  const section = OWNER_TABS.find((s) => s.owner === active.item.to)
  if (!section) {
    return null
  }
  let current: { to: string; length: number } | null = null
  for (const tab of section.tabs) {
    for (const prefix of [tab.to, ...(tab.match ?? [])]) {
      if (ownsPath(prefix, pathname) && (!current || prefix.length > current.length)) {
        current = { to: tab.to, length: prefix.length }
      }
    }
  }
  return { tabs: section.tabs, current: current?.to ?? null }
}
