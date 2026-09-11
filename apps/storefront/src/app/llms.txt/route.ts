import { fetchWithoutLocale } from "@lib/config"
import { getRequestBaseURL, getSiteName } from "@lib/data/cookies"
import { locales, localeLabels } from "@i18n/config"


// Catalog sections are capped so the file stays scannable. Whatever is cut is
// stated in the output rather than silently dropped.
const PRODUCT_LIMIT = 100
const CATEGORY_LIMIT = 100
const COLLECTION_LIMIT = 50

// Fetched through `fetchWithoutLocale`: this document is not locale-scoped, so
// the catalog is read from the base records rather than a translation picked
// from the visitor's cookie.

// Backed by the same cache tags the /api/revalidate webhook busts, plus an
// hourly floor so the file still refreshes if a webhook is missed.
export const revalidate = 3600

type Entry = {
  handle?: string
  title?: string
  name?: string
  subtitle?: string | null
  description?: string | null
}

// Links omit the locale prefix: middleware 302s to the visitor's language, and
// every locale root is listed under ## Optional.
function absolute(base: string, path: string) {
  return `${base}${path}`
}

/** Collapse to a single line — a stray newline would break the list item. */
function oneLine(value: string | null | undefined, max = 120) {
  if (!value) return ""
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function listItem(label: string, href: string, description?: string | null) {
  const note = oneLine(description)
  return note ? `- [${label}](${href}): ${note}` : `- [${label}](${href})`
}

function section(
  base: string,
  heading: string,
  items: string[],
  truncated?: { shown: number; total: number }
) {
  if (!items.length) return []
  const lines = [`## ${heading}`, "", ...items]
  if (truncated && truncated.total > truncated.shown) {
    lines.push(
      `- _${
        truncated.total - truncated.shown
      } more not listed here; the full set is in [sitemap.xml](${base}/sitemap.xml)._`
    )
  }
  return [...lines, ""]
}

async function fetchCollections() {
  const { collections } = await fetchWithoutLocale<{ collections: Entry[] }>(
    "/store/collections",
    {
      query: { fields: "handle,title", limit: COLLECTION_LIMIT },
      next: { tags: ["collections"] },
      cache: "force-cache",
    }
  )
  return collections ?? []
}

async function fetchCategories() {
  const { product_categories } = await fetchWithoutLocale<{
    product_categories: Entry[]
  }>("/store/product-categories", {
    query: { fields: "handle,name,description", limit: CATEGORY_LIMIT },
    next: { tags: ["categories"] },
    cache: "force-cache",
  })
  return product_categories ?? []
}

async function fetchProducts() {
  const { products, count } = await fetchWithoutLocale<{
    products: Entry[]
    count: number
  }>("/store/products", {
    query: {
      fields: "handle,title,subtitle,description",
      limit: PRODUCT_LIMIT,
    },
    next: { tags: ["products"] },
    cache: "force-cache",
  })
  return { products: products ?? [], count: count ?? 0 }
}

export async function GET() {
  // The base is the origin of THIS request: one process serves every shop by Host
  // (`lib/tenant/origin.ts`), and the file has to name the shop that was asked.
  const [collections, categories, catalog, siteName, base] = await Promise.all([
    fetchCollections().catch(() => [] as Entry[]),
    fetchCategories().catch(() => [] as Entry[]),
    fetchProducts().catch(() => ({ products: [] as Entry[], count: 0 })),
    getSiteName(),
    getRequestBaseURL(),
  ])

  const lines: string[] = [
    `# ${siteName}`,
    "",
    "> Live demo of the Gorgo Medusa DTC Starter — an open-source, production-ready",
    "> direct-to-consumer storefront built on Next.js 15 (App Router) and Medusa 2.",
    "> The catalog is seeded demo data: orders placed here are not fulfilled and no",
    "> payment is actually taken.",
    "",
    "The demo exists to show what the starter ships with: a conversion-tuned modal",
    "checkout with address autocomplete, a searchable and filterable",
    `catalog, ${locales.length} languages, transactional email templates, on-demand cache`,
    "revalidation on catalog changes, and an Integration Module for managing payment",
    "and delivery provider settings from the Medusa Admin.",
    "",
    "Pages are served per locale under `/{locale}/…`. The links below omit the",
    "locale, so they resolve to the language negotiated from the request; add a",
    "locale prefix to pin one.",
    "Interface and catalog are both translated, so the same product reads in the",
    "language of the URL. Cart, checkout and account pages are deliberately absent",
    "from this file: they are per-session and disallowed in robots.txt.",
    "",
    ...section(base, "Browse", [
      listItem(
        "Home",
        absolute(base, ""),
        "Landing page describing the starter, with featured collections"
      ),
      listItem(
        "All products",
        absolute(base, "/store"),
        "Full catalog with search, filtering and sorting"
      ),
    ]),
    ...section(base, "Project", [
      listItem(
        "Source code",
        "https://github.com/gorgojs/medusa-dtc-starter",
        "The starter this demo runs on — setup, configuration and deployment"
      ),
      listItem(
        "Gorgo",
        "https://gorgojs.com",
        "Medusa plugins and integrations"
      ),
      listItem(
        "Documentation",
        "https://docs.gorgojs.com",
        "Docs for the integrations and tools used by this storefront"
      ),
    ]),
    ...section(base, "Optional", [
      ...locales.map((locale) =>
        listItem(
          `${localeLabels[locale]} storefront`,
          `${base}/${locale}`,
          `Same store in ${localeLabels[locale]}`
        )
      ),
      listItem(
        "sitemap.xml",
        `${base}/sitemap.xml`,
        `Every product, category and collection URL across all ${locales.length} locales`
      ),
    ]),
    ...section(base, 
      "Collections",
      collections
        .filter((c) => c.handle)
        .map((c) =>
          listItem(c.title || c.handle!, absolute(base, `/collections/${c.handle}`))
        )
    ),
    ...section(base, 
      "Categories",
      categories
        .filter((c) => c.handle)
        .map((c) =>
          listItem(
            c.name || c.handle!,
            absolute(base, `/categories/${c.handle}`),
            c.description
          )
        )
    ),
    ...section(base, 
      "Products",
      catalog.products
        .filter((p) => p.handle)
        .map((p) =>
          listItem(
            p.title || p.handle!,
            absolute(base, `/products/${p.handle}`),
            p.subtitle || p.description
          )
        ),
      {
        shown: Math.min(catalog.products.length, PRODUCT_LIMIT),
        total: catalog.count,
      }
    ),
  ]

  return new Response(`${lines.join("\n").trimEnd()}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
