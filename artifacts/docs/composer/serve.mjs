#!/usr/bin/env node
/**
 * Composer — the stand where Ivan assembles a home page out of the corridor variants and keeps
 * the assemblies he likes (t-2026-09-09-01, 2026-09-09).
 *
 *   node artifacts/docs/composer/serve.mjs         # http://localhost:8303
 *
 * One page: brand (five profiles) × mode (light/dark) × width × header H1–H5 × hero (G–M, GA/GB,
 * none) × category tiles × listing P1–P5 × footer F1–F5. A composition can be SAVED under a label;
 * saved versions live in versions.json next to this file (a JSON registry, rule 18b) and are the
 * input of shoot.mjs, which turns each into the 1440×1920 frame the upready.dev showcase cards
 * are cut from. `/view?v=<id>` renders one saved version with no lab chrome — that is what gets shot.
 *
 * Data is assembled at request time from apps/backend/src/migration-scripts/data/profiles/<id>/
 * exactly as blocks-lab/serve.mjs does (profile.json, theme.json, catalog/*.json), plus the
 * "which frames exist" table hero L needs, copied from hero-lab-2/serve.mjs. Media is served out
 * of the stand worktrees, never copied here (rules 4b, 21f). The variant markup itself is not in
 * this file: lib/blocks.js and lib/hero.js are cut from the two labs' index.html and shared.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..", "..", "..")
const WORKTREES = "/Users/ivanprotsko/upready/worktrees/upready-store"
const PORT = Number(process.env.PORT || 8303)
const REGISTRY = join(HERE, "versions.json")
const SHOTS = join(HERE, "shots")

/** profile id -> the worktree whose backend static directory holds its media. */
const MEDIA = {
  sneakers: "feat/store-profiles",
  electronics: "feat/store/electronics",
  supplements: "feat/store/supplements",
  "womens-fashion": "feat/store/womens-fashion",
  "home-goods": "feat/store/home-goods",
}
const IDS = Object.keys(MEDIA)

/** Which frames each brand owns for hero L ("товар на человеке / в среде") — hero-lab-2/serve.mjs. */
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
    frames: FRAMES[id],
    onDisk: existsSync(mediaDir(id)) ? readdirSync(mediaDir(id)).filter((f) => f.endsWith(".webp")) : [],
    products,
  }
}

/* ---------- the registry of saved versions ---------- */
const SCHEMA = "upready.composer-versions/v1"
const emptyRegistry = () => ({ schema: SCHEMA, versions: [] })
function loadRegistry() {
  if (!existsSync(REGISTRY)) return emptyRegistry()
  const parsed = readJson(REGISTRY)
  if (parsed.schema !== SCHEMA) throw new Error(`${REGISTRY}: schema ${parsed.schema}, expected ${SCHEMA}`)
  return parsed
}
function saveRegistry(registry) {
  const tmp = `${REGISTRY}.tmp`
  writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n")
  renameSync(tmp, REGISTRY)
}

/** Local time with its offset, the way the handoff writes dates. */
function stamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0")
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? "+" : "-"
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

const TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" }
const slugOf = (label) =>
  label.toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)

function newId(registry, label, spec) {
  const day = stamp().slice(0, 10).replace(/-/g, "")
  const base = `v-${day}-${slugOf(label) || spec.brand}`
  let id = base
  for (let n = 2; registry.versions.some((v) => v.id === id); n++) id = `${base}-${n}`
  return id
}

/** What is on disk for a version: the frame, the card, and whether they predate the last edit. */
function shotsOf(version) {
  const out = {}
  for (const ext of ["png", "webp"]) {
    const file = join(SHOTS, `${version.id}.${ext}`)
    if (!existsSync(file)) continue
    const at = statSync(file).mtime
    out[ext] = { file, at: stamp(at), stale: at.getTime() < Date.parse(version.updatedAt) }
  }
  return out
}
const withShots = (version) => ({ ...version, shots: shotsOf(version) })

/* ---------- the spec is validated here too, so a hand-written curl cannot save nonsense ---------- */
import { validateSpec } from "./lib/page.js"
let DATA_CACHE = null
const data = () => (DATA_CACHE ??= IDS.map(profilePayload))

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
      if (raw.length > 1e6) reject(new Error("body over 1 MB"))
    })
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) }
    })
  })

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" })
  res.end(JSON.stringify(body))
}
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8" }

async function api(req, res, url) {
  const one = /^\/api\/versions\/([a-z0-9-]+)$/.exec(url.pathname)
  const registry = loadRegistry()

  if (url.pathname === "/api/versions" && req.method === "GET") return json(res, 200, { schema: registry.schema, versions: registry.versions.map(withShots) })

  if (url.pathname === "/api/versions" && req.method === "POST") {
    const body = await readBody(req)
    const label = String(body.label ?? "").trim()
    if (!label) return json(res, 400, { error: "label is required" })
    const problem = body.spec ? validateSpec(body.spec, data()) : "spec is required"
    if (problem) return json(res, 400, { error: problem })
    const now = stamp()
    const version = { id: newId(registry, label, body.spec), label, note: String(body.note ?? "").trim(), createdAt: now, updatedAt: now, spec: body.spec }
    registry.versions.push(version)
    saveRegistry(registry)
    return json(res, 201, withShots(version))
  }

  if (one && (req.method === "PUT" || req.method === "PATCH")) {
    const version = registry.versions.find((v) => v.id === one[1])
    if (!version) return json(res, 404, { error: `no version ${one[1]}` })
    const body = await readBody(req)
    if (body.label !== undefined) {
      const label = String(body.label).trim()
      if (!label) return json(res, 400, { error: "label cannot be empty" })
      version.label = label
    }
    if (body.note !== undefined) version.note = String(body.note).trim()
    if (body.spec !== undefined) {
      const problem = validateSpec(body.spec, data())
      if (problem) return json(res, 400, { error: problem })
      version.spec = body.spec
    }
    version.updatedAt = stamp()
    saveRegistry(registry)
    return json(res, 200, withShots(version))
  }

  if (one && req.method === "DELETE") {
    const index = registry.versions.findIndex((v) => v.id === one[1])
    if (index < 0) return json(res, 404, { error: `no version ${one[1]}` })
    const [gone] = registry.versions.splice(index, 1)
    saveRegistry(registry)
    // The frames under shots/ are left where they are: regenerable, but not this server's to erase.
    return json(res, 200, { deleted: gone.id, shotsKept: Object.keys(shotsOf(gone)) })
  }

  return json(res, 404, { error: "no such api route" })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const media = /^\/media\/([a-z-]+)\/([a-z0-9-]+\.webp)$/.exec(url.pathname)
  const lib = /^\/lib\/([a-z-]+\.(?:js|css))$/.exec(url.pathname)

  try {
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
    if (lib) {
      res.writeHead(200, { "content-type": TYPES[extname(lib[1])], "cache-control": "no-cache" })
      return res.end(readFileSync(join(HERE, "lib", lib[1])))
    }
    if (url.pathname === "/data.json") {
      DATA_CACHE = null // profiles are edited on disk while the stand is up; never serve a stale palette
      return json(res, 200, data())
    }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url)
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-cache" })
      return res.end(readFileSync(join(HERE, "index.html")))
    }
    if (url.pathname === "/view") {
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-cache" })
      return res.end(readFileSync(join(HERE, "view.html")))
    }
    res.writeHead(404, { "content-type": "text/plain" })
    res.end("not found")
  } catch (error) {
    console.error(`[composer] ${req.method} ${url.pathname}: ${error.stack ?? error}`)
    if (!res.headersSent) json(res, 500, { error: String(error.message ?? error) })
    else res.end()
  }
})

server.listen(PORT, () => {
  console.log(`[composer] http://localhost:${PORT}   registry: ${REGISTRY} (${loadRegistry().versions.length} versions)`)
  for (const id of IDS) {
    const p = profilePayload(id)
    console.log(
      `  ${id.padEnd(15)} ${String(p.products.length).padStart(2)} товаров · ${p.tiles.length} плиток · ` +
        `${p.categories.length} категорий · ${p.collections.length} коллекций · ${p.onDisk.length} кадров`
    )
  }
})
