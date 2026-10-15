import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import {
  PANEL_ROUTES,
  PANEL_SKIPPED,
  parseArgs,
  verdict,
} from "../../scripts/mobile-audit.mjs"

/**
 * t-2026-10-13-30. Ivan, 13.10: «в мобильной версии на странице
 * https://panel.cherkashino.ru/courses поломана верстка, таблица не помещается
 * по ширине … нужно проверить все страницы панели тенантов и платформы».
 *
 * The courses table was 435 px wide on a 390 px phone and had no box of its
 * own to scroll in, so the shell's `main` scrolled sideways and the whole
 * screen slid off the left edge. The guard is structural: every hand-rolled
 * table sits in `TableScroll` (or an `overflow-x-auto` box, the shape the
 * Wildberries tables already had), and the shell column takes `min-w-0`.
 * `PHONE_CARDS` alone is not enough: it turns rows into cards only below
 * `md`, and the pages table was 829 px wide on a 768 px screen.
 *
 * Source assertions, not a render, for the reason `error-boundary-auth.test.mjs`
 * gives: the package has no jsdom. The render check is the audit script
 * itself (`apps/tenant-panel/scripts/mobile-audit.mjs`), run against a stand.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

// Comments name `<Table>` too; only code counts.
const code = (text) =>
  text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// The shared `_DataTable` scrolls and turns rows into cards on its own.
const OWN_GUARD = new Set(["components/table/data-table/data-table-root/data-table-root.tsx"])

test("the shared container scrolls sideways and cannot grow past its parent", () => {
  const source = read("components/table/table-scroll.tsx")
  for (const cls of [
    "overflow-x-auto",
    "max-w-full",
    "min-w-0",
    "[-webkit-overflow-scrolling:touch]",
    "overscroll-x-contain",
  ]) {
    assert.ok(source.includes(cls), `TABLE_SCROLL must carry ${cls}`)
  }
})

test("every hand-rolled table of the panel sits in a box that scrolls it", () => {
  const bare = []
  for (const file of [...walk(join(SRC, "routes")), ...walk(join(SRC, "components"))]) {
    if (!file.endsWith(".tsx")) continue
    const rel = relative(SRC, file)
    if (OWN_GUARD.has(rel)) continue
    const lines = code(readFileSync(file, "utf8")).split("\n")
    lines.forEach((line, index) => {
      if (!/<(Table|table)(?=[\s>]|$)/.test(line)) return
      const before = lines
        .slice(0, index)
        .filter((l) => l.trim())
        .slice(-2)
        .join("\n")
      if (/<TableScroll\b|overflow-x-auto/.test(before)) return
      bare.push(`${rel}:${index + 1}`)
    })
  }
  assert.deepEqual(bare, [], `a table outside TableScroll pushes the page sideways on a phone: ${bare.join(", ")}`)
})

test("the shell column and its gutter cannot be stretched by a wide child", () => {
  const source = read("components/layout/shell/shell.tsx")
  assert.match(source, /"flex h-screen w-full min-w-0 flex-col overflow-auto"/)
  assert.match(source, /"flex w-full min-w-0 max-w-\[1600px\] flex-col gap-y-2 p-3"/)
})

test("course list: _DataTable rows (phone cards built in), the course and product cells truncate", () => {
  // t-2026-10-14-01 (G4): the hand-rolled table and the create form under it
  // gave way to `_DataTable` and the «Создать курс» modal.
  const source = read("routes/courses/course-list/course-list.tsx")
  assert.ok(source.includes("<_DataTable") && !/<Table[\s>]/.test(source))
  assert.equal((source.match(/className="(text-ui-fg-subtle )?truncate"/g) ?? []).length, 2)
  assert.ok(!/w-\[\d+px\]/.test(source), "no field has a fixed px width")
})

test("course card: read sections only; the storefront address breaks instead of pushing the page", () => {
  // t-2026-10-14-01 (G4): no buttons in the card's header any more; the
  // address is a read row of the first section.
  const source = read("routes/courses/course-detail/course-detail.tsx")
  assert.ok(source.includes("<SettingsDetailSection section={general} level=\"h1\" />"))
  assert.ok(source.includes("font-mono break-all"), "the address wraps on a phone")
  assert.ok(!/<Button\b|<Input\b|<Textarea\b/.test(source), "no field and no button on the card")
  assert.ok(!/w-\[\d+px\]/.test(source), "no fixed px width")
})

test("old addresses: the search is the list toolbar and the rows are _DataTable rows (phone cards built in)", () => {
  // t-2026-10-14-01 (G2): the hand-made 320 px field and its counter gave way
  // to the toolbar of the native list, which takes the full width below md.
  const source = read("routes/settings/redirects/redirects.tsx")
  assert.ok(source.includes("<DataTableQuery<TenantRedirect>"))
  assert.ok(source.includes("<_DataTable"))
  assert.ok(!source.includes("<Table>") && !source.includes("max-w-[320px]"))
})

test("pages and journal: the rows are _DataTable rows (phone cards built in), no hand-made table", () => {
  // t-2026-10-14-01 (G4): the hand-made tables of /pages and /journal gave way
  // to the native list, which turns rows into cards below md by itself.
  for (const file of ["routes/pages/page-list/page-list.tsx", "routes/journal/article-list/article-list.tsx"]) {
    const source = read(file)
    assert.ok(source.includes("<_DataTable"), `${file}: _DataTable`)
    assert.ok(!source.includes("<Table>") && !source.includes("<TableScroll"), `${file}: no hand-made table`)
  }
})

test("the audit opens every screen of the router or says why not", () => {
  const app = read("app.tsx")
  const audited = new Set(PANEL_ROUTES.map((r) => r.path.split("?")[0]))
  const missing = []
  for (const match of app.matchAll(/path: "(\/[^"]*)",\n([^\n]*)/g)) {
    const [, path, next] = match
    if (/element: <\w+Redirect \/>/.test(next)) continue
    if (audited.has(path) || path in PANEL_SKIPPED) continue
    missing.push(path)
  }
  assert.deepEqual(missing, [], `add these to PANEL_ROUTES or PANEL_SKIPPED in scripts/mobile-audit.mjs: ${missing.join(", ")}`)
})

test("the audit's verdict: a shell that scrolls sideways is an overflow even when the document is not", () => {
  assert.equal(verdict({ docOverflow: false, shellOverflow: true, offenderCount: 0, menuReachable: true }), "overflow")
  assert.equal(verdict({ docOverflow: false, shellOverflow: false, offenderCount: 1, menuReachable: true }), "overflow")
  assert.equal(verdict({ docOverflow: false, shellOverflow: false, offenderCount: 0, menuReachable: false }), "other")
  assert.equal(verdict({ docOverflow: false, shellOverflow: false, offenderCount: 0, menuReachable: null }), "ok")
  assert.equal(verdict({ error: "timeout" }), "error")
})

test("the audit takes its logins from the environment and its output folder as an absolute path", () => {
  assert.throws(() => parseArgs(["--panel", "http://localhost:5700", "--out", "relative/dir"]), /absolute/)
  const opts = parseArgs(["--panel", "http://localhost:5700", "--out", "/tmp/x"])
  assert.deepEqual(opts.widths, [390, 768, 1280])
  assert.throws(() => parseArgs(["--panel", "http://x", "--out", "/tmp/x", "--password", "p"]), /unknown flag/)
})
