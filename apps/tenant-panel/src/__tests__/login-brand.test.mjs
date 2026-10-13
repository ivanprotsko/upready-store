import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { brandOfHost } from "../lib/login-brand.ts"

/**
 * The sign-in screens show the brand of the host, not Medusa's mark (t-2026-10-13-23, Ivan
 * 13.10: «на прототипах логотп медузы, нужно заменить на логотип клиента»). The resolution runs
 * against the real docs/owner-guide/brands.json; the screens are JSX this package cannot render
 * (see `error-boundary-auth.test.mjs`), so the rest asserts on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const repo = join(SRC, "../../..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const brands = JSON.parse(readFileSync(join(repo, "docs/owner-guide/brands.json"), "utf8"))

test("a listed host gets its row, any other host the default brand", () => {
  for (const host of ["panel.cherkashino.ru", "panel.cherkashino.com", "PANEL.Cherkashino.RU"]) {
    assert.deepEqual(brandOfHost(brands, host), { name: "Черкашино", logo: "brands/cherkashino.svg" }, host)
  }
  for (const host of ["localhost", "127.0.0.1", "panel.example.com", "cherkashino.ru", "constructor", "__proto__"]) {
    assert.deepEqual(brandOfHost(brands, host), brands.default, host)
  }
  assert.equal(brands.default.name, "Upready Store")
})

test("every sign-in screen shows BrandMark, none the Medusa AvatarBox", () => {
  const screens = {
    "routes/login/login.tsx": 1,
    "routes/forgot-password/forgot-password.tsx": 1,
    "routes/reset-password/reset-password.tsx": 2,
  }
  for (const [file, marks] of Object.entries(screens)) {
    const source = read(file)
    assert.doesNotMatch(source, /AvatarBox|LogoBox/, `${file} still draws the Medusa mark`)
    assert.equal(source.match(/<BrandMark\b/g)?.length ?? 0, marks, `${file}: <BrandMark> count`)
  }
})

test("BrandMark takes the table and the logos from the help, not a copy of its own", () => {
  const mark = read("components/common/brand-mark/brand-mark.tsx")

  assert.match(mark, /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/docs\/owner-guide\/brands\.json"/)
  assert.match(mark, /import\.meta\.glob<string>\(\s*"\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/docs\/owner-guide\/brands\/\*\.\{svg,png,webp\}"/)
  assert.match(mark, /brandOfHost\(brands, window\.location\.hostname\)/)
  assert.match(mark, /alt=\{brand\.name\}/)
  // The Medusa hexagon of avatar-box.tsx and logo-box.tsx.
  assert.doesNotMatch(mark, /M238\.088 51\.1218|M30\.85 6\.16832/)
})

test("the «checked» badge stays on BrandMark", () => {
  const mark = read("components/common/brand-mark/brand-mark.tsx")

  assert.match(mark, /\{ checked \}: \{ checked\?: boolean \}/)
  assert.match(mark, /\{checked && \(\s*<motion\.div/)
})
