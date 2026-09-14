import { MetadataRoute } from "next"
import { sdk, fetchWithoutLocale } from "@lib/config"
import { getRequestBaseURL } from "@lib/data/cookies"
import { locales } from "@i18n/config"

// Per request, not per module: one process answers for every shop by Host, and the
// sitemap has to list the shop that was asked (`lib/tenant/origin.ts`).
function url(base: string, locale: string, path: string) {
  const suffix = path === "/" ? "" : path
  return `${base}/${locale}${suffix}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getRequestBaseURL()
  const entries: MetadataRoute.Sitemap = []

  const staticRoutes = [
    { path: "/", priority: 1.0 },
    { path: "/store", priority: 0.9 },
    { path: "/customer-service", priority: 0.4 },
    { path: "/contact", priority: 0.4 },
    { path: "/shipping", priority: 0.4 },
    { path: "/returns", priority: 0.4 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
  ]

  const now = new Date()

  for (const locale of locales) {
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
        for (const locale of locales) {
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
      for (const locale of locales) {
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
    // tenant (`apps/backend/src/api/tenants/collections/route.ts`), so unlike
    // the two blocks above this one is NOT known to be disjoint between shops.
    // Out of scope for t11-seo-redirects: no tenant-collection link exists to
    // scope it by, and the migration report for the one real shop this task
    // ships redirects for lists 0 collections carrying products.
    const { collections } = await sdk.client.fetch<{
      collections: Array<{ handle?: string; updated_at?: string }>
    }>("/store/collections", {
      query: { fields: "handle,updated_at", limit: 100 },
      next: { tags: ["collections"] },
      cache: "force-cache",
    })

    for (const collection of collections) {
      if (!collection.handle) continue
      for (const locale of locales) {
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

    for (const page of pages) {
      entries.push({
        url: url(base, page.locale, `/pages/${page.key}`),
        lastModified: page.updated_at ? new Date(page.updated_at) : now,
        changeFrequency: "monthly",
        priority: 0.3,
      })
    }
  } catch {}

  return entries
}
