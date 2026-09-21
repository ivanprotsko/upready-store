import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { OWNER_ROUTES, PUBLIC_ROUTES } from "../../e2e/owner-routes.mjs"

/**
 * The walker and the two probes visit the screens listed in
 * `e2e/owner-routes.mjs`. A screen registered in `app.tsx` and missing from
 * that list is a screen nobody looks at, so its raw keys, its jargon and its
 * sideways scroll at 390 px pass every check by not being checked. This test
 * closes that hole: every route of `app.tsx` has a manifest entry.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 *
 * WHY SOURCE TEXT. Same reason as `nav-routes.test.mjs`: the route tree is
 * built with lazy imports and JSX, and this package has no runner that could
 * load it. The tree is read by indentation instead: a `path:` nested deeper
 * than another `path:` is its child. The blind spot is named: a route whose
 * `path` is computed at runtime is not seen. There is none today.
 *
 * Param names differ on purpose (`:id` in the router, `:product_id` in the
 * manifest, so one walk can hold a product and an order at once), so both
 * sides are compared with every param reduced to `:p`.
 */
const here = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(join(here, "..", "app.tsx"), "utf8")

const routerPaths = () => {
  const stack = []
  const full = []
  for (const line of appSource.split("\n")) {
    const match = line.match(/^(\s*)path:\s*"([^"]*)"/)
    if (!match) {
      continue
    }
    const indent = match[1].length
    const segment = match[2]
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    // The stack holds ABSOLUTE paths, so the parent is its top, not a join.
    const parent = stack.length ? stack[stack.length - 1].absolute : ""
    const absolute = (segment.startsWith("/") ? segment : `${parent}/${segment}`)
      .replace(/\/+/g, "/")
      .replace(/(.)\/$/, "$1")
    stack.push({ indent, absolute })
    full.push(absolute)
  }
  return full
}

const normalise = (path) =>
  path
    .split("?")[0]
    .replace(/:[A-Za-z_]+/g, ":p")
    .replace(/(.)\/$/, "$1")

test("every route of app.tsx is listed in the owner route manifest", () => {
  const listed = new Set(
    [...OWNER_ROUTES, ...PUBLIC_ROUTES].map((r) => normalise(r.path))
  )
  const missing = [...new Set(routerPaths().map(normalise))]
    // The catch-all is walked as a made-up URL, not as "*".
    .filter((path) => path !== "/*" && path !== "*")
    .filter((path) => !listed.has(path))

  assert.deepEqual(
    missing,
    [],
    `routes registered in app.tsx and absent from e2e/owner-routes.mjs:\n  ${missing.join("\n  ")}`
  )
})

test("the manifest lists no screen the router does not have", () => {
  const registered = new Set(routerPaths().map(normalise))
  const unknown = OWNER_ROUTES.map((r) => normalise(r.path))
    .filter((path) => path !== "/this-screen-does-not-exist")
    .filter((path) => !registered.has(path))

  assert.deepEqual(
    [...new Set(unknown)],
    [],
    `manifest entries with no route in app.tsx:\n  ${unknown.join("\n  ")}`
  )
})
