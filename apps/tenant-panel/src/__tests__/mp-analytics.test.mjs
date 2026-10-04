import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Wildberries → Аналитика» (task-06 of mp-section-design): the screen on
 * live data, read as source text and catalogs like the other tests of this
 * package (there is no React runner here). The numbers themselves are pinned
 * by the backend's `analytics.unit.spec.ts`; this file pins what the panel
 * does with them.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const src = (...parts) => readFileSync(join(root, ...parts), "utf8")
const catalog = (lang) => JSON.parse(src("i18n", "translations", `${lang}.json`))

const DIR = join(root, "routes", "marketplaces", "mp-analytics")
const SCREEN = src("routes", "marketplaces", "mp-analytics", "mp-analytics.tsx")
const CHART = src("routes", "marketplaces", "mp-analytics", "components", "sales-chart.tsx")
const HOOK = src("hooks", "api", "marketplace-section.tsx")

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(entry) ? [full] : []
  })

const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

const get = (object, path) => path.split(".").reduce((node, key) => node?.[key], object)

test("the hook asks the live route unless the fixture flag is set", () => {
  const block = HOOK.slice(HOOK.indexOf("export const useMpAnalytics"))
  assert.match(block, /MP_FIXTURES\s*\?\s*Promise\.resolve\(fixtureAnalytics\(marketplace, params\)\)/)
  assert.match(block, /sdk\.client\.fetch<MpAnalyticsResponse>\(`\/tenants\/marketplaces\/\$\{marketplace\}\/analytics`/)
})

test("the period lives in the address and is written only when the owner picks a day", () => {
  assert.match(SCREEN, /nextFrom \? next\.set\("from", nextFrom\) : next\.delete\("from"\)/)
  assert.match(SCREEN, /nextTo \? next\.set\("to", nextTo\) : next\.delete\("to"\)/)
  // «Сбросить» drops both days, and is there only when a day is in the address.
  assert.match(SCREEN, /\{from \|\| to \? \(\s*<Button[^>]*onClick=\{\(\) => setPeriod\(null, null\)\}/)
  // The picker re-emits its day on mount; a day equal to the shown one is not written.
  assert.match(SCREEN, /if \(next !== \(from \?\? period\?\.from_day \?\? null\)\)/)
  assert.match(SCREEN, /if \(next !== \(to \?\? period\?\.to_day \?\? null\)\)/)
  // `toISOString` would shift the day east of Greenwich.
  assert.doesNotMatch(withoutComments(SCREEN), /toISOString/)
})

test("the connection banner speaks only on a notice, and no key with nothing stored is one empty state with the key", () => {
  assert.match(SCREEN, /\{connection\?\.notice && !nothingStored \? <ConnectionBanner/)
  assert.match(
    SCREEN,
    /nothingStored =\s*!!connection && !connection\.connected && connection\.rows_in_period === 0 && \(totals\?\.cards_total \?\? 0\) === 0/
  )
  assert.match(SCREEN, /action=\{\{ to: `\/settings\/integrations\/\$\{slug\}`, label: t\("mp\.analytics\.noKey\.saveKey"\) \}\}/)
  for (const notice of ["missing", "never_run", "failed", "rate_limited", "fixture"]) {
    for (const lang of ["ru", "en"]) {
      assert.ok(get(catalog(lang), `mp.analytics.connection.${notice}`), `${lang}: mp.analytics.connection.${notice}`)
    }
  }
})

test("an empty period keeps the measured zeros and names itself in the table", () => {
  const ru = catalog("ru").mp.analytics
  assert.equal(ru.empty.title, "Продаж за период нет")
  // Only a search turns an empty table into «nothing found».
  assert.match(SCREEN, /queryObject=\{\{ q: raw\.q \}\}/)
  // `null` is a dash, never a zero (rule 20a).
  assert.match(SCREEN, /const money = \(value: number \| null\) => \(value === null \? "—"/)
})

test("days to zero: 14 or fewer is red, null is a dash", () => {
  assert.match(SCREEN, /const DAYS_TO_ZERO_ALERT = 14/)
  assert.match(SCREEN, /days <= DAYS_TO_ZERO_ALERT \? "text-ui-fg-error tabular-nums"/)
  assert.match(SCREEN, /if \(days === null\) \{\s*return <PlaceholderCell \/>/)
})

test("the cards table is sorted by the server on the three fields the backend knows", () => {
  for (const key of ["revenue", "units", "days_to_zero"]) {
    assert.match(SCREEN, new RegExp(`\\{ key: "${key}", label:`))
  }
})

test("the screen sends no mutation", () => {
  const files = walk(DIR)
  assert.ok(files.length >= 3, files.join(", "))
  for (const file of files) {
    const source = withoutComments(readFileSync(file, "utf8"))
    assert.doesNotMatch(source, /useMutation/, file)
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/, file)
  }
})

test("every mp.analytics key the screen and the chart use exists in ru and en, and en is English", () => {
  const used = new Set(
    [...`${SCREEN}\n${CHART}`.matchAll(/["`](mp\.analytics\.[\w.]+)["`]/g)].map((match) => match[1])
  )
  assert.ok(used.size > 15, `${used.size} keys`)
  for (const lang of ["ru", "en"]) {
    const json = catalog(lang)
    for (const key of used) {
      assert.equal(typeof get(json, key), "string", `${lang}: ${key}`)
    }
  }
  const flat = (node) => (typeof node === "string" ? [node] : Object.values(node).flatMap(flat))
  for (const text of flat(catalog("en").mp.analytics)) {
    assert.doesNotMatch(text, /[А-Яа-яЁё]/, text)
  }
})

test("the chart prints no Russian of its own: every word goes through the catalog", () => {
  assert.doesNotMatch(withoutComments(CHART), /[А-Яа-яЁё]/)
  assert.match(CHART, /type Day = MpAnalyticsResponse\["by_day"\]\[number\]/)
})
