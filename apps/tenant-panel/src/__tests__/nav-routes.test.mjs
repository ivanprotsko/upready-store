import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The sidebar contract, checked by reading the source
 * (p01-settings-integrations-restructure).
 *
 * Ivan, 2026-09-16 20:22 WITA: «не правильно делать отдельный пункт для
 * навигации в внутри одной страницы через якорь #». The defect class is one a
 * reviewer catches once and a test catches forever, so it is a test:
 *
 *   1. no navigation target anywhere in the panel contains `#`;
 *   2. every `to` in the sidebar resolves to a route registered in `app.tsx`.
 *
 * WHY SOURCE TEXT AND NOT A RENDER. The nav array is built inside a hook that
 * needs i18next, a router and React; rendering it would pull the whole panel
 * into a test runner this package does not have. What the rule forbids is a
 * STRING in a `to`, and a string is exactly what the source carries — no
 * runtime can make a `to` whose text carries a hash stop carrying one.
 * The check therefore costs one `node --test` run and no dependency.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 *
 * The blind spot is honest and named: a `to={...}` built at runtime is not
 * read here. `CrossLink` (the one component that takes a `to` as a prop) is
 * covered by check 1 through its call sites, which are literals.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const APP = join(SRC, "app.tsx")
const LAYOUT = join(SRC, "components/layout/main-layout/main-layout.tsx")

/** Every `.ts`/`.tsx` file under `src`, so a new screen joins the check by existing. */
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      return sourceFiles(full)
    }
    return /\.tsx?$/.test(entry) ? [full] : []
  })

/** `to: "…"` and `to="…"` — the two spellings a literal target takes in this panel. */
const literalTargets = (source) => [
  ...[...source.matchAll(/\bto:\s*"([^"]*)"/g)].map((m) => m[1]),
  ...[...source.matchAll(/\bto="([^"]*)"/g)].map((m) => m[1]),
]

/** `path: "…"` of every route object in `app.tsx`. */
const registeredPaths = (source) =>
  [...source.matchAll(/\bpath:\s*"([^"]*)"/g)].map((m) => m[1])

test("no navigation target in the panel carries an anchor", () => {
  const offenders = []
  for (const file of sourceFiles(SRC)) {
    for (const target of literalTargets(readFileSync(file, "utf8"))) {
      if (target.includes("#")) {
        offenders.push(`${file.slice(SRC.length + 1)} -> ${target}`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a navigation target may not point at an anchor inside a page:\n${offenders.join("\n")}`
  )
})

test("every sidebar target resolves to a route registered in app.tsx", () => {
  const paths = registeredPaths(readFileSync(APP, "utf8"))
  assert.ok(paths.length > 20, `app.tsx yielded ${paths.length} routes, which cannot be right`)

  // A registered path may carry `:params`; compare segment by segment so
  // `/products/:id` answers for `/products/prod_1` without a router.
  const matches = (target) =>
    paths.some((pattern) => {
      const a = pattern.split("/")
      const b = target.split("/")
      return (
        a.length === b.length &&
        a.every((segment, index) => segment.startsWith(":") || segment === b[index])
      )
    })

  const targets = literalTargets(readFileSync(LAYOUT, "utf8"))
  assert.ok(targets.length > 5, `the sidebar yielded ${targets.length} targets, which cannot be right`)

  const dangling = targets.filter((target) => target.startsWith("/") && !matches(target))
  assert.deepEqual(
    dangling,
    [],
    `the sidebar points at addresses no route serves:\n${dangling.join("\n")}`
  )
})

test("the addresses Ivan named on 2026-09-16 are registered", () => {
  const paths = new Set(registeredPaths(readFileSync(APP, "utf8")))
  for (const required of [
    "/settings/integrations",
    "/settings/integrations/wildberries",
    "/settings/integrations/ozon",
    "/settings/integrations/robokassa",
    "/settings/integrations/apiship",
    "/settings/integrations/cdek",
    "/settings/marketplaces/wildberries",
    "/settings/marketplaces/ozon",
    // The old addresses stay registered: they are in the owner's bookmarks and
    // now redirect (`routes/settings/*/redirect.tsx`).
    "/settings/marketplaces",
    "/settings/wildberries",
    "/settings/ozon",
  ]) {
    assert.ok(paths.has(required), `app.tsx registers no route for ${required}`)
  }
})
