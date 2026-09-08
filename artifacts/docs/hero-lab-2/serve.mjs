#!/usr/bin/env node
/**
 * Hero lab, round two.
 *
 *   node artifacts/docs/hero-lab-2/serve.mjs      # http://localhost:8301
 *
 * Round one varied where the text sat. Ivan rejected all seven, and the diagnosis was that
 * the two things that decide a hero were held constant: what is IN the frame, and what the
 * block DOES. This stand varies exactly those two axes, so every variant here is built out
 * of the store's own catalogue rather than out of one mood photograph and some brand poetry.
 *
 * Nothing on the page is typed by hand. `/data.json` is assembled at request time from
 * apps/backend/src/migration-scripts/data/profiles/<id>/ — profile.json (brand, copy, tiles,
 * promo strip), theme.json (the real palette, both modes) and catalog/products.json (real
 * titles, subtitles, prices, images). If the data changes, reload the page.
 *
 * Binaries are served straight out of the stand worktrees, never copied here: a duplicated
 * image is a second source of truth (rule 4b) and would land in git history (rule 21f).
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..", "..", "..")
const WORKTREES = "/Users/ivanprotsko/upready/worktrees/upready-store"
const PORT = Number(process.env.PORT || 8301)

/** profile id -> the worktree whose backend static directory holds its media. */
const MEDIA = {
  sneakers: "feat/store-profiles",
  electronics: "feat/store/electronics",
  supplements: "feat/store/supplements",
  "womens-fashion": "feat/store/womens-fashion",
  "home-goods": "feat/store/home-goods",
}
const IDS = Object.keys(MEDIA)

const mediaDir = (id) =>
  join(WORKTREES, MEDIA[id] ?? "", "apps/backend/static/store-profiles", id)
const profileDir = (id) => join(REPO, "apps/backend/src/migration-scripts/data/profiles", id)
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

/**
 * Which frames a brand actually owns. Classified by eye from the full contact sheet of every
 * profile's static directory on 2026-09-09 — a file name does not say whether a person is in
 * the shot, so this is a looked-at list, not a grepped one. `person` and `room` are the frames
 * variant L needs; a brand with neither cannot be shown that variant honestly.
 */
const FRAMES = {
  sneakers: {
    person: ["home-hero.webp", "tile-low-tops.webp", "tile-high-tops.webp", "tile-runners.webp", "tile-trail.webp"],
    room: [],
    note: "Пять кадров с человеком: ноги в движении на мокрой улице в сумерках плюс широкий home-hero.",
  },
  "home-goods": {
    person: [],
    room: ["tile-cookware.webp", "tile-kitchen-textiles.webp", "tile-storage-and-light.webp", "tile-tableware.webp"],
    note: "Людей нет, но четыре плитки сняты в настоящей кухне — вещь в среде, а не на вырезке.",
  },
  electronics: { person: [], room: [], note: "22 предметных кадра на сером. Ни человека, ни комнаты." },
  supplements: { person: [], room: [], note: "19 банок с ПУСТОЙ этикеткой на белом. Ни человека, ни комнаты." },
  "womens-fashion": {
    person: ["home-hero.webp"],
    room: [],
    note: "30 вырезок на кремовом плюс единственный кадр с человеком — тот самый home-hero со спины, который Иван отверг.",
  },
}

/** The lab's payload for one profile: real copy, real palette, real products. */
function profilePayload(id) {
  const profile = readJson(join(profileDir(id), "profile.json"))
  const theme = readJson(join(profileDir(id), "theme.json"))
  const raw = readJson(join(profileDir(id), "catalog/products.json"))
  const list = Array.isArray(raw) ? raw : raw.products ?? []
  const collections = (() => {
    const file = join(profileDir(id), "catalog/collections.json")
    if (!existsSync(file)) return []
    const parsed = readJson(file)
    return Array.isArray(parsed) ? parsed : parsed.collections ?? []
  })()

  const products = list.map((product) => {
    const prices = (product.variants ?? []).map((v) => v.price_usd).filter(Number.isFinite)
    return {
      handle: product.handle,
      title: product.title,
      subtitle: product.subtitle,
      category: product.category,
      collections: product.collections ?? [],
      image: (product.images ?? [])[0]?.replace(/^media\//, "") ?? null,
      priceFrom: prices.length ? Math.min(...prices) : null,
      priceTo: prices.length ? Math.max(...prices) : null,
    }
  })

  return {
    id,
    brand: profile.brand,
    hero: profile.home.hero,
    tiles: profile.home.categoryTiles ?? [],
    promo: profile.home.promoStrip?.text ?? null,
    collections: collections.map((c) => ({ handle: c.handle, title: c.title ?? c.name })),
    typography: profile.theme.typography,
    defaultMode: profile.theme.defaultMode,
    modes: theme.modes,
    frames: FRAMES[id],
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
  console.log(`[hero-lab-2] http://localhost:${PORT}`)
  for (const id of IDS) {
    const dir = mediaDir(id)
    const count = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".webp")).length : 0
    const frames = FRAMES[id]
    console.log(
      `  ${id.padEnd(15)} ${String(count).padStart(2)} кадров · ` +
        `человек ${frames.person.length} · среда ${frames.room.length}`
    )
  }
})
