#!/usr/bin/env node
/**
 * Bakes the store profile into the storefront bundle.
 *
 * Reads <profiles>/<NEXT_PUBLIC_STORE_PROFILE>/profile.json (schema
 * upready.store-profile/v0, specs/store-profiles/store-profile.schema.json) plus the
 * profile's i18n/<locale>.json overrides, narrows them to the fields the storefront
 * actually renders, and writes src/lib/profile/profile.generated.json. Then it hands
 * over to the theme build, which turns theme.json into CSS variables.
 *
 * A missing profile directory is NOT an error: it yields the `default` profile, which
 * carries no hero, no tiles, no promo text and no image treatment, so the storefront
 * renders exactly what it renders today.
 *
 * Env:
 *   NEXT_PUBLIC_STORE_PROFILE  profile id, default "default"
 *   STORE_PROFILES_DIR         where the profile directories live; default
 *                              ../backend/src/migration-scripts/data/profiles,
 *                              resolved against the storefront root. Tests point it
 *                              at their own fixtures.
 *   STORE_MEDIA_BASE_URL       prefix for the profile's media refs, exported or written
 *                              into .env.local / .env. Unset means the directory
 *                              store-profile-up.mjs copies the media into on this
 *                              storefront's own backend:
 *                              <NEXT_PUBLIC_MEDUSA_BACKEND_URL>/static/store-profiles/<id>.
 *   NEXT_PUBLIC_SITE_NAME      the wordmark on screen (src/lib/util/env.ts). Checked, with
 *                              brand.name and brand.wordmark.text, against the name section
 *                              «1. Brand» of the profile's design/style-board.md settled on.
 *                              A mismatch fails the build.
 *   STORE_SITE_NAME_GATE=off   skip that check. For a build whose name is meant to differ
 *                              from its fallback profile (the multi-tenant image).
 *   SKIP_THEME_BUILD=1         write the profile only, do not call the theme build.
 *   STORE_PROFILE_HERO=off     drop home.hero from the generated profile. The profile.json
 *                              keeps its authored hero; only the bundle loses it, so the
 *                              home page renders exactly what the `default` profile renders
 *                              — no band, no placeholder. Any other value (or unset) means
 *                              the hero is built as authored.
 *
 * Run: node scripts/build-profile.mjs   (wired as predev/prebuild)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"

const STOREFRONT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUTPUT_FILE = "src/lib/profile/profile.generated.json"
const DEFAULT_PROFILES_DIR = "../backend/src/migration-scripts/data/profiles"
// The same fallback src/lib/config.ts gives the SDK when NEXT_PUBLIC_MEDUSA_BACKEND_URL is unset.
const DEFAULT_BACKEND_URL = "http://localhost:9000"
// The same fallback src/lib/util/env.ts renders when neither the variable nor a brand names the shop.
const DEFAULT_SITE_NAME = "Gorgo Medusa Store"

/**
 * The `default` profile: every profile-driven section switched off. This is the
 * contract for "no backend profile directory" — today's storefront, unchanged.
 */
export const DEFAULT_PROFILE = {
  schema: "upready.storefront-profile/v0",
  id: "default",
  source: "default",
  brand: null,
  theme: null,
  home: { hero: null, categoryTiles: [], promoStrip: null },
  layout: { imageTreatment: null },
  i18n: {},
}

export function resolveProfilesDir(env = process.env, root = STOREFRONT_ROOT) {
  const configured = env.STORE_PROFILES_DIR || DEFAULT_PROFILES_DIR
  return isAbsolute(configured) ? configured : resolve(root, configured)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/**
 * Joins a media ref ("media/hero.webp") onto the configured base. With no base the ref
 * becomes an absolute path on the storefront's own origin, which keeps next/image happy
 * (a bare relative src throws) without inventing a host.
 *
 * STORE_MEDIA_BASE_URL names the directory the profile's media is SERVED from, and the
 * files land there flat: store-profile-up.mjs copies media/*.webp into
 * static/store-profiles/<id>/, and the backend seed drops the "media/" segment when it
 * prefixes (its own unit test says so by name). The hero and the tiles have to resolve
 * the same way as the product images or half the home page 404s, so the segment is
 * dropped here too — it names a directory in the profile, not one on the host.
 */
export function mediaUrl(ref, baseUrl) {
  if (!ref) return null
  if (/^https?:\/\//.test(ref)) return ref
  if (!baseUrl) return `/${ref.replace(/^\/+/, "")}`
  const file = ref.replace(/^\/+/, "").replace(/^media\//, "")
  return `${baseUrl.replace(/\/+$/, "")}/${file}`
}

/**
 * Where a profile's media is served from. STORE_MEDIA_BASE_URL wins, whether it was
 * exported or only written into .env.local / .env (loadDotEnv has folded those in by
 * now). Unset, it is the directory store-profile-up.mjs copies the media into on the
 * backend this storefront talks to, with the same localhost:9000 default the SDK uses.
 *
 * Unset used to mean "the storefront's own origin", where nothing serves the files. The
 * 08.09 electronics stand kept STORE_MEDIA_BASE_URL in the backend's .env only, and its
 * hero and all five category tiles rendered as 404 blanks.
 */
export function resolveMediaBaseUrl(env, profileId) {
  if (env.STORE_MEDIA_BASE_URL) {
    return { url: env.STORE_MEDIA_BASE_URL, from: "STORE_MEDIA_BASE_URL" }
  }
  if (!profileId || profileId === "default") {
    return { url: undefined, from: null }
  }
  const backend = (env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "")
  return {
    url: `${backend}/static/store-profiles/${profileId}`,
    from: env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
      ? "NEXT_PUBLIC_MEDUSA_BACKEND_URL"
      : `the default backend ${DEFAULT_BACKEND_URL}`,
  }
}

const normaliseName = (value) =>
  String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

/**
 * The shop name the profile's style board settled on, read from its section «1. Brand».
 * The boards are prose written by different hands, so this reads three shapes. A
 * `brand.name` table row (sneakers), a `**Name — X.**` lead (electronics, home-goods,
 * supplements), and a section that opens on the bare name in bold (womens-fashion).
 *
 * A null name with `unreadable` false leaves nothing to check against, because there is no
 * board or the board has no Brand section (the abstract starter set). With `unreadable`
 * true the section is there and names nothing this reader recognises, and the gate treats
 * that as a failure rather than a pass.
 */
export function readStyleBoardName(profileDir) {
  const path = join(profileDir, "design", "style-board.md")
  if (!existsSync(path)) {
    return { name: null, unreadable: false, reason: "the profile has no design/style-board.md" }
  }
  const text = readFileSync(path, "utf8")
  const heading = /^##\s+1\.\s+Brand\b.*$/m.exec(text)
  if (!heading) {
    return {
      name: null,
      unreadable: false,
      reason: "design/style-board.md has no section «1. Brand»",
    }
  }
  const rest = text.slice(heading.index + heading[0].length)
  const next = rest.search(/^##\s/m)
  const section = (next < 0 ? rest : rest.slice(0, next)).trim()
  const found =
    /^\|\s*`brand\.name`\s*\|\s*([^|]+?)\s*\|/m.exec(section)?.[1] ??
    /\*\*Name\s*[—–:-]+\s*([^*]+?)\.?\*\*/.exec(section)?.[1] ??
    /^\*\*([^*]+?)\.?\*\*/.exec(section)?.[1]
  const name = found?.replace(/[`"«»]/g, "").trim()
  if (!name) {
    return {
      name: null,
      unreadable: true,
      reason:
        "section «1. Brand» of design/style-board.md names no brand this gate can read " +
        "(write it as **Name — X.** or as a `brand.name` table row)",
    }
  }
  return { name, unreadable: false, reason: null }
}

/**
 * The name gate (q-site-name-unchecked). The home-goods stand once shipped the wordmark
 * QUERNSTONE, a name its own style board had rejected, and only a human looking at a
 * screenshot caught it. So every name this build puts on screen or into the bundle has to
 * be the one the board settled on. That covers brand.name, brand.wordmark.text and the
 * wordmark src/lib/util/env.ts renders (NEXT_PUBLIC_SITE_NAME, else brand.name). Case and
 * spacing are ignored, because the wordmark is set in capitals by design.
 */
export function checkSiteName({ profileId, profilesDir, brand, env = process.env }) {
  if (env.STORE_SITE_NAME_GATE === "off") {
    return { status: "off", message: "site-name gate off (STORE_SITE_NAME_GATE=off)" }
  }
  if (!profileId || profileId === "default") {
    return { status: "skipped", message: 'site-name gate skipped: profile "default" has no style board' }
  }
  const board = readStyleBoardName(join(profilesDir, profileId))
  if (!board.name) {
    return {
      status: board.unreadable ? "failed" : "skipped",
      message: `site-name gate ${board.unreadable ? "FAILED" : "skipped"} for profile "${profileId}": ${board.reason}`,
    }
  }

  const onScreen = env.NEXT_PUBLIC_SITE_NAME
    ? ["NEXT_PUBLIC_SITE_NAME, the wordmark on screen", env.NEXT_PUBLIC_SITE_NAME]
    : [
        "the wordmark on screen (NEXT_PUBLIC_SITE_NAME unset)",
        brand?.name || DEFAULT_SITE_NAME,
      ]
  const checks = [
    ["profile.json brand.name", brand?.name],
    ["profile.json brand.wordmark.text", brand?.wordmark?.text],
    onScreen,
  ]
  const wanted = normaliseName(board.name)
  const wrong = checks.filter(([, value]) => value != null && normaliseName(value) !== wanted)
  if (wrong.length) {
    return {
      status: "failed",
      message:
        `site-name gate FAILED for profile "${profileId}": design/style-board.md «1. Brand» ` +
        `settled on "${board.name}", but\n` +
        wrong.map(([label, value]) => `  - ${label} is "${value}"`).join("\n") +
        "\nFix the name, or set STORE_SITE_NAME_GATE=off for a build whose name is meant " +
        "to differ from its fallback profile.",
    }
  }
  return {
    status: "ok",
    message: `site name "${onScreen[1]}" matches design/style-board.md «1. Brand» ("${board.name}")`,
  }
}

/**
 * Per-locale promo text. The profile schema seals its root (additionalProperties:false)
 * and has no i18n property, so the overrides live in the profile directory's
 * i18n/<locale>.json files. A file without home.promoStrip.text contributes nothing and
 * that locale falls back to the English base text at render time.
 */
export function readLocaleOverrides(profileDir) {
  const i18nDir = join(profileDir, "i18n")
  if (!existsSync(i18nDir)) return {}
  const overrides = {}
  for (const entry of readdirSync(i18nDir)) {
    const match = /^([a-z]{2})\.json$/.exec(entry)
    if (!match) continue
    let doc
    try {
      doc = readJson(join(i18nDir, entry))
    } catch (error) {
      console.warn(`[build-profile] skipped i18n/${entry}: ${error.message}`)
      continue
    }
    const text = doc?.home?.promoStrip?.text
    if (typeof text === "string" && text.length > 0) {
      overrides[match[1]] = { promoStrip: text }
    }
  }
  return overrides
}

/**
 * Narrows a profile.json to what the storefront renders. Anything the profile omits
 * stays null/empty rather than being defaulted to a guess, because an absent section
 * must produce absent markup, not a placeholder.
 *
 * The `default` profile never stamps `generatedAt` (A-29, 46df audit): it is not the
 * output of a bake, it is what "nothing to bake" looks like, and `new Date()` there
 * meant a committed `profile.generated.json` went stale on read — `pnpm storefront:dev`
 * on a totally clean checkout (no `NEXT_PUBLIC_STORE_PROFILE`) rewrote a different
 * timestamp into it every single run, so `git status` was never clean even right after
 * `pnpm install`. `types.ts` already types the field `generatedAt?: string`, and its one
 * reader (`storefront-settings.ts`) already falls back to `""`, so omitting it here is
 * not a new case either has to learn.
 */
export function buildProfile({ profileId, profilesDir, mediaBaseUrl, heroEnabled = true }) {
  if (!profileId || profileId === "default") {
    return { ...DEFAULT_PROFILE }
  }

  const profileDir = join(profilesDir, profileId)
  const profilePath = join(profileDir, "profile.json")
  if (!existsSync(profilePath)) {
    console.warn(
      `[build-profile] no profile.json at ${profilePath} — falling back to profile "default"`
    )
    return { ...DEFAULT_PROFILE }
  }

  const raw = readJson(profilePath)
  const hero = heroEnabled ? raw?.home?.hero : null
  const tiles = Array.isArray(raw?.home?.categoryTiles) ? raw.home.categoryTiles : []
  const promo = raw?.home?.promoStrip
  const treatment = raw?.layout?.imageTreatment
  const theme = raw?.theme

  return {
    schema: DEFAULT_PROFILE.schema,
    id: raw?.id ?? profileId,
    source: "backend",
    brand: raw?.brand
      ? {
          name: raw.brand.name,
          tagline: raw.brand.tagline ?? null,
          wordmark: raw.brand.wordmark ?? null,
        }
      : null,
    // src/lib/theme/profile.ts reads presetId and defaultMode for <html data-theme
    // data-mode>, and typography for the font pair themes:build instantiates. Without
    // this block the storefront renders the fallback preset however the profile is set.
    theme: theme
      ? {
          presetId: theme.presetId ?? null,
          defaultMode: theme.defaultMode ?? null,
          typography: theme.typography ?? null,
          radius: theme.radius ?? null,
        }
      : null,
    home: {
      hero: hero
        ? {
            layout:
              hero.layout === "split" || hero.layout === "announcement" ? hero.layout : "full-bleed",
            headline: hero.headline,
            subheadline: hero.subheadline ?? null,
            cta: hero.cta ? { label: hero.cta.label, href: hero.cta.href } : null,
            image: mediaUrl(hero.image, mediaBaseUrl),
          }
        : null,
      categoryTiles: tiles.map((tile) => ({
        categoryHandle: tile.categoryHandle,
        label: tile.label,
        image: mediaUrl(tile.image, mediaBaseUrl),
      })),
      promoStrip: promo ? { enabled: promo.enabled !== false, text: promo.text ?? null } : null,
    },
    layout: {
      imageTreatment: treatment
        ? {
            aspect: treatment.aspect,
            fit: treatment.fit,
            radius: treatment.radius,
            hover: treatment.hover,
          }
        : null,
    },
    i18n: readLocaleOverrides(profileDir),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Hands over to the theme build (theme.json -> CSS variables), which is owned by the
 * theme agent. It may not exist yet, which is not a failure of this script: the profile
 * is already written, so we say plainly what was skipped and exit clean.
 */
export function runThemeBuild({ root = STOREFRONT_ROOT, env = process.env } = {}) {
  if (env.SKIP_THEME_BUILD === "1") {
    return { ran: false, reason: "SKIP_THEME_BUILD=1" }
  }
  let hasScript = false
  try {
    hasScript = Boolean(readJson(join(root, "package.json")).scripts?.["themes:build"])
  } catch {
    hasScript = false
  }
  const scriptFile = join(root, "scripts/build-themes.mjs")
  const hasFile = existsSync(scriptFile)

  if (!hasScript && !hasFile) {
    console.warn(
      "[build-profile] theme build skipped: neither the package.json script " +
        '"themes:build" nor scripts/build-themes.mjs exists yet. The profile JSON was ' +
        "written; theme CSS variables will be missing until the theme build lands."
    )
    return { ran: false, reason: "theme build not present" }
  }

  const [command, args] = hasScript
    ? ["pnpm", ["run", "themes:build"]]
    : ["node", ["scripts/build-themes.mjs"]]
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env })
  if (result.error || result.status !== 0) {
    console.warn(
      `[build-profile] theme build "${command} ${args.join(" ")}" failed ` +
        `(${result.error?.message ?? `exit ${result.status}`}). The profile JSON was written.`
    )
    return { ran: true, ok: false }
  }
  return { ran: true, ok: true }
}

/**
 * Minimal .env reader. `next dev` and `next build` load .env.local themselves, but a
 * predev/prebuild script runs before Next does, so NEXT_PUBLIC_STORE_PROFILE written in
 * .env.local would otherwise be invisible here and every build would silently produce the
 * `default` profile. Precedence matches Next: a real environment variable wins, then
 * .env.local, then .env. @next/env is not resolvable from this package, hence the hand
 * parse; it deliberately understands only KEY=VALUE, comments and surrounding quotes.
 * `origins` collects which file each key came from, so the build log can say where the
 * media base was read (a key that was already set records nothing).
 */
export function loadDotEnv(env = process.env, root = STOREFRONT_ROOT, origins = {}) {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match || line.trimStart().startsWith("#")) continue
      const key = match[1]
      if (key in env) continue
      let value = match[2].trim()
      const quoted = /^(['"])(.*)\1$/.exec(value)
      value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "").trim()
      env[key] = value
      origins[key] = file
    }
  }
  return env
}

/**
 * Throws when the site-name gate fails, before anything is written, so a failed build
 * leaves the previous profile.generated.json in place. `root` is the storefront root the
 * .env files are read from and the output is written under. Tests point it elsewhere.
 */
export function main(env = process.env, { root = STOREFRONT_ROOT } = {}) {
  const origins = {}
  loadDotEnv(env, root, origins)
  const profileId = env.NEXT_PUBLIC_STORE_PROFILE || "default"
  const profilesDir = resolveProfilesDir(env, root)
  const heroEnabled = env.STORE_PROFILE_HERO !== "off"
  const media = resolveMediaBaseUrl(env, profileId)
  const profile = buildProfile({
    profileId,
    profilesDir,
    mediaBaseUrl: media.url,
    heroEnabled,
  })

  const gate = checkSiteName({
    profileId: profile.source === "backend" ? profileId : "default",
    profilesDir,
    brand: profile.brand,
    env,
  })
  if (gate.status === "failed") {
    throw new Error(gate.message)
  }

  const outputPath = join(root, OUTPUT_FILE)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`)
  console.log(
    `[build-profile] profile "${profile.id}" (source: ${profile.source}) -> ` +
      `src/lib/profile/profile.generated.json · hero: ${
        profile.home.hero
          ? profile.home.hero.layout
          : heroEnabled
            ? "none"
            : "off (STORE_PROFILE_HERO=off)"
      }` +
      ` · tiles: ${profile.home.categoryTiles.length}` +
      ` · aspect: ${profile.layout.imageTreatment?.aspect ?? "none"}`
  )
  if (media.url && profile.source === "backend") {
    const file = origins[media.from] ? `, ${origins[media.from]}` : ""
    console.log(`[build-profile] media base: ${media.url} (from ${media.from}${file})`)
  }
  console.log(`[build-profile] ${gate.message}`)

  runThemeBuild({ root, env })
  return profile
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(`[build-profile] ${error.message}`)
    process.exit(1)
  }
}
