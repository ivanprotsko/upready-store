import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-58: a list built with `useDataTable({ enablePagination: false })`
 * («Настройки → Сайты», «Настройки → Домены») fell into «Произошла ошибка»
 * as soon as it had a row. The hook put `pagination: undefined` into the
 * table's `state`; @tanstack/react-table merges `{ ...internal, ...state }`,
 * so the undefined key wiped the table's own pagination and `DataTableRoot`
 * threw on `const { pageIndex, pageSize } = table.getState().pagination`.
 *
 * Source assertions, not a render: this package has no vitest/jsdom, the
 * same reason every other panel test here reads the `.tsx` file as text.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, "..", path), "utf8")

const HOOK = read("hooks/use-data-table.tsx")
const ROOT = read("components/table/data-table/data-table-root/data-table-root.tsx")

/** The object literal passed as `state:` to `useReactTable`. */
const stateBlock = (source) => {
  const start = source.indexOf("useReactTable(")
  assert.ok(start >= 0, "use-data-table calls useReactTable")
  const open = source.indexOf("state: {", start)
  assert.ok(open >= 0, "useReactTable gets a state object")
  let depth = 0
  for (let i = open + "state: ".length; i < source.length; i++) {
    if (source[i] === "{") depth++
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error("unbalanced state object in use-data-table")
}

test("the table reads its pagination unconditionally, so the hook must never blank it", () => {
  assert.match(ROOT, /const \{ pageIndex, pageSize \} = table\.getState\(\)\.pagination/)
})

test("without pagination the hook leaves the key out of state instead of setting it undefined", () => {
  const state = stateBlock(HOOK)
  assert.doesNotMatch(
    state,
    /\bpagination\s*:[^,}]*\?[^,}]*:\s*undefined/,
    "`pagination: cond ? pagination : undefined` wipes the table's own pagination"
  )
  assert.match(
    state,
    /\.\.\.\(\s*enablePagination\s*\?\s*\{\s*pagination\s*\}\s*:\s*\{\s*\}\s*\)/,
    "the pagination key is spread in only when pagination is on"
  )
})

test("the lists that switch pagination off still go through the hook", () => {
  for (const path of ["routes/settings/sites/sites.tsx", "routes/settings/domains/domains.tsx"]) {
    const source = read(path)
    assert.match(source, /useDataTable\(/, `${path} uses useDataTable`)
    assert.match(source, /enablePagination:\s*false/, `${path} switches pagination off`)
  }
})
