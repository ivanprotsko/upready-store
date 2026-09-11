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
 *   STORE_MEDIA_BASE_URL       prefix for the profile's media refs. Unset means the
 *                              refs are served from the storefront's own origin.
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
const OUTPUT_PATH = join(STOREFRONT_ROOT, "src/lib/profile/profile.generated.json")
const DEFAULT_PROFILES_DIR = "../backend/src/migration-scripts/data/profiles"

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
 */
export function buildProfile({ profileId, profilesDir, mediaBaseUrl, heroEnabled = true }) {
  if (!profileId || profileId === "default") {
    return { ...DEFAULT_PROFILE, generatedAt: new Date().toISOString() }
  }

  const profileDir = join(profilesDir, profileId)
  const profilePath = join(profileDir, "profile.json")
  if (!existsSync(profilePath)) {
    console.warn(
      `[build-profile] no profile.json at ${profilePath} — falling back to profile "default"`
    )
    return { ...DEFAULT_PROFILE, generatedAt: new Date().toISOString() }
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
            // The dark version of the same frame, when the profile authored one
            // (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). Absent stays absent: the
            // storefront then shows `image` in both modes, which is every profile built
            // before the axis existed.
            imageDark: mediaUrl(hero.imageDark, mediaBaseUrl),
          }
        : null,
      categoryTiles: tiles.map((tile) => ({
        categoryHandle: tile.categoryHandle,
        label: tile.label,
        image: mediaUrl(tile.image, mediaBaseUrl),
        imageDark: mediaUrl(tile.imageDark, mediaBaseUrl),
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
 */
export function loadDotEnv(env = process.env, root = STOREFRONT_ROOT) {
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
    }
  }
  return env
}

export function main(env = process.env) {
  loadDotEnv(env)
  const profileId = env.NEXT_PUBLIC_STORE_PROFILE || "default"
  const profilesDir = resolveProfilesDir(env)
  const heroEnabled = env.STORE_PROFILE_HERO !== "off"
  const profile = buildProfile({
    profileId,
    profilesDir,
    mediaBaseUrl: env.STORE_MEDIA_BASE_URL,
    heroEnabled,
  })

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(profile, null, 2)}\n`)
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

  runThemeBuild({ env })
  return profile
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
