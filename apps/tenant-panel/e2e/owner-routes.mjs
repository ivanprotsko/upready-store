/**
 * Every screen a shop owner can reach in the tenant panel, as URL templates.
 * The walker (`owner-walker.e2e.mjs`) and the two probes read this one list, so
 * a route added to `src/app.tsx` and missing here is caught by
 * `src/__tests__/owner-routes-manifest.test.mjs` rather than silently skipped.
 *
 * `:param` segments are filled from the stand's own data by `resolveParams`
 * below: each resolver asks the panel's API through the logged-in page, the
 * same session the owner has, so the walker never carries an id of its own.
 * A route whose params cannot be resolved on the stand is reported as
 * `unresolved` with the reason, never dropped.
 *
 * `core: true` marks the screens of the daily jobs. Acceptance line 6 (no
 * horizontal scroll at 390 and a reachable primary action) is measured on them.
 */

/** @typedef {{ path: string, core?: boolean, kind?: "page"|"overlay"|"public"|"placeholder", note?: string }} OwnerRoute */

/** @type {OwnerRoute[]} */
export const OWNER_ROUTES = [
  // Обзор
  { path: "/", core: true },

  // Товары
  { path: "/products", core: true },
  { path: "/products?q=zzzz-nothing-matches", note: "empty search result" },
  { path: "/products/create", core: true, kind: "overlay" },
  { path: "/products/export", kind: "overlay" },
  { path: "/products/import", kind: "overlay" },
  { path: "/products/import/:import_id", kind: "overlay" },
  { path: "/products/:product_id", core: true },
  { path: "/products/:product_id/edit", kind: "overlay" },
  { path: "/products/:product_id/edit-variant?variant_id=:variant_id", kind: "overlay" },
  { path: "/products/:product_id/sales-channels", kind: "overlay" },
  { path: "/products/:product_id/attributes", kind: "overlay" },
  { path: "/products/:product_id/custom-attributes", kind: "overlay" },
  { path: "/products/:product_id/translations", kind: "overlay" },
  { path: "/products/:product_id/organization", kind: "overlay" },
  { path: "/products/:product_id/shipping-profile", kind: "overlay" },
  { path: "/products/:product_id/media", kind: "overlay" },
  { path: "/products/:product_id/images/:image_id/variants", kind: "overlay" },
  { path: "/products/:product_id/prices", kind: "overlay" },
  { path: "/products/:product_id/variants/create", kind: "overlay" },
  { path: "/products/:product_id/stock", kind: "overlay" },
  { path: "/products/:product_id/metadata/edit", note: "redirects to the parent screen" },
  { path: "/products/:product_id/options/manage", kind: "overlay" },
  { path: "/products/:product_id/variants/:variant_id" },
  { path: "/products/:product_id/variants/:variant_id/edit", kind: "overlay" },
  { path: "/products/:product_id/variants/:variant_id/prices", kind: "overlay" },
  { path: "/products/:product_id/variants/:variant_id/manage-items", kind: "overlay" },
  { path: "/products/:product_id/variants/:variant_id/media", kind: "overlay" },
  { path: "/products/:product_id/variants/:variant_id/metadata/edit", note: "redirects to the parent screen" },

  // Характеристики
  { path: "/product-attributes" },
  { path: "/product-attributes?q=zzzz-nothing-matches", note: "empty search result" },
  { path: "/product-attributes/create", kind: "overlay" },
  { path: "/product-attributes/:attribute_id" },
  { path: "/product-attributes/:attribute_id/edit", kind: "overlay" },
  { path: "/product-attributes/:attribute_id/translations/edit", kind: "overlay" },
  { path: "/product-attributes/:attribute_id/values/edit", kind: "overlay" },

  // Курсы
  { path: "/courses", core: true },
  { path: "/courses/:course_id", core: true },
  { path: "/courses/:course_id/lessons/new", kind: "overlay" },
  { path: "/courses/:course_id/lessons/:lesson_id", kind: "overlay" },

  // Категории
  { path: "/categories", core: true },
  { path: "/categories/create", kind: "overlay" },
  { path: "/categories/organize", kind: "overlay" },
  { path: "/categories/:category_id" },
  { path: "/categories/:category_id/edit", kind: "overlay" },
  { path: "/categories/:category_id/products", kind: "overlay" },
  { path: "/categories/:category_id/organize", kind: "overlay" },
  { path: "/categories/:category_id/metadata/edit", note: "redirects to the parent screen" },

  // Заказы
  { path: "/orders", core: true },
  { path: "/orders?q=zzzz-nothing-matches", note: "empty search result" },
  { path: "/orders/export", kind: "overlay" },
  { path: "/orders/:order_id", core: true },
  { path: "/orders/:order_id/fulfillment", core: true, kind: "overlay" },
  { path: "/orders/:fulfilled_order_id/:fulfillment_id/create-shipment", kind: "overlay" },
  { path: "/orders/:order_id/returns", kind: "placeholder" },
  { path: "/orders/:order_id/returns/:return_id/receive", kind: "placeholder" },
  { path: "/orders/:order_id/claims", kind: "placeholder" },
  { path: "/orders/:order_id/exchanges", kind: "placeholder" },
  { path: "/orders/:order_id/edits", kind: "placeholder" },
  { path: "/orders/:order_id/refund", kind: "placeholder" },
  { path: "/orders/:order_id/transfer", kind: "placeholder" },
  { path: "/orders/:order_id/email", kind: "placeholder" },
  { path: "/orders/:order_id/shipping-address", kind: "placeholder" },
  { path: "/orders/:order_id/billing-address", kind: "placeholder" },
  { path: "/orders/:order_id/allocate-items", kind: "placeholder" },
  { path: "/orders/:order_id/metadata/edit", note: "redirects to the parent screen" },
  { path: "/marketplace-orders", note: "legacy URL, redirects to /marketplaces/wildberries/orders" },
  { path: "/marketplace-orders/:mp_order_id", note: "legacy URL, redirects" },

  // Клиенты, отзывы
  { path: "/customers", core: true },
  { path: "/customers/:customer_id" },
  { path: "/reviews", core: true },

  // Акции
  { path: "/promotions" },
  { path: "/promotions/create", kind: "overlay" },
  { path: "/promotions/:promotion_id" },
  { path: "/promotions/:promotion_id/edit", kind: "overlay" },
  { path: "/promotions/:promotion_id/add-to-campaign", kind: "overlay" },
  { path: "/promotions/:promotion_id/:rule_type/edit", kind: "overlay" },
  { path: "/campaigns" },
  { path: "/campaigns/create", kind: "overlay" },
  { path: "/campaigns/:campaign_id" },
  { path: "/campaigns/:campaign_id/edit", kind: "overlay" },
  { path: "/campaigns/:campaign_id/configuration", kind: "overlay" },
  { path: "/campaigns/:campaign_id/edit-budget", kind: "overlay" },
  { path: "/campaigns/:campaign_id/add-promotions", kind: "overlay" },

  // Витрина
  { path: "/home-settings", core: true },
  { path: "/pages", core: true },
  { path: "/pages/create", kind: "overlay" },
  { path: "/pages/:page_key", core: true },
  { path: "/journal" },
  { path: "/journal/new" },
  { path: "/journal/:article_slug" },
  { path: "/settings/branding" },
  { path: "/settings/branding/logo/edit", kind: "overlay" },
  { path: "/settings/branding/icons/edit", kind: "overlay" },
  { path: "/settings/branding/color/edit", kind: "overlay" },

  // Доставка
  { path: "/shipping", core: true },
  { path: "/shipping/create", kind: "overlay" },
  { path: "/shipping/zones", kind: "overlay" },
  { path: "/shipping/settings/weight/edit", kind: "overlay" },
  { path: "/shipping/:shipping_option_id" },
  { path: "/shipping/:shipping_option_id/edit", kind: "overlay" },

  // Настройки
  { path: "/settings/profile" },
  { path: "/settings/profile/edit", kind: "overlay" },
  { path: "/settings/profile/password", kind: "overlay" },
  { path: "/settings/domains" },
  { path: "/settings/domains/change", kind: "overlay" },
  { path: "/settings/domains/add", kind: "overlay" },
  { path: "/settings/sites" },
  { path: "/settings/sites/create", kind: "overlay" },
  { path: "/settings/sites/:site_id" },
  { path: "/settings/sites/:site_id/sisters/edit", kind: "overlay" },
  { path: "/settings/notifications" },
  { path: "/settings/notifications/edit", kind: "overlay" },
  { path: "/settings/notifications/telegram-connect", kind: "overlay" },
  { path: "/settings/customer-login" },
  { path: "/settings/customer-login/edit", kind: "overlay" },
  { path: "/settings/locale" },
  { path: "/settings/locale/edit", kind: "overlay" },
  { path: "/settings/payments", core: true },
  { path: "/settings/payments/robokassa" },
  { path: "/settings/payments/robokassa/edit", kind: "overlay" },
  { path: "/settings/payments/robokassa/pre-notice/edit", kind: "overlay" },
  { path: "/settings/payments/manual" },
  { path: "/settings/payments/manual/edit", kind: "overlay" },
  { path: "/settings/payments/manual/bank/create", kind: "overlay" },
  { path: "/settings/payments/manual/crypto/create", kind: "overlay" },
  { path: "/settings/payments/manual/requisites/:requisite_id/edit", kind: "overlay" },
  { path: "/settings/payments/manual/contacts/edit", kind: "overlay" },
  { path: "/settings/payments/manual/pre-notice/edit", kind: "overlay" },
  { path: "/settings/payments/tribute", note: "only where the instance offers Tribute; elsewhere redirects to /settings/payments" },
  { path: "/settings/payments/tribute/edit", kind: "overlay" },
  { path: "/settings/payments/tribute/pre-notice/edit", kind: "overlay" },
  { path: "/settings/payments/btcpay", note: "only where the instance takes cryptocurrency; elsewhere redirects to /settings/payments" },
  { path: "/settings/payments/btcpay/edit", kind: "overlay" },
  { path: "/settings/payments/btcpay/pre-notice/edit", kind: "overlay" },
  { path: "/settings/payments/bitcart", note: "only where the instance takes cryptocurrency; elsewhere redirects to /settings/payments" },
  { path: "/settings/payments/bitcart/edit", kind: "overlay" },
  { path: "/settings/payments/bitcart/pre-notice/edit", kind: "overlay" },
  { path: "/settings/payments/x402", note: "only where the instance takes cryptocurrency; elsewhere redirects to /settings/payments" },
  { path: "/settings/payments/x402/edit", kind: "overlay" },
  { path: "/settings/delivery", core: true },
  { path: "/settings/requisites", core: true },
  { path: "/settings/requisites/edit", kind: "overlay" },
  { path: "/settings/requisites/edit-contacts", kind: "overlay" },
  { path: "/settings/requisites/edit-personal", kind: "overlay" },
  { path: "/settings/requisites/edit-dates", kind: "overlay" },
  { path: "/settings/requisites/edit-other", kind: "overlay" },
  { path: "/settings/redirects" },
  { path: "/settings/redirects?q=zzzz-nothing-matches", note: "empty search result" },
  { path: "/settings/redirects/create", kind: "overlay" },
  { path: "/settings/redirects/:redirect_id/edit", kind: "overlay" },
  { path: "/settings/seo" },
  { path: "/settings/seo/edit", kind: "overlay" },
  { path: "/settings/analytics" },
  { path: "/settings/analytics/edit", kind: "overlay" },
  { path: "/settings/staff", note: "needs the staff permission (t-2026-10-07-11)" },
  { path: "/settings/staff/create", kind: "overlay" },
  { path: "/settings/staff/:staff_id" },
  { path: "/settings/staff/:staff_id/edit", kind: "overlay" },

  // Торговые площадки и подключения (mp-section-design: the screens of one
  // marketplace are the children of its sidebar entry; the old addresses redirect)
  { path: "/marketplaces/wildberries/products", core: true },
  { path: "/marketplaces/wildberries/products?q=zzzz-nothing-matches", note: "empty search result" },
  { path: "/marketplaces/wildberries/products/:mp_product_id" },
  { path: "/marketplaces/wildberries/price-stock" },
  { path: "/marketplaces/wildberries/orders", core: true },
  { path: "/marketplaces/wildberries/orders/:mp_order_id" },
  { path: "/marketplaces/wildberries/reviews" },
  { path: "/marketplaces/wildberries/analytics" },
  { path: "/marketplaces/wildberries/sync" },
  { path: "/marketplaces/ozon", kind: "placeholder", note: "Ozon stub until the adapter delivers data" },
  { path: "/marketplaces/catalog", note: "legacy URL, redirects" },
  { path: "/marketplaces/price-stock", note: "legacy URL, redirects" },
  { path: "/settings/marketplaces" },
  { path: "/settings/marketplaces/sync", note: "legacy URL, redirects" },
  { path: "/settings/marketplaces/reviews", note: "legacy URL, redirects" },
  { path: "/settings/marketplaces/analytics", note: "legacy URL, redirects" },
  { path: "/settings/marketplaces/wildberries" },
  { path: "/settings/marketplaces/ozon" },
  { path: "/settings/wildberries", note: "legacy URL, redirects" },
  { path: "/settings/ozon", note: "legacy URL, redirects" },
  { path: "/settings/integrations" },
  { path: "/settings/integrations/wildberries" },
  { path: "/settings/integrations/ozon" },
  { path: "/settings/integrations/robokassa" },
  { path: "/settings/integrations/apiship" },
  { path: "/settings/integrations/apiship/edit/:apiship_section", kind: "overlay" },
  { path: "/settings/integrations/cdek" },
  { path: "/settings/integrations/pochta" },
  { path: "/settings/integrations/telegram-bot" },

  // Без входа и «не найдено»
  { path: "/this-screen-does-not-exist", note: "404 inside the shell" },
]

/** Screens outside the session; the walker shoots them before logging in. */
export const PUBLIC_ROUTES = [
  { path: "/login", kind: "public", core: true },
  { path: "/forgot-password", kind: "public" },
  { path: "/reset-password", kind: "public", note: "opened without a token" },
]

/**
 * One resolver per `:param`. Each receives `api(path)` — a GET through the
 * logged-in page — and the params resolved so far, and returns the value or
 * throws with the reason the stand cannot supply one.
 */
const first = (list, what) => {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`the stand has no ${what}`)
  }
  return list[0]
}

export const PARAM_RESOLVERS = {
  product_id: async (api) => {
    const { products } = await api(
      "/tenants/products?limit=20&fields=id,title,*variants,*images"
    )
    const rich = (products ?? []).find(
      (p) => (p.variants?.length ?? 0) > 0 && (p.images?.length ?? 0) > 0
    )
    return (rich ?? first(products, "products")).id
  },
  variant_id: async (api, got) => {
    const { product } = await api(
      `/tenants/products/${got.product_id}?fields=id,*variants`
    )
    return first(product?.variants, "variants on the sample product").id
  },
  image_id: async (api, got) => {
    const { product } = await api(
      `/tenants/products/${got.product_id}?fields=id,*images`
    )
    return first(product?.images, "images on the sample product").id
  },
  import_id: async (api) => {
    const body = await api("/tenants/products/import")
    return first(body.product_imports, "product imports").id
  },
  // A choice list when the stand has one, so the card shows its values section
  // and `values/edit` opens with values (t-2026-10-14-01, G2).
  attribute_id: async (api) => {
    const body = await api("/tenants/product-attributes")
    const list = body.product_attributes ?? []
    return (list.find((a) => a.type === "select") ?? first(list, "product attributes")).id
  },
  category_id: async (api) => {
    const { product_categories } = await api(
      "/tenants/product-categories?limit=1"
    )
    return first(product_categories, "categories").id
  },
  course_id: async (api) => {
    const { courses } = await api("/tenants/courses?limit=1")
    return first(courses, "courses").id
  },
  lesson_id: async (api, got) => {
    const { lessons } = await api(`/tenants/courses/${got.course_id}/lessons`)
    return first(lessons, "lessons on the sample course").id
  },
  order_id: async (api) => {
    const { orders } = await api(
      "/tenants/orders?limit=50&fields=id,fulfillment_status,status"
    )
    const open = (orders ?? []).find(
      (o) => o.status !== "canceled" && o.fulfillment_status === "not_fulfilled"
    )
    return (open ?? first(orders, "orders")).id
  },
  fulfilled_order_id: async (api, got) => {
    const { orders } = await api(
      "/tenants/orders?limit=50&fields=id,*fulfillments"
    )
    const hit = (orders ?? []).find((o) =>
      (o.fulfillments ?? []).some((f) => !f.shipped_at && !f.canceled_at)
    )
    if (!hit) {
      throw new Error("the stand has no order with an unshipped fulfillment")
    }
    got.__fulfillment = hit.fulfillments.find(
      (f) => !f.shipped_at && !f.canceled_at
    ).id
    return hit.id
  },
  fulfillment_id: async (_api, got) => {
    if (!got.__fulfillment) {
      throw new Error("the stand has no order with an unshipped fulfillment")
    }
    return got.__fulfillment
  },
  mp_product_id: async (api) => {
    const body = await api("/tenants/marketplaces/wb/products?limit=1")
    return first(body.products, "marketplace cards").id
  },
  mp_order_id: async (api) => {
    // «Wildberries → Заказы» (task-04): one marketplace per list, no shop rows.
    const { orders } = await api("/tenants/marketplaces/wb/orders?limit=1")
    if (!orders?.length) {
      throw new Error("the stand has no Wildberries orders")
    }
    return orders[0].id
  },
  // The panel never creates a return, so there is no real id to read. The route
  // renders the "not built" placeholder whatever the id is, and the walker only
  // needs to see what that placeholder tells the owner.
  return_id: async () => "return-placeholder",
  // The router takes the rule group as a param; "rules" is the first of the
  // three the promotion screens link to (rules, target-rules, buy-rules).
  rule_type: async () => "rules",
  // The ApiShip page edits each section in a drawer on `edit/<section>`
  // (connection, sender, parcel, methods, markup); «sender» has the most fields.
  apiship_section: async () => "sender",
  customer_id: async (api) => {
    const { customers } = await api("/tenants/customers?limit=1")
    return first(customers, "customers").id
  },
  promotion_id: async (api) => {
    const { promotions } = await api("/tenants/promotions?limit=1")
    return first(promotions, "promotions").id
  },
  campaign_id: async (api) => {
    const { campaigns } = await api("/tenants/campaigns?limit=1")
    return first(campaigns, "campaigns").id
  },
  page_key: async (api) => {
    const body = await api("/tenants/pages")
    const list = body.pages ?? []
    const contacts = list.find((p) => /contact/i.test(p.key ?? ""))
    return (contacts ?? first(list, "pages")).key
  },
  article_slug: async (api) => {
    const body = await api("/tenants/articles?limit=1")
    const list = body.articles ?? []
    return first(list, "journal articles").slug
  },
  // The current site comes first in `GET /tenants/sites`: its card is the one
  // with the sister sites and the link to «Адрес магазина».
  site_id: async (api) => {
    const { sites } = await api("/tenants/sites")
    return first(sites, "sites").id
  },
  // A login the owner may open a form on: another person's, not the
  // platform developer's (t-2026-10-14-41), the caller's own when it is alone.
  staff_id: async (api) => {
    const { staff } = await api("/tenants/staff")
    const other = (staff ?? []).find((m) => !m.is_self && m.role !== "developer")
    return (other ?? first(staff, "staff logins")).id
  },
  redirect_id: async (api) => {
    const { redirects } = await api("/tenants/redirects")
    return first(redirects, "redirect rules").id
  },
  shipping_option_id: async (api) => {
    const body = await api("/tenants/shipping-methods")
    return first(body.methods, "delivery methods").id
  },
  // «Перевод по реквизитам» (t-2026-10-14-01, line us-8): the first item of
  // the shop's transfer requisites, the one the list shows on top.
  requisite_id: async (api) => {
    const body = await api("/tenants/payment-settings/manual")
    return first(body.manual_payment?.requisites, "transfer requisites").id
  },
}

/**
 * Fills every `:param` of `template`. Resolved values are cached in `got`, so
 * one walk shows the same product, order and customer on every screen.
 *
 * @returns {Promise<{ url: string } | { unresolved: string }>}
 */
export const resolveRoute = async (template, api, got) => {
  const names = [...template.matchAll(/:([a-z_]+)/g)].map((m) => m[1])
  for (const name of names) {
    if (got[name] !== undefined) {
      continue
    }
    const resolver = PARAM_RESOLVERS[name]
    if (!resolver) {
      return { unresolved: `no resolver for :${name}` }
    }
    try {
      got[name] = await resolver(api, got)
    } catch (error) {
      return { unresolved: `:${name} — ${error.message}` }
    }
  }
  return {
    url: template.replace(/:([a-z_]+)/g, (_, name) =>
      encodeURIComponent(got[name])
    ),
  }
}

/** File-system-safe name for a route template, stable across runs. */
export const slugOf = (template) =>
  template === "/"
    ? "home"
    : template
        .replace(/^\//, "")
        .replace(/[?=&]/g, "_")
        .replace(/:/g, "")
        .replace(/\//g, "__")
