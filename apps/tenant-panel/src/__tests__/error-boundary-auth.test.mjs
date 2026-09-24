import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { isFetchError } from "../lib/is-fetch-error.ts"
import { FetchError } from "@medusajs/js-sdk"

/**
 * Audit D-05 (t-2026-09-24-n2): the only tests this package had were two
 * manifest checks (do the routes/sidebar line up). This is the panel's real
 * auth-failure contract instead: a 401 from any loader must bounce the owner
 * to /login, not show the generic error screen every other status gets.
 *
 * `isFetchError` is plain TS with no vite macros, so it is imported and run
 * for real. `error-boundary.tsx` itself is JSX using react-router/i18next/
 * @medusajs/ui, which this package cannot render (no vitest, no jsdom/RTL,
 * same reason nav-routes.test.mjs and profile-password.test.mjs give) - its
 * two tests below assert on the source directly, the same technique, but
 * checking a behavioral branch (which error code redirects) rather than a
 * static manifest.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

test("isFetchError recognizes a 401 FetchError and rejects a plain Error", () => {
  const unauthorized = new FetchError("Unauthorized", "Unauthorized", 401)
  assert.equal(isFetchError(unauthorized), true)
  assert.equal(unauthorized.status, 401)
  assert.equal(isFetchError(new Error("boom")), false)
})

test("a 401 redirects to /login before the generic error screen is built", () => {
  const source = read("components/utilities/error-boundary/error-boundary.tsx")

  const authCheck = source.indexOf("error.status === 401")
  const navigate = source.indexOf('<Navigate to="/login"')
  const switchStart = source.indexOf("switch (code)")

  assert.notEqual(authCheck, -1, "the 401 check is missing")
  assert.notEqual(navigate, -1, "the /login redirect is missing")
  assert.notEqual(switchStart, -1, "the generic-error switch is missing")
  assert.ok(
    authCheck < navigate && navigate < switchStart,
    "a 401 must redirect to /login before the generic error screen's title/message are computed"
  )
})

test("a non-auth failure (e.g. 500) falls through to the generic error screen, not a redirect", () => {
  const source = read("components/utilities/error-boundary/error-boundary.tsx")

  const redirects = [...source.matchAll(/<Navigate\b/g)]
  assert.equal(
    redirects.length,
    1,
    "exactly one redirect branch is expected (401 only) - a second one would mean some other status now also bounces to /login"
  )
  assert.ok(source.includes("case 500:"), "the switch must still branch on 500 for non-auth failures")
})
