import { MetadataRoute } from "next"
import { sdk } from "@lib/config"
import { listTenantArticles } from "@lib/data/tenant-articles"
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
    const { product_categories } = await sdk.client.fetch<{
      product_categories: Array<{ handle?: string; updated_at?: string }>
    }>("/store/product-categories", {
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
      for (const locale of locales) {
        entries.push({
          url: url(base, locale, "/journal"),
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        })
      }

      for (const article of seen) {
        for (const locale of locales) {
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
