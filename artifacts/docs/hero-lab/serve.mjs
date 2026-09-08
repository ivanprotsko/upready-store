#!/usr/bin/env node
/**
 * The hero lab stand. One page, no theme, no storefront:
 *
 *   node artifacts/docs/hero-lab/serve.mjs        # http://localhost:8300
 *
 * The five hero photographs are served straight out of the stand worktrees, not copied
 * here — a binary duplicated into artifacts/ is a second source of truth (rule 4b) and
 * would land in git history (rule 21f). A photo whose worktree is gone answers 404 and
 * the lab draws that variant on a flat ground, which is itself worth seeing.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKTREES = "/Users/ivanprotsko/upready/worktrees/upready-store"
const PORT = Number(process.env.PORT || 8300)

/** profile id -> the worktree whose backend static directory holds its media. */
const MEDIA = {
  sneakers: "feat/store-profiles",
  electronics: "feat/store/electronics",
  supplements: "feat/store/supplements",
  "womens-fashion": "feat/store/womens-fashion",
  "home-goods": "feat/store/home-goods",
}

const heroPath = (id) =>
  join(WORKTREES, MEDIA[id] ?? "", `apps/backend/static/store-profiles/${id}/home-hero.webp`)

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const media = /^\/media\/([a-z-]+)\.webp$/.exec(url.pathname)

  if (media) {
    const file = heroPath(media[1])
    if (!MEDIA[media[1]] || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" })
      return res.end(`no hero photo for "${media[1]}"`)
    }
    res.writeHead(200, { "content-type": "image/webp", "cache-control": "no-cache" })
    return res.end(readFileSync(file))
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" })
    return res.end(readFileSync(join(HERE, "index.html")))
  }

  res.writeHead(404, { "content-type": "text/plain" })
  res.end("not found")
})

server.listen(PORT, () => {
  console.log(`[hero-lab] http://localhost:${PORT}`)
  for (const id of Object.keys(MEDIA)) {
    console.log(`  photo ${id.padEnd(15)} ${existsSync(heroPath(id)) ? "ok" : "MISSING"}`)
  }
})
