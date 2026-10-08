import { fetchWithoutLocale } from "@lib/config"
import {
  getEnabledLocales,
  getRequestBaseURL,
  getSiteName,
  getTenantDefaultLocale,
  getTenantHandle,
} from "@lib/data/cookies"
import { withoutCategoriesOffTheMenu } from "@lib/data/categories"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { getEffectiveSettings, getTenantHome } from "@lib/data/tenant-home"
import { homeDescription } from "@lib/util/home-description"
import { localizedHero } from "@lib/util/localized-hero"
import { shopLocales } from "@lib/util/shop-locales"
import { DEFAULT_BLOCK_ORDER, DEFAULT_HERO } from "@modules/home/variants"
import { defaultLocale, locales, localeLabels } from "@i18n/config"
import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"


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

// The starter's links omit the locale prefix: middleware 302s to the visitor's
// language, and every locale root is listed under ## Optional. A shop's links
// carry its language (`shopFile`).
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

/**
 * A shop's own collections: the ones its products sit in. `/store/collections`
 * answers with every shop's (the note in `app/sitemap.ts`).
 */
async function fetchShopCollections() {
  const { collections } = await fetchWithoutLocale<{ collections: Entry[] }>(
    "/store/tenant/collections",
    {
      query: { fields: "handle,title", limit: COLLECTION_LIMIT },
      next: { tags: ["collections"] },
      cache: "force-cache",
    }
  )
  return collections ?? []
}

/**
 * A shop's own categories, and only the ones its menu shows: a category with
 * no card a buyer can open is not listed (`withoutCategoriesOffTheMenu`).
 * `/store/product-categories` is not scoped to a shop at all.
 */
async function fetchShopCategories() {
  const { product_categories } = await fetchWithoutLocale<{
    product_categories: HttpTypes.StoreProductCategory[]
  }>("/store/tenant/product-categories", {
    query: {
      fields: "id,handle,name,description,*category_children",
      limit: CATEGORY_LIMIT,
    },
    next: { tags: ["categories"] },
    cache: "force-cache",
  })
  return withoutCategoriesOffTheMenu(product_categories ?? [])
}

/**
 * The words a shop's file is labelled with. Every one is a key the dictionary
 * already carries for the interface; none was written for this file.
 */
const SHOP_LABELS = {
  shop: "Breadcrumb.store",
  home: "Breadcrumb.home",
  allProducts: "Store.allProducts",
  languages: "RegionSelect.tabLanguage",
  collections: "Footer.collectionsHeading",
  categories: "Footer.categoriesHeading",
  products: "OrderDetails.items",
  description: "Metadata.home.description",
} as const

/** A shop's section: with no label for the heading the list goes without one. */
function shopSection(heading: string, items: string[]) {
  if (!items.length) return []
  return [...(heading ? [`## ${heading}`, ""] : []), ...items, ""]
}

/**
 * The file of a host with a shop behind it (t-2026-10-08-13, part A7). It
 * holds the shop's own data and nothing else: its name, the description its
 * home page gives a search engine, the languages it publishes, its catalog.
 * The starter's file below told a crawler that a live shop was a demo whose
 * orders are not fulfilled and whose payments are not taken, and listed 36
 * languages for a shop published in one.
 *
 * Part A7b: every link of a page carries the shop's language in its address.
 * Without it each of them answered a 302 to the same page under `/ru`. And a
 * product is its name and its link: the first words of a description are the
 * owner's own text cut in the middle, with no page around it.
 */
async function shopFile(base: string, siteName: string) {
  const published = shopLocales(locales, await getEnabledLocales(), defaultLocale)
  const own = await getTenantDefaultLocale()
  // The labels are in the shop's default language, or its first one when the
  // default is not among the languages it publishes.
  const locale = published.find((code) => code === own) ?? published[0]

  const t = await getTranslations({ locale })
  // No key, no label: an English word of this file's own is not a fallback.
  const label = (key: string) => (t.has(key) ? t(key) : "")
  const link = (text: string, href: string, note?: string | null) =>
    listItem(text || href, href, note)
  // The address the middleware answers 200 on: the language is in it already.
  const page = (path: string) => absolute(base, `/${locale}${path}`)

  const [collections, categories, catalog, description] = await Promise.all([
    fetchShopCollections().catch(() => [] as Entry[]),
    fetchShopCategories().catch(() => [] as HttpTypes.StoreProductCategory[]),
    fetchProducts().catch(() => ({ products: [] as Entry[], count: 0 })),
    // The home page's own `description`, from the same inputs `(main)/page.tsx`
    // gives it: the line the owner wrote under the hero title while the hero is
    // drawn, else the neutral line of the catalog.
    Promise.all([getEffectiveSettings(), getTenantHome(), isOlavkaShop()])
      .then(([settings, home, olavka]) =>
        homeDescription({
          olavka,
          hero: settings?.hero ?? DEFAULT_HERO,
          savedOrder: home?.content.order?.length ? home.content.order : DEFAULT_BLOCK_ORDER,
          subtitle: localizedHero(home?.content.hero, locale)?.subtitle,
          neutral: label(SHOP_LABELS.description),
        })
      )
      .catch(() => label(SHOP_LABELS.description)),
  ])

  const shown = Math.min(catalog.products.length, PRODUCT_LIMIT)
  const summary = oneLine(description, 300)

  return [
    `# ${siteName}`,
    "",
    ...(summary ? [`> ${summary}`, ""] : []),
    ...shopSection(label(SHOP_LABELS.shop), [
      link(label(SHOP_LABELS.home), page("")),
      link(label(SHOP_LABELS.allProducts), page("/store")),
      link("sitemap.xml", `${base}/sitemap.xml`),
    ]),
    // One language is the shop itself, not a choice to list.
    ...shopSection(
      label(SHOP_LABELS.languages),
      published.length > 1
        ? published.map((code) => link(localeLabels[code], `${base}/${code}`))
        : []
    ),
    ...shopSection(
      label(SHOP_LABELS.collections),
      collections
        .filter((c) => c.handle)
        .map((c) => link(c.title || c.handle!, page(`/collections/${c.handle}`)))
    ),
    ...shopSection(
      label(SHOP_LABELS.categories),
      categories
        .filter((c) => c.handle)
        .map((c) =>
          link(c.name || c.handle, page(`/categories/${c.handle}`), c.description)
        )
    ),
    ...shopSection(label(SHOP_LABELS.products), [
      ...catalog.products
        .filter((p) => p.handle)
        .map((p) => link(p.title || p.handle!, page(`/products/${p.handle}`))),
      // What was cut is stated, in figures: the rest is in the sitemap.
      ...(catalog.count > shown
        ? [link("sitemap.xml", `${base}/sitemap.xml`, `+${catalog.count - shown}`)]
        : []),
    ]),
  ]
}

/** The file of a host with no shop behind it: the starter's own demo. */
async function starterFile(base: string, siteName: string) {
  const [collections, categories, catalog] = await Promise.all([
    fetchCollections().catch(() => [] as Entry[]),
    fetchCategories().catch(() => [] as Entry[]),
    fetchProducts().catch(() => ({ products: [] as Entry[], count: 0 })),
  ])

  return [
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
}

export async function GET() {
  // The base is the origin of THIS request: one process serves every shop by Host
  // (`lib/tenant/origin.ts`), and the file has to name the shop that was asked.
  const [handle, siteName, base] = await Promise.all([
    getTenantHandle(),
    getSiteName(),
    getRequestBaseURL(),
  ])

  const lines = handle
    ? await shopFile(base, siteName)
    : await starterFile(base, siteName)

  return new Response(`${lines.join("\n").trimEnd()}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
