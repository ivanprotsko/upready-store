import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-25-17: the sibling sweep to `user-menu-no-medusa-links.test.mjs`
 * (which names the user menu's own two spots) — this one walks every file
 * under `apps/tenant-panel/src` so a THIRD `medusajs.com` link, wherever it
 * is added, fails the same way. Source text, not a render, for the same
 * reason that file gives: this package has no vitest/jsdom (see
 * `error-boundary-auth.test.mjs`).
 *
 * `__tests__` itself is skipped: this file and its neighbours legitimately
 * hold the string in their own assertions, not as a link.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const SKIP_DIRS = new Set(["__tests__", "node_modules"])
const SOURCE_FILE = /\.(ts|tsx|js|jsx|json)$/

function collectFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...collectFiles(full))
    } else if (SOURCE_FILE.test(entry)) {
      out.push(full)
    }
  }
  return out
}

test("no file under apps/tenant-panel/src links to a medusajs.com URL", () => {
  const offenders = collectFiles(SRC).filter((file) =>
    readFileSync(file, "utf8").includes("medusajs.com")
  )

  assert.deepEqual(
    offenders,
    [],
    `medusajs.com URL found outside __tests__ in: ${offenders.join(", ")}`
  )
})
