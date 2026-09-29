import { MetadataRoute } from "next"
import { sdk, fetchWithoutLocale } from "@lib/config"
import { listTenantArticles } from "@lib/data/tenant-articles"
import { getRequestBaseURL, getTenantHandle, getEnabledLocales } from "@lib/data/cookies"
import { locales, defaultLocale } from "@i18n/config"
import { shopLocales } from "@lib/util/shop-locales"

// Per request, not per module: one process answers for every shop by Host, and the
// sitemap has to list the shop that was asked (`lib/tenant/origin.ts`).
function url(base: string, locale: string, path: string) {
  const suffix = path === "/" ? "" : path
  return `${base}/${locale}${suffix}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getRequestBaseURL()
  const entries: MetadataRoute.Sitemap = []

  // The six placeholder routes are the starter's own, and on a tenant they no
  // longer render: `guardStarterLegalPage` redirects each one to the shop's
  // page or answers 404 (f05-checkout-legal-stubs). Listing them for a tenant
  // is how "Это страница-заглушка из стартера" got indexed under a shop's own
  // domain in the first place; the shop's real pages are listed below, from
  // `/store/tenant/pages/sitemap`.
  const hasTenant = (await getTenantHandle()) !== null

  // The SHOP's languages, not the build's (b08-seo-storefront). A tenant that
  // has saved `enabled_locales` gets exactly those; a host with no tenant, or a
  // tenant that saved nothing, keeps every shipped locale — the behaviour every
  // deployment had before this change.
  const sitemapLocales = shopLocales(locales, await getEnabledLocales(), defaultLocale)

  const staticRoutes = [
    { path: "/", priority: 1.0 },
    { path: "/store", priority: 0.9 },
    ...(hasTenant
      ? []
      : [
          { path: "/customer-service", priority: 0.4 },
          { path: "/contact", priority: 0.4 },
          { path: "/shipping", priority: 0.4 },
          { path: "/returns", priority: 0.4 },
          { path: "/privacy", priority: 0.3 },
          { path: "/terms", priority: 0.3 },
        ]),
  ]

  const now = new Date()

  for (const locale of sitemapLocales) {
    for (const { path, priority } of staticRoutes) {
      entries.push({
        url: url(base, locale, path),
        lastModified: now,
        changeFrequency: "weekly",
        priority,
      })
    }
  }

  try {
    let offset = 0
    const limit = 100

    while (true) {
      const { products, count } = await sdk.client.fetch<{
        products: Array<{ handle?: string; updated_at?: string }>
        count: number
      }>("/store/products", {
        query: { limit, offset, fields: "handle,updated_at" },
        next: { tags: ["products"] },
        cache: "force-cache",
      })

      for (const product of products) {
        if (!product.handle) continue
        for (const locale of sitemapLocales) {
          entries.push({
            url: url(base, locale, `/products/${product.handle}`),
            lastModified: product.updated_at ? new Date(product.updated_at) : now,
            changeFrequency: "weekly",
            priority: 0.8,
          })
        }
      }

      offset += limit
      if (offset >= count) break
    }
  } catch {}

  try {
    // `/store/product-categories`, unlike `/store/products`, is NOT scoped by
    // the publishable key's sales channel — categories carry no sales-channel
    // link in Medusa, so every shop's categories would answer here. The
    // tenant-scoped read (`/store/tenant/product-categories`, wired through
    // the tenant-product-category link) is what keeps two tenants' sitemaps
    // disjoint (t11-seo-redirects step 3).
    const { product_categories } = await sdk.client.fetch<{
      product_categories: Array<{ handle?: string; updated_at?: string }>
    }>("/store/tenant/product-categories", {
      query: { fields: "handle,updated_at", limit: 500 },
      next: { tags: ["categories"] },
      cache: "force-cache",
    })

    for (const category of product_categories) {
      if (!category.handle) continue
      for (const locale of sitemapLocales) {
        entries.push({
          url: url(base, locale, `/categories/${category.handle}`),
          lastModified: category.updated_at ? new Date(category.updated_at) : now,
          changeFrequency: "weekly",
          priority: 0.75,
        })
      }
    }
  } catch {}

  try {
    // Collections are global reference data in this repository, not owned by a
    // tenant (`apps/backend/src/api/tenants/collections/route.ts`), so
    // `/store/collections` answers with EVERY shop's — which is how `acme` and
    // `cherkashino` came to share 36 `/<locale>/collections/new` paths while
    // sharing no product, category or page (measured on the b08 stand, the one
    // overlap left after t11-seo-redirects). There is still no
    // tenant-collection link to scope by, so `/store/tenant/collections` scopes
    // by the ownership that IS recorded: the collections this tenant's own
    // products sit in (b08-seo-storefront). A single-store install resolves no
    // tenant and keeps reading the unscoped route, where there is no second
    // shop to leak into and every collection is the shop's own.
    const { collections } = await sdk.client.fetch<{
      collections: Array<{ handle?: string; updated_at?: string }>
    }>(hasTenant ? "/store/tenant/collections" : "/store/collections", {
      query: { fields: "handle,updated_at", limit: 100 },
      next: { tags: ["collections"] },
      cache: "force-cache",
    })

    for (const collection of collections) {
      if (!collection.handle) continue
      for (const locale of sitemapLocales) {
        entries.push({
          url: url(base, locale, `/collections/${collection.handle}`),
          lastModified: collection.updated_at ? new Date(collection.updated_at) : now,
          changeFrequency: "weekly",
          priority: 0.7,
        })
      }
    }
  } catch {}

  try {
    const { pages } = await fetchWithoutLocale<{
      pages: Array<{ key: string; locale: string; updated_at?: string }>
    }>("/store/tenant/pages/sitemap", {
      next: { tags: ["tenant-pages"] },
      cache: "force-cache",
    })

    // A page saved in a language the shop does not publish answers 301 to the
    // shop's own language (`shopLocaleRedirect`, 46df A-12), so it is not an
    // address to index.
    for (const page of pages) {
      if (!sitemapLocales.some((locale) => locale === page.locale)) {
        continue
      }
      entries.push({
        url: url(base, page.locale, `/pages/${page.key}`),
        lastModified: page.updated_at ? new Date(page.updated_at) : now,
        changeFrequency: "monthly",
        priority: 0.3,
      })
    }
  } catch {}

  // t10-blog: the shop's journal. The loader goes through `sdk.client.fetch`,
  // which carries THIS request's publishable key, and the backend scopes the
  // answer to the tenant behind that key — so a shop's articles appear in its
  // own sitemap and in no other shop's, the same way the catalog above is
  // already per-shop. A shop with no journal adds nothing here, not even the
  // feed URL: a sitemap entry for an empty page is a crawl budget spent on
  // nothing.
  try {
    const limit = 100
    let offset = 0
    const seen: Array<{ slug: string; published_at: string | null }> = []

    while (true) {
      const { articles, count } = await listTenantArticles({ limit, offset })
      seen.push(...articles)
      offset += limit
      if (articles.length === 0 || offset >= count) break
    }

    if (seen.length > 0) {
      for (const locale of sitemapLocales) {
        entries.push({
          url: url(base, locale, "/journal"),
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        })
      }

      for (const article of seen) {
        for (const locale of sitemapLocales) {
          entries.push({
            url: url(base, locale, `/journal/${article.slug}`),
            lastModified: article.published_at ? new Date(article.published_at) : now,
            changeFrequency: "monthly",
            priority: 0.65,
          })
        }
      }
    }
  } catch {}

  return entries
}
