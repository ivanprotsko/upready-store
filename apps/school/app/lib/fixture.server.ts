import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"

/**
 * The fixture stand: with `SCHOOL_FIXTURE=1` the school answers from JSON
 * files instead of the shop's Store API, so the pages can be opened and shot
 * without a backend. `SCHOOL_FIXTURE_DIR` is a folder of answers by API path,
 * each `{ "status": 200, "body": { … } }`:
 *
 *   store/tenant/courses/mine.json
 *   store/tenant/courses/mine/<slug>.json
 *   store/tenant/courses/<course>/lessons/<lesson>.json
 *
 * and a `media/` folder the answers point at as `/fixture-media/…`. Nothing
 * here runs unless the variable is set; on a host it never is.
 */

export const isFixtureMode = (env: NodeJS.ProcessEnv = process.env) => env.SCHOOL_FIXTURE === "1"

const fixtureDir = (env: NodeJS.ProcessEnv = process.env) => {
  const dir = env.SCHOOL_FIXTURE_DIR?.trim()

  if (!dir) {
    throw new Error("The school's fixture mode needs SCHOOL_FIXTURE_DIR")
  }

  return path.resolve(dir)
}

/** `root/rel`, or null when `rel` would step outside `root`. */
function inside(root: string, rel: string): string | null {
  const file = path.resolve(root, rel)

  return file === root || file.startsWith(`${root}${path.sep}`) ? file : null
}

/**
 * The fixture's answer to one API call. A POST (`…/viewed`) answers the
 * course's progress as it is, so «Отметить пройденным» works without
 * changing the files.
 */
export function fixtureAnswer(apiPath: string, method: "GET" | "POST"): Response {
  const root = fixtureDir()
  const clean = decodeURIComponent(apiPath.split("?")[0] ?? "").replace(/^\/+/, "")

  if (method === "POST") {
    return Response.json({ progress: { completed: 0, total: 0, percent: 0 } })
  }

  const file = inside(root, `${clean}.json`)

  if (!file || !existsSync(file)) {
    return new Response("", { status: 404 })
  }

  const { status, body } = JSON.parse(readFileSync(file, "utf8")) as { status: number; body: unknown }

  return Response.json(body, { status })
}

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
}

/**
 * One file of the fixture's `media/` folder, with byte ranges, because a
 * `<video>` seeks by asking for a range and the resume of the player needs it.
 */
export function fixtureMedia(rel: string, request: Request): Response {
  if (!isFixtureMode()) {
    return new Response("", { status: 404 })
  }

  const root = path.join(fixtureDir(), "media")
  const file = inside(root, decodeURIComponent(rel))

  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    return new Response("", { status: 404 })
  }

  const size = statSync(file).size
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream"
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "")

  if (!range) {
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { "content-type": type, "content-length": String(size), "accept-ranges": "bytes" },
    })
  }

  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1

  if (start > end || start >= size) {
    return new Response("", { status: 416, headers: { "content-range": `bytes */${size}` } })
  }

  return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
    status: 206,
    headers: {
      "content-type": type,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
    },
  })
}
