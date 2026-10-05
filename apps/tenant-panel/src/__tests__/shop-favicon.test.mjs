import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { DEFAULT_FAVICON, faviconLetter, shopFaviconLinks, shopPlaceholderSvg } from "../lib/shop-favicon.ts"

/**
 * The panel's tab icon (ask-20261006-021217-bd59): the open shop's own icon, the standard
 * letter placeholder for a shop that uploaded none, and the same placeholder with a storefront
 * mark while no shop is open. `lib/shop-favicon.ts` has no JSX, so it is imported and run for
 * real; the component that puts the links on the page is JSX this package cannot render (no
 * vitest/jsdom, see `error-boundary-auth.test.mjs`), so its wiring is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, "..", "..")
const read = (path) => readFileSync(join(ROOT, path), "utf8")

const SET = {
  icon_svg_url: "https://cdn.example.com/icon.svg",
  favicon_ico_url: "https://cdn.example.com/favicon.ico",
  apple_touch_icon_url: "https://cdn.example.com/apple-touch-icon.png",
  icon_192_url: "https://cdn.example.com/icon-192.png",
  icon_512_url: "https://cdn.example.com/icon-512.png",
  icon_maskable_512_url: null,
  mstile_150_url: null,
  mstile_310_url: null,
  mask_icon_url: null,
  background_color: "#ffffff",
  mark_color: "#1a1b09",
}

const NOTHING = { favicon_url: null, app_icons: null, primary_color: null, primary_foreground: null }

const svgOf = (link) => decodeURIComponent(link.href.replace("data:image/svg+xml,", ""))

test("the letter is the first letter or digit of the shop's name, upper-cased", () => {
  assert.equal(faviconLetter("Черкашино"), "Ч")
  assert.equal(faviconLetter("olavka"), "O")
  assert.equal(faviconLetter(" «Лавка» 7"), "Л")
  assert.equal(faviconLetter("7 days"), "7")
  assert.equal(faviconLetter("東京ストア"), "東", "a script with no upper case keeps its own first sign")
  assert.equal(faviconLetter("<b>&"), "B", "markup characters are never the letter")
  assert.equal(faviconLetter("—"), "")
  assert.equal(faviconLetter(null), "")
})

test("a shop with an icon set gets that set's files, in the storefront's order", () => {
  assert.deepEqual(shopFaviconLinks({ name: "Черкашино", branding: { ...NOTHING, app_icons: SET } }), [
    { href: SET.favicon_ico_url, sizes: "32x32" },
    { href: SET.icon_svg_url, type: "image/svg+xml" },
    { href: SET.icon_192_url, sizes: "192x192", type: "image/png" },
  ])
})

test("a single favicon from before the set existed is used as it is", () => {
  const branding = { ...NOTHING, favicon_url: "https://cdn.example.com/old.png" }

  assert.deepEqual(shopFaviconLinks({ name: "Черкашино", branding }), [{ href: branding.favicon_url }])
  assert.deepEqual(
    shopFaviconLinks({ name: "Черкашино", branding: { ...branding, app_icons: { ...SET, favicon_ico_url: null, icon_svg_url: null, icon_192_url: null } } }),
    [{ href: branding.favicon_url }],
    "a set with no tab-sized file falls back to the single upload"
  )
})

test("a shop with nothing uploaded gets the standard placeholder with its own letter and colour", () => {
  const [plain, ...restPlain] = shopFaviconLinks({ name: "Черкашино", branding: NOTHING })
  const [coloured] = shopFaviconLinks({
    name: "Черкашино",
    branding: { ...NOTHING, primary_color: "#2f6b3a", primary_foreground: "#ffffff" },
  })
  const [other] = shopFaviconLinks({ name: "Olavka", branding: NOTHING })

  assert.equal(restPlain.length, 0)
  assert.equal(plain.type, "image/svg+xml")
  assert.match(plain.href, /^data:image\/svg\+xml,/)
  assert.match(svgOf(plain), /fill="#18181B"\/><text [^>]*fill="#ffffff">Ч<\/text>/)
  assert.match(svgOf(coloured), /fill="#2f6b3a"\/><text [^>]*fill="#ffffff">Ч<\/text>/)
  assert.match(svgOf(other), />O<\/text>/)
  assert.notEqual(plain.href, other.href, "two shops with no upload must not share a tab icon")
})

test("the placeholder ignores a colour that is not a six-digit hex, and its text colour with it", () => {
  const svg = shopPlaceholderSvg({ name: "Лавка", color: 'red"/><script>', ink: "#000000" })

  assert.match(svg, /fill="#18181B"\/><text [^>]*fill="#ffffff">Л<\/text>/)
  assert.doesNotMatch(svg, /script/)
})

test("the placeholder's dark text survives on a light primary colour", () => {
  assert.match(
    shopPlaceholderSvg({ name: "olavka", color: "#f5e6a8", ink: "#000000" }),
    /fill="#f5e6a8"\/><text [^>]*fill="#000000">O<\/text>/
  )
})

// The storefront serves the same drawing at `/icon.svg` (`apps/storefront/src/lib/tenant/
// placeholder-icon.ts`); its own test pins the same string, so the two cannot drift apart.
test("the standard placeholder is one fixed drawing", () => {
  assert.equal(
    shopPlaceholderSvg({ name: "Черкашино", color: "#2f6b3a", ink: "#ffffff" }),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#2f6b3a"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-size="38" font-weight="700" fill="#ffffff">Ч</text></svg>`
  )
})

test("with no shop open the tab shows the file index.html links, and that file is the placeholder", () => {
  assert.deepEqual(shopFaviconLinks({}), [DEFAULT_FAVICON])
  assert.deepEqual(shopFaviconLinks({ name: "—", branding: NOTHING }), [DEFAULT_FAVICON])
  assert.equal(DEFAULT_FAVICON.href, "/favicon.svg")
  assert.equal(read("public/favicon.svg").trim(), shopPlaceholderSvg())
  assert.match(read("index.html"), /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/)
})

test("both layouts mount the icon next to the title, and the hook waits for the shop's answer", () => {
  for (const layout of ["components/layout/shell/shell.tsx", "components/layout/public-layout/public-layout.tsx"]) {
    assert.match(read(`src/${layout}`), /<DocumentTitle \/>\s*<DocumentFavicon \/>/, `${layout} must mount DocumentFavicon`)
  }

  const hook = read("src/hooks/use-document-favicon.tsx")

  assert.match(hook, /useStore\(\{ retry: false \}\)/, "the login screen's 401 must not be retried")
  assert.match(hook, /enabled: !!store,/, "the branding is asked for only once a shop is open")
  assert.match(
    hook,
    /if \(isStorePending \|\| \(!!store && isBrandingPending\)\) \{\s*return null/,
    "no icon is put on the tab before the shop's branding answered"
  )
  assert.match(hook, /querySelectorAll\('link\[rel~="icon"\]'\)\.forEach\(\(node\) => node\.remove\(\)\)/)
})
