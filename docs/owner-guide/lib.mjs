// Shared pieces of the owner guide tools: where things are, how a scene's sources and texts are hashed.
// A scene's frame is stale when the code that draws it (its `sources`) or the Russian strings it shows
// (its `i18n` key prefixes) changed after the frame was shot. Both are hashed the same way in shoot.mjs,
// which records them, and in check.mjs, which compares them with the working tree.
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const GUIDE_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO = join(GUIDE_DIR, "..", "..")
export const LOCK = join(GUIDE_DIR, "shots.lock.json")
export const PAGES_DIR = join(GUIDE_DIR, "guide")
/** The frames, in git next to the pages that show them (README.md says why). */
export const SHOTS_DIR = join(PAGES_DIR, "shots")
export const RU = "apps/tenant-panel/src/i18n/translations/ru.json"

/**
 * Every frame with the sidebar shows the menu, so the menu's data and labels belong to each of them; main-layout
 * draws the sidebar around it (the shop name on top, «Справка» and the user at the bottom).
 */
export const MENU = {
  sources: ["apps/tenant-panel/src/components/layout/owner-nav", "apps/tenant-panel/src/components/layout/main-layout"],
  i18n: ["app.nav."],
}

const SKIP = new Set(["node_modules", "__tests__", "dist", ".turbo"])

const walk = (abs) => {
  const st = statSync(abs)
  if (st.isFile()) return [abs]
  return readdirSync(abs)
    .filter((name) => !SKIP.has(name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name))
    .flatMap((name) => walk(join(abs, name)))
}

/** The files a scene's frame depends on: its own sources plus the menu, sorted, repo-relative. */
export const sceneSources = (scene) => [...(scene.menu === false ? [] : MENU.sources), ...scene.sources]

export const sceneI18n = (scene) => [...(scene.menu === false ? [] : MENU.i18n), ...(scene.i18n ?? [])]

/** sha256 over the files under `paths`; a missing path is hashed as missing, so a removed folder reads as a change. */
export const hashSources = (paths, root = REPO) => {
  const h = createHash("sha256")
  for (const p of [...paths].sort()) {
    const abs = join(root, p)
    if (!existsSync(abs)) {
      h.update(`missing:${p}\0`)
      continue
    }
    for (const file of walk(abs).sort()) {
      h.update(relative(root, file).split(sep).join("/") + "\0")
      h.update(readFileSync(file))
      h.update("\0")
    }
  }
  return h.digest("hex").slice(0, 16)
}

/** `{ "a.b.c": "text" }` from the nested catalog. */
export const flatten = (obj, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object") flatten(v, key, out)
    else out[key] = String(v)
  }
  return out
}

export const pickStrings = (flat, prefixes) =>
  Object.fromEntries(Object.entries(flat).filter(([k]) => prefixes.some((p) => k.startsWith(p))).sort(([a], [b]) => a.localeCompare(b)))

export const hashStrings = (flat, prefixes) => {
  const h = createHash("sha256")
  for (const [k, v] of Object.entries(pickStrings(flat, prefixes))) h.update(`${k}=${v}\n`)
  return h.digest("hex").slice(0, 16)
}

export const readCatalog = (root = REPO) => flatten(JSON.parse(readFileSync(join(root, RU), "utf8")))

export const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")

/** The guide pages, in reading order: 00-oglavlenie.md first. */
export const guidePages = () => readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md")).sort()

/** `![…](shots/<id>.webp)` references of every guide page: `{ page, id }[]`. */
export const imageRefs = () =>
  guidePages().flatMap((page) =>
    [...readFileSync(join(PAGES_DIR, page), "utf8").matchAll(/!\[[^\]]*\]\(shots\/([a-z0-9-]+)\.webp\)/g)].map((m) => ({ page, id: m[1] }))
  )

// The frames are in git and the guide is served on the panel's host, so a frame must never show a real person:
// not the shop's people (the stand's logins are «Владелица Пример», «Менеджер Анна» and so on) and not their work
// mail. The surnames are kept as sha256 of their lowercased stem, so the names themselves are not in the repository;
// a word is caught when its first `len` letters hash to `sha`. The shop's name is not a person and stays allowed.
export const NAME_STEMS = [
  { len: 8, sha: "060f84421e153dd4" },
  { len: 7, sha: "43faf92cccccc9cc" },
  { len: 7, sha: "d6e9fe9a32895b5e" },
  { len: 10, sha: "de33cd39c79ac838" },
  { len: 7, sha: "2a6b4b735d98204e" },
  { len: 7, sha: "b4c18bfd18d57ae3" },
]
const SHOP_NAME = new Set(["черкашино", "cherkashino"])
const WORK_MAIL = /@cherkashino\.(ru|com)\b/i

/** What in `text` a frame must not show: `[]` when it is clean, otherwise a line per finding (never the word itself). */
export const forbiddenIn = (text, stems = NAME_STEMS) => {
  const found = new Set()
  if (WORK_MAIL.test(text)) found.add("рабочая почта магазина")
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (SHOP_NAME.has(word)) continue
    for (const { len, sha } of stems) {
      if (word.length >= len && createHash("sha256").update(word.slice(0, len)).digest("hex").slice(0, 16) === sha) found.add("фамилия человека магазина")
    }
  }
  return [...found]
}

/** `--name value` and `--flag` from argv; anything unknown is refused by the caller. */
export const parseArgs = (argv, known) => {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) throw new Error(`лишний аргумент: ${a}`)
    const name = a.slice(2)
    if (!(name in known)) throw new Error(`неизвестный флаг: ${a}; есть: ${Object.keys(known).map((k) => "--" + k).join(", ")}`)
    if (known[name] === "flag") out[name] = true
    else {
      const v = argv[++i]
      if (v === undefined || v.startsWith("--")) throw new Error(`флаг ${a} ждёт значение`)
      out[name] = v
    }
  }
  return out
}
