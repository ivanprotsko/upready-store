import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-25-09: Ivan, 2026-09-25 ~12:30 WITA: «из панели тенантов нужно
 * убрать пункт меню "https://medusajs.com/changelog", "документация"».
 *
 * WHY SOURCE TEXT AND NOT A RENDER. Same reason `shop-switcher.test.mjs`
 * gives: this package ships `node --test` (package.json `"test"`), not a
 * React rendering setup.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const userMenu = readFileSync(
  join(SRC, "components/layout/user-menu/user-menu.tsx"),
  "utf8"
)

test("the user menu links to neither the Medusa docs nor the Medusa changelog", () => {
  assert.ok(
    !userMenu.includes("docs.medusajs.com"),
    "user-menu.tsx must not link to docs.medusajs.com («документация»)"
  )
  assert.ok(
    !userMenu.includes("medusajs.com/changelog"),
    "user-menu.tsx must not link to medusajs.com/changelog («история изменений»)"
  )
})

test("the user menu imports no icon used only by the removed links", () => {
  const importsStart = userMenu.indexOf("from \"@medusajs/icons\"")
  const importsBlock = userMenu.slice(0, importsStart)

  assert.ok(
    !importsBlock.includes("BookOpen"),
    "BookOpen was only used by the removed «Документация» item"
  )
  assert.ok(
    !importsBlock.includes("TimelineVertical"),
    "TimelineVertical was only used by the removed «История изменений» item"
  )
})

test("removing the two items leaves no doubled separator", () => {
  const doubled = /<DropdownMenu\.Separator\s*\/>\s*<DropdownMenu\.Separator\s*\/>/
  assert.ok(
    !doubled.test(userMenu),
    "two adjacent DropdownMenu.Separator elements found after the removal"
  )
})
