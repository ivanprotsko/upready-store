#!/usr/bin/env node
/**
 * Blocks lab — the "corridor of variants" applied to the home page blocks other than the hero
 * (t-2026-09-08-01, 2026-09-09). Concept: upready-studio docs/architecture/block-generation-engine.md
 * — a block is an invariant core (function + required roles + relations) surrounded by a
 * bounded corridor of axes, cut by a validity filter.
 *
 *   node artifacts/docs/blocks-lab/serve.mjs      # http://localhost:8302
 *
 * Four families on one page: product listing, header, footer, and the hero as a GALLERY (a peek
 * carousel and an accordion of strips). Every variant is dressed in the brand's own theme and
 * filled with the brand's own catalogue — nothing on the page is typed by hand. `/data.json` is
 * assembled at request time from apps/backend/src/migration-scripts/data/profiles/<id>/:
 * profile.json (brand, legal name, tiles, promo strip), theme.json (both modes),
 * catalog/products.json, catalog/categories.json, catalog/collections.json.
 *
 * Media is served straight out of the stand worktrees, never copied here (rules 4b, 21f).
 * Mirrors hero-lab-2/serve.mjs on purpose: the two labs stay independent files, so a change to
 * one cannot silently reshape the other's screenshots.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..", "..", "..")
const WORKTREES = "/Users/ivanprotsko/upready/worktrees/upready-store"
const PORT = Number(process.env.PORT || 8302)

/** profile id -> the worktree whose backend static directory holds its media. */
const MEDIA = {
  sneakers: "feat/store-profiles",
  electronics: "feat/store/electronics",
  supplements: "feat/store/supplements",
  "womens-fashion": "feat/store/womens-fashion",
  "home-goods": "feat/store/home-goods",
}
const IDS = Object.keys(MEDIA)

const mediaDir = (id) => join(WORKTREES, MEDIA[id] ?? "", "apps/backend/static/store-profiles", id)
const profileDir = (id) => join(REPO, "apps/backend/src/migration-scripts/data/profiles", id)
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const readList = (path, key) => {
  if (!existsSync(path)) return []
  const parsed = readJson(path)
  return Array.isArray(parsed) ? parsed : parsed[key] ?? []
}

/** The lab's payload for one profile: real copy, real palette, real products, real categories. */
function profilePayload(id) {
  const profile = readJson(join(profileDir(id), "profile.json"))
  const theme = readJson(join(profileDir(id), "theme.json"))
  const list = readList(join(profileDir(id), "catalog/products.json"), "products")
  const collections = readList(join(profileDir(id), "catalog/collections.json"), "collections")
  const categories = readList(join(profileDir(id), "catalog/categories.json"), "categories")

  const products = list.map((product) => {
    const prices = (product.variants ?? []).map((v) => v.price_usd).filter(Number.isFinite)
    const colourOption = (product.options ?? []).find((o) => /colou?r/i.test(o.title ?? o.name ?? ""))
    return {
      handle: product.handle,
      title: product.title,
      subtitle: product.subtitle ?? null,
      category: product.category,
      collections: product.collections ?? [],
      images: (product.images ?? []).map((i) => i.replace(/^media\//, "")),
      image: (product.images ?? [])[0]?.replace(/^media\//, "") ?? null,
      priceFrom: prices.length ? Math.min(...prices) : null,
      priceTo: prices.length ? Math.max(...prices) : null,
      variants: (product.variants ?? []).length,
      colours: colourOption ? (colourOption.values ?? []).length : 0,
    }
  })

  const flatCategories = []
  for (const c of categories) {
    flatCategories.push({ handle: c.handle, name: c.name, parent: null })
    for (const child of c.children ?? []) flatCategories.push({ handle: child.handle, name: child.name, parent: c.handle })
  }

  return {
    id,
    brand: profile.brand,
    currency: profile.currency ?? "USD",
    hero: profile.home.hero,
    tiles: (profile.home.categoryTiles ?? []).map((t) => ({ ...t, image: t.image.replace(/^media\//, "") })),
    promo: profile.home.promoStrip?.text ?? null,
    aspect: profile.layout?.imageTreatment?.aspect ?? "1:1",
    collections: collections.map((c) => ({ handle: c.handle, title: c.title ?? c.name })),
    categories: flatCategories,
    typography: profile.theme.typography,
    defaultMode: profile.theme.defaultMode,
    modes: theme.modes,
    onDisk: existsSync(mediaDir(id)) ? readdirSync(mediaDir(id)).filter((f) => f.endsWith(".webp")) : [],
    products,
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const media = /^\/media\/([a-z-]+)\/([a-z0-9-]+\.webp)$/.exec(url.pathname)

  if (media) {
    const [, id, file] = media
    const path = join(mediaDir(id), file)
    if (!MEDIA[id] || !existsSync(path)) {
      res.writeHead(404, { "content-type": "text/plain" })
      return res.end(`no ${file} for "${id}"`)
    }
    res.writeHead(200, { "content-type": "image/webp", "cache-control": "no-cache" })
    return res.end(readFileSync(path))
  }

  if (url.pathname === "/data.json") {
    let payload
    try {
      payload = IDS.map(profilePayload)
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" })
      return res.end(JSON.stringify({ error: String(error) }))
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" })
    return res.end(JSON.stringify(payload))
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" })
    return res.end(readFileSync(join(HERE, "index.html")))
  }

  res.writeHead(404, { "content-type": "text/plain" })
  res.end("not found")
})

server.listen(PORT, () => {
  console.log(`[blocks-lab] http://localhost:${PORT}`)
  for (const id of IDS) {
    const p = profilePayload(id)
    console.log(
      `  ${id.padEnd(15)} ${String(p.products.length).padStart(2)} товаров · ${p.tiles.length} плиток · ` +
        `${p.categories.length} категорий · ${p.collections.length} коллекций · ${p.onDisk.length} кадров`
    )
  }
})
