#!/usr/bin/env node
// Builds a faithful LOCAL copy of a live tenant shop for visual work and probes.
//
// It reads the live shop over its PUBLIC store API only (the publishable key is the one
// `/storefront/by-host` hands to every visitor), downloads the product photos once into the
// backend's gitignored `static/` directory, and writes into a LOCAL backend through the tenant
// API, so the local shop is exactly what a shop edited from the panel would be. Nothing is ever
// written to the live side, and no SQL is run anywhere.
//
//   node scripts/local-shop-from-live.mjs \
//     --live-host cherkashino.shipshift.dev --live-backend https://shipshift.dev \
//     --backend http://localhost:9121 \
//     --owner-email owner@stand.test --owner-password supersecret \
//     --cache artifacts/docs/<task>/live-dataset
//
// Plain ESM with no dependency outside Node 20. Idempotent: a second run changes nothing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"

const HELP = `Usage: node scripts/local-shop-from-live.mjs [options]

  --live-host <host>        public host of the live shop (required)
  --live-backend <origin>   origin of the live store API (required)
  --backend <origin>        LOCAL backend to write into (default http://localhost:9000)
  --owner-email <email>     owner of the LOCAL tenant (required)
  --owner-password <pass>   their password (required)
  --locale <code>           catalog language to read (default ru)
  --country <iso2>          country whose region prices are read (default ru)
  --static-dir <path>       backend static dir (default apps/backend/static)
  --static-prefix <name>    subdirectory for the photos (default live-shop)
  --cache <dir>             keep the JSON read from live here and reuse it on the next run
  --requisites <file>       JSON body for PUT /tenants/requisites on the local stand
  --dry-run                 read and plan, write nothing
`

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith("--")) {
      const next = all[i + 1]
      acc.push([arg.slice(2), next && !next.startsWith("--") ? next : true])
    }
    return acc
  }, [])
)

if (args.help) {
  console.log(HELP)
  process.exit(0)
}

for (const required of ["live-host", "live-backend", "owner-email", "owner-password"]) {
  if (typeof args[required] !== "string") {
    console.error(`missing --${required}\n\n${HELP}`)
    process.exit(2)
  }
}

const LIVE = args["live-backend"].replace(/\/$/, "")
const LOCAL = (args.backend ?? "http://localhost:9000").replace(/\/$/, "")
const LOCALE = args.locale ?? "ru"
const COUNTRY = args.country ?? "ru"
const STATIC_DIR = resolve(args["static-dir"] ?? "apps/backend/static")
const PREFIX = args["static-prefix"] ?? "live-shop"
const CACHE = typeof args.cache === "string" ? resolve(args.cache) : null
const DRY = Boolean(args["dry-run"])

if (/shipshift\.dev|upready\.dev/.test(LOCAL)) {
  console.error("--backend must be a local stand, never the platform")
  process.exit(2)
}

const log = (line) => console.log(line)

async function json(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status} ${text.slice(0, 300)}`)
  }
  return data
}

/** A read of the live side, cached on disk when --cache is given. */
async function live(name, path, headers) {
  const file = CACHE ? join(CACHE, `${name}.json`) : null
  if (file && existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8"))
  }
  const data = await json(`${LIVE}${path}`, { headers })
  if (file) {
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 1))
  }
  return data
}

// ---------------------------------------------------------------- read live

const byHost = await live(
  "by-host",
  `/storefront/by-host?host=${encodeURIComponent(args["live-host"])}`
)
const liveHeaders = {
  "x-publishable-api-key": byHost.publishable_key,
  "x-medusa-locale": LOCALE,
}

const { regions } = await live(
  "regions",
  "/store/regions?limit=300&fields=id,name,currency_code,*countries",
  liveHeaders
)
const liveRegion = regions.find((r) => r.countries?.some((c) => c.iso_2 === COUNTRY))
if (!liveRegion) {
  throw new Error(`the live shop has no region for country ${COUNTRY}`)
}

const { products: liveProducts } = await live(
  "products",
  `/store/products?limit=200&region_id=${liveRegion.id}&fields=*variants.calculated_price,*variants.options,*options,*options.values,*images,*categories,+metadata,+subtitle`,
  liveHeaders
)
const { facets: liveFacets } = await live(
  "t_product-attributes_facets",
  "/store/tenant/product-attributes/facets",
  liveHeaders
)

let liveAttributes = {}
const attributesFile = CACHE ? join(CACHE, "product-attributes.json") : null
if (attributesFile && existsSync(attributesFile)) {
  liveAttributes = JSON.parse(readFileSync(attributesFile, "utf8"))
} else {
  for (const product of liveProducts) {
    const { product_attributes } = await json(
      `${LIVE}/store/tenant/product-attributes?product_id=${product.id}`,
      { headers: liveHeaders }
    )
    liveAttributes[product.handle] = product_attributes ?? []
  }
  if (attributesFile) {
    writeFileSync(attributesFile, JSON.stringify(liveAttributes, null, 1))
  }
}

log(
  `live: ${liveProducts.length} products, ${liveProducts.filter((p) => !p.images?.length).length} without photos, ${liveFacets.length} facets`
)

// ---------------------------------------------------------------- photos

const photoDir = join(STATIC_DIR, PREFIX)
mkdirSync(photoDir, { recursive: true })
const localUrl = (url) => `${LOCAL}/static/${PREFIX}/${basename(new URL(url).pathname)}`

const photoUrls = new Set()
for (const product of liveProducts) {
  if (product.thumbnail) photoUrls.add(product.thumbnail)
  for (const image of product.images ?? []) photoUrls.add(image.url)
}
const heroImage = byHost.home?.content?.hero?.image_url
if (heroImage) photoUrls.add(heroImage)

let downloaded = 0
for (const url of photoUrls) {
  const target = join(photoDir, basename(new URL(url).pathname))
  if (existsSync(target)) continue
  if (DRY) continue
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  downloaded += 1
}
log(`photos: ${photoUrls.size} referenced, ${downloaded} downloaded into ${photoDir}`)

// ---------------------------------------------------------------- local side

const { token } = await json(`${LOCAL}/auth/tenant/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: args["owner-email"], password: args["owner-password"] }),
})
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }
const local = (path, method = "GET", body) =>
  json(`${LOCAL}${path}`, { method, headers: auth, body: body ? JSON.stringify(body) : undefined })
const write = async (path, method, body) => (DRY ? null : local(path, method, body))

const me = await local("/tenants/me")
log(`local tenant: ${me.tenant_admin?.tenant?.handle} (${me.tenant_admin?.tenant?.id})`)

const { products: localProducts } = await local(
  "/tenants/products?limit=500&fields=id,handle,status"
)
const { product_categories: localCategories } = await local(
  "/tenants/product-categories?limit=500&fields=id,handle"
)
const categoryIdByHandle = new Map(localCategories.map((c) => [c.handle, c.id]))
const localByHandle = new Map(localProducts.map((p) => [p.handle, p]))
const liveHandles = new Set(liveProducts.map((p) => p.handle))

const tally = { updated: 0, created: 0, drafted: 0, attributes: 0, values: 0 }

const productBody = (product) => ({
  title: product.title,
  subtitle: product.subtitle ?? undefined,
  description: product.description ?? undefined,
  status: "published",
  thumbnail: product.thumbnail ? localUrl(product.thumbnail) : undefined,
  images: (product.images ?? []).map((image) => ({ url: localUrl(image.url) })),
  metadata: product.metadata ?? undefined,
})

for (const product of liveProducts) {
  const existing = localByHandle.get(product.handle)
  if (existing) {
    await write(`/tenants/products/${existing.id}`, "POST", productBody(product))
    tally.updated += 1
    continue
  }

  const options = (product.options ?? []).map((option) => ({
    title: option.title,
    values: (option.values ?? []).map((v) => v.value),
  }))
  const created = await write("/tenants/products", "POST", {
    ...productBody(product),
    handle: product.handle,
    options,
    categories: (product.categories ?? [])
      .map((c) => categoryIdByHandle.get(c.handle))
      .filter(Boolean)
      .map((id) => ({ id })),
    variants: (product.variants ?? []).map((variant) => ({
      title: variant.title,
      manage_inventory: false,
      prices: [
        {
          currency_code: liveRegion.currency_code,
          amount: variant.calculated_price?.calculated_amount ?? 0,
        },
      ],
      options: Object.fromEntries(
        (variant.options ?? []).map((v) => [
          product.options?.find((o) => o.id === v.option_id)?.title,
          v.value,
        ])
      ),
    })),
  })
  if (created?.product) localByHandle.set(product.handle, created.product)
  tally.created += 1
}

// What the owner took off the live shop must not stay on the local one.
for (const product of localProducts) {
  if (!liveHandles.has(product.handle) && product.status === "published") {
    await write(`/tenants/products/${product.id}`, "POST", { status: "draft" })
    tally.drafted += 1
  }
}

// ---------------------------------------------------------------- characteristics

const facetByKey = new Map(liveFacets.map((f) => [f.key, f]))
const definitions = new Map()
for (const rows of Object.values(liveAttributes)) {
  for (const row of rows) {
    if (!definitions.has(row.key)) definitions.set(row.key, row)
  }
}

const { product_attributes: localDefinitions = [] } = await local(
  "/tenants/product-attributes?limit=500"
)
const localKeys = new Set(localDefinitions.map((d) => d.key))

for (const [key, row] of definitions) {
  if (localKeys.has(key)) continue
  const facet = facetByKey.get(key)
  await write("/tenants/product-attributes", "POST", {
    key,
    name: row.name,
    type: row.type,
    unit: row.unit ?? null,
    position: row.position ?? 0,
    show_on_product: true,
    use_as_filter: Boolean(facet),
    ...(row.type === "select"
      ? {
          options: (facet?.values ?? []).map((v) => ({ value: v.value, label: v.label })),
        }
      : {}),
  })
  tally.attributes += 1
}

for (const [handle, rows] of Object.entries(liveAttributes)) {
  const target = localByHandle.get(handle)
  if (!target || !rows.length) continue
  await write(`/tenants/products/${target.id}/attributes`, "POST", {
    values: rows.map((row) => ({ key: row.key, value: row.value })),
  })
  tally.values += rows.length
}

// ---------------------------------------------------------------- home and requisites

if (byHost.home?.settings && byHost.home?.content) {
  const content = structuredClone(byHost.home.content)
  if (content.hero?.image_url) content.hero.image_url = localUrl(content.hero.image_url)
  await write("/tenants/home", "PUT", {
    theme: byHost.home.theme,
    settings: byHost.home.settings,
    content,
  })
  log("home: composition and hero copied")
}

if (typeof args.requisites === "string") {
  await write("/tenants/requisites", "PUT", JSON.parse(readFileSync(args.requisites, "utf8")))
  log(`requisites: written from ${args.requisites}`)
}

log(`${DRY ? "DRY RUN, nothing written. Plan" : "done"}: ${JSON.stringify(tally)}`)
