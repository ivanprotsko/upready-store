#!/usr/bin/env node
// The quality gate of the template programme (t-2026-10-12-33, docs/templates/BLOCK-CONTRACT.md §5): the 16.09
// templates lab's quality rules, measured on the rendered storefront in the browser `template-shots.mjs` uses.
// Rules and thresholds: `./template-check/rules.mjs`; what the page measures: `./template-check/measure.mjs`.
//
// Targets come from where the shots script takes them, the playground `/<locale>/template-lab`: every template
// it links (`[data-template-id]`), as its home, a category page and a product page (the first category and
// product the playground itself links), and every block anchor (`[data-block-anchor]`), at 360 and 1280 px.
// A new template or block is checked with no edit here.
//
//   node scripts/template-check.mjs --base http://localhost:8130 --locale en --host globex.shipshift.dev \
//     [--only <template id | block id | anchor>[,…]] [--widths 360,1280] [--out <dir>]
//     [--baseline <file>] [--write-baseline]
//   node scripts/template-check.mjs --fixture <file.html>      one static page, every page rule, no baseline
//   node scripts/template-check.mjs --self-test                the bad fixture fails with the ids it lists,
//                                                              the good one passes every gate
//
// Writes `report.json` and `report.md` to `artifacts/templates/check/<date>/` (`…/<date>/only-<ids>/` with
// --only). Exit 0: no gate failure outside the baseline (`artifacts/templates/check/baseline.json`); 1: a new
// gate failure; 2: nothing or not everything was checked (stand down, no playground, no axe-core), not a pass.
// A template page's failure the baseline holds for the same page and width of another template is inherited
// (`compareWithBaseline()`): listed apart, not failing the run. So is a block's failure that only a storefront part
// it reuses makes (`SHARED_PARTS`, e.g. ProductCard), when the baseline holds it for a block at that width.
// `--write-baseline` records today's gate failures as the baseline (with --only, for those targets alone).
//
// The storefront must run with STOREFRONT_TEMPLATE_PREVIEW=1. `--host` is sent as `x-forwarded-host`, as in the
// shots script, so a local storefront resolves that shop and the pages carry a real catalogue.
import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { measureContrast, measureFocus, measureMotion, measureTarget } from "./template-check/measure.mjs"
import {
  NOT_PORTED,
  RULES,
  SHARED_PARTS,
  THRESHOLDS,
  compareWithBaseline,
  evaluateBlock,
  evaluatePages,
  evaluateTarget,
  failureKey,
  matchesOnly,
} from "./template-check/rules.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const storefront = path.resolve(here, "..")
const repoRoot = path.resolve(storefront, "..", "..")
const require = createRequire(import.meta.url)

const FLAGS = { base: 1, locale: 1, host: 1, out: 1, only: 1, widths: 1, baseline: 1, fixture: 1, "write-baseline": 0, "self-test": 0 }
function args(argv) {
  const out = { only: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const name = key.startsWith("--") ? key.slice(2) : null
    if (!name || !(name in FLAGS)) throw new Error(`unknown argument ${key}`)
    if (!FLAGS[name]) {
      out[name] = true
      continue
    }
    const value = argv[++i]
    if (value === undefined) throw new Error(`${key} needs a value`)
    if (name === "only") out.only.push(...value.split(",").filter(Boolean))
    else out[name] = value
  }
  return out
}

const opts = args(process.argv.slice(2))
const base = (opts.base ?? "http://localhost:8000").replace(/\/+$/, "")
const locale = opts.locale ?? "en"
const widths = (opts.widths ?? "360,1280").split(",").map(Number)
const today = new Date().toISOString().slice(0, 10)
const headers = opts.host ? { "x-forwarded-host": opts.host } : {}
const baselineFile = path.resolve(opts.baseline ?? path.join(repoRoot, "artifacts", "templates", "check", "baseline.json"))
const HEIGHT = { 360: 800, 1280: 900 }

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }).toString().trim()
  } catch {
    return "unknown"
  }
})()

/* ------------------------------------------------------------------ inputs the rules need */

// The declared type scale: Tailwind's resolved `theme.fontSize`, the preset included (lab: «шкала токенов»).
const typeScale = (() => {
  const resolve = require("tailwindcss/resolveConfig")
  const theme = resolve(require(path.join(storefront, "tailwind.config.js"))).theme
  const px = (v) => {
    const s = Array.isArray(v) ? v[0] : v
    return s.endsWith("rem") ? parseFloat(s) * 16 : parseFloat(s)
  }
  return [...new Set(Object.values(theme.fontSize).map(px))].sort((a, b) => a - b)
})()

// axe-core is not a dependency of this workspace; eslint-plugin-jsx-a11y (under eslint-config-next) brings it.
const axeSource = (() => {
  try {
    const next = require.resolve("eslint-config-next/package.json")
    const a11y = createRequire(next).resolve("eslint-plugin-jsx-a11y/package.json")
    return fs.readFileSync(createRequire(a11y).resolve("axe-core/axe.min.js"), "utf8")
  } catch (error) {
    console.error(`template:check cannot run: axe-core not found through eslint-config-next (${error.message}). Nothing was checked.`)
    process.exit(2)
  }
})()

/* ------------------------------------------------------------------ browser helpers */

/** Scrolls to the end and back so lazy images load, then waits for the network and the fonts (as the shots do). */
async function settle(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() =>
    Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true })
              img.addEventListener("error", resolve, { once: true })
              setTimeout(resolve, 5000)
            })
        )
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
}

/** Hides every fixed or sticky bar outside the playground, as the shots do, so it covers no block. */
async function hidePinnedOutside(page, selector) {
  await page.evaluate((sel) => {
    const keep = document.querySelector(sel)
    for (const el of document.querySelectorAll("body *")) {
      const pinned = ["fixed", "sticky"].includes(getComputedStyle(el).position)
      if (pinned && keep && !keep.contains(el) && !el.contains(keep)) el.style.setProperty("visibility", "hidden", "important")
    }
  }, selector)
}

/** One page target: every fact and every page-level measurement. */
async function checkPage(browser, { url, width }) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 }, extraHTTPHeaders: headers })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await settle(page)
    await page.addScriptTag({ content: axeSource })
    const facts = await page.evaluate(measureTarget, { scope: null, block: false })
    const motion = await page.evaluate(measureMotion, { scope: null })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const reducedMotion = await page.evaluate(measureMotion, { scope: null })
    await page.emulateMedia({ reducedMotion: "no-preference" })
    const contrast = await page.evaluate(measureContrast, { scope: null })
    await page.keyboard.press("Tab")
    const focus = await page.evaluate(measureFocus, { scope: null, limit: 12 })
    return { status: res?.status() ?? null, facts, errors, motion, reducedMotion, contrast, focus }
  } finally {
    await context.close()
  }
}

/** Every anchor of the playground at one width, one page load; a block with a shared part is measured once more without it. */
async function checkPlayground(browser, { url, width, anchors }) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 }, extraHTTPHeaders: headers })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await settle(page)
    await hidePinnedOutside(page, "[data-block-playground]")
    await page.addScriptTag({ content: axeSource })
    await page.keyboard.press("Tab")
    const out = []
    for (const a of anchors) {
      const scope = `#${a.anchor} > div`
      await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), a.anchor)
      await page.waitForTimeout(120)
      const shared = SHARED_PARTS
      const facts = await page.evaluate(measureTarget, { scope, block: true, shared })
      const ownFacts = facts.shared?.length ? await page.evaluate(measureTarget, { scope, block: true, shared, withoutShared: true }) : null
      const motion = await page.evaluate(measureMotion, { scope, shared })
      const contrast = await page.evaluate(measureContrast, { scope, shared })
      const focus = await page.evaluate(measureFocus, { scope, limit: 8, shared })
      out.push({ ...a, facts, ownFacts, motion, contrast, focus })
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    for (const item of out) item.reducedMotion = await page.evaluate(measureMotion, { scope: `#${item.anchor} > div`, shared: SHARED_PARTS })
    return { status: res?.status() ?? null, errors, anchors: out }
  } finally {
    await context.close()
  }
}

/* ------------------------------------------------------------------ the run */

const results = []
const problems = []
const browser = await chromium.launch()
let exitOverride = null

const record = (target, meta, facts, ctx, ownFacts = null) => {
  if (facts?.missing) {
    problems.push(`${target}: nothing to measure (${meta.url ?? meta.anchor})`)
    return
  }
  results.push({ target, ...meta, ...evaluateBlock(facts, ownFacts, { typeScale, ...ctx }) })
}

try {
  if (opts["self-test"] || opts.fixture) {
    const fixtures = opts.fixture
      ? [{ file: path.resolve(opts.fixture), expect: null }]
      : ["bad.html", "good.html"].map((f) => ({ file: path.join(here, "template-check", "fixtures", f), expect: f }))
    for (const fx of fixtures) {
      const name = path.basename(fx.file, ".html")
      for (const width of widths) {
        const m = await checkPage(browser, { url: pathToFileURL(fx.file).href, width })
        record(`fixture/${name}@${width}`, { kind: "fixture", fixture: name, width, url: fx.file }, m.facts, {
          on: "page",
          page: "fixture",
          width,
          errors: m.errors,
          motion: m.motion,
          reducedMotion: m.reducedMotion,
          contrast: m.contrast,
          focus: m.focus,
        })
      }
    }
    if (opts["self-test"]) {
      const html = fs.readFileSync(path.join(here, "template-check", "fixtures", "bad.html"), "utf8")
      const expected = (html.match(/name="template-check-expect" content="([^"]+)"/)?.[1] ?? "").split(",").map((s) => s.trim())
      const failedIn = (name) =>
        new Set(results.filter((t) => t.fixture === name).flatMap((t) => t.results.filter((r) => r.kind === "gate" && !r.pass).map((r) => r.rule)))
      const bad = failedIn("bad")
      const good = failedIn("good")
      const missing = expected.filter((id) => !bad.has(id))
      console.log(`self-test: the bad fixture fails ${bad.size} gate rules: ${[...bad].sort().join(", ")}`)
      if (missing.length) console.log(`  ! expected but not failed: ${missing.join(", ")}`)
      console.log(`self-test: the good fixture fails ${good.size} gate rules${good.size ? `: ${[...good].sort().join(", ")}` : ""}`)
      for (const t of results.filter((x) => x.fixture === "good")) {
        for (const r of t.results.filter((x) => x.kind === "gate" && !x.pass)) for (const f of r.failures) console.log(`  ! ${t.target} ${r.rule}: ${f.detail}`)
      }
      exitOverride = !missing.length && !good.size ? 0 : 1
      console.log(exitOverride === 0 ? "self-test PASS" : "self-test FAIL")
    }
  } else {
    // What the playground lists, as the shots script reads it.
    const labUrl = `${base}/${locale}/template-lab`
    const probe = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: headers })
    const probePage = await probe.newPage()
    const response = await probePage.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch((e) => ({ status: () => `${e.message}` }))
    if (!response || response.status() !== 200) {
      throw Object.assign(new Error(`${labUrl} answered ${response?.status()}: is the storefront running with STOREFRONT_TEMPLATE_PREVIEW=1?`), { exit: 2 })
    }
    await probePage.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
    const anchors = await probePage.$$eval("[data-block-anchor]", (els) =>
      els.map((el) => ({ anchor: el.id, block: el.dataset.blockAnchor, state: el.dataset.blockState }))
    )
    const templates = await probePage.$$eval("[data-template-id]", (els) => els.map((el) => ({ id: el.dataset.templateId, valid: el.dataset.templateValid === "true" })))
    const links = await probePage.$$eval("[data-block-playground] a[href]", (els) => els.map((a) => new URL(a.href).pathname))
    await probe.close()
    const pagePaths = {
      home: `/${locale}`,
      category: links.find((p) => /\/categories\/[^/]+/.test(p)) ?? null,
      product: links.find((p) => /\/products\/[^/]+/.test(p)) ?? null,
    }
    for (const [page, p] of Object.entries(pagePaths)) if (!p) problems.push(`no ${page} link on the playground: the ${page} page of every template is not checked`)

    const pickTemplates = templates.filter((t) => matchesOnly({ kind: "template", template: t.id }, opts.only))
    const pickAnchors = anchors.filter((a) => matchesOnly({ kind: "block", block: a.block, anchor: a.anchor }, opts.only))
    if (opts.only.length && !pickTemplates.length && !pickAnchors.length) {
      throw Object.assign(new Error(`--only ${opts.only.join(",")} names no template and no block of the playground`), { exit: 2 })
    }
    for (const t of pickTemplates.filter((x) => !x.valid)) problems.push(`template ${t.id} is invalid on the playground: not previewed, not checked`)

    for (const width of widths) {
      for (const t of pickTemplates.filter((x) => x.valid)) {
        const facts = {}
        for (const [page, p] of Object.entries(pagePaths)) {
          if (!p) continue
          const url = `${base}${p}?template=${t.id}`
          const m = await checkPage(browser, { url, width })
          if (m.status !== 200) problems.push(`template/${t.id}/${page}@${width}: ${url} answered ${m.status}`)
          facts[page] = m.facts
          record(`template/${t.id}/${page}@${width}`, { kind: "template", template: t.id, page, width, url, status: m.status }, m.facts, {
            on: "page",
            page,
            width,
            errors: m.errors,
            motion: m.motion,
            reducedMotion: m.reducedMotion,
            contrast: m.contrast,
            focus: m.focus,
          })
          console.log(`  ${t.id}/${page}@${width} measured`)
        }
        results.push({ target: `template/${t.id}/pages@${width}`, kind: "template", template: t.id, page: "pages", width, results: evaluatePages(facts) })
      }

      if (pickAnchors.length) {
        const pg = await checkPlayground(browser, { url: labUrl, width, anchors: pickAnchors })
        if (pg.status !== 200) problems.push(`playground@${width}: ${labUrl} answered ${pg.status}`)
        if (!opts.only.length) {
          results.push({ target: `playground@${width}`, kind: "playground", width, url: labUrl, results: evaluateTarget({}, { on: "playground", width, errors: pg.errors }) })
        }
        for (const a of pg.anchors) {
          record(`block/${a.block}${a.state === "empty" ? ":empty" : ""}@${width}`, { kind: "block", block: a.block, anchor: a.anchor, state: a.state, width, url: `${labUrl}#${a.anchor}` }, a.facts, {
            on: "block",
            state: a.state,
            width,
            motion: a.motion,
            reducedMotion: a.reducedMotion,
            contrast: a.contrast,
            focus: a.focus,
          }, a.ownFacts)
        }
        console.log(`  playground@${width}: ${pg.anchors.length} anchors measured`)
      }
    }
  }
} catch (error) {
  problems.push(error.message)
  if (error.exit) exitOverride = 2
  else {
    console.error(error)
    exitOverride = 2
  }
} finally {
  await browser.close()
}

/* ------------------------------------------------------------------ baseline */

const isFixture = Boolean(opts.fixture || opts["self-test"])
const baselineDoc = !isFixture && fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : null
let baseline = new Set(baselineDoc?.failures ?? [])
let { fresh, inherited, known } = compareWithBaseline(results, baseline)

if (opts["write-baseline"] && !isFixture) {
  if (problems.length) {
    console.error("template:check: not writing a baseline over a run that did not check everything:")
    for (const p of problems) console.error(`  ! ${p}`)
    process.exit(2)
  }
  const ran = new Set(results.map((t) => t.target))
  const kept = opts.only.length ? (baselineDoc?.failures ?? []).filter((k) => !ran.has(k.split(" | ")[0])) : []
  const failures = [...new Set([...kept, ...[...fresh, ...inherited, ...known].map((f) => f.key)])].sort()
  fs.mkdirSync(path.dirname(baselineFile), { recursive: true })
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify(
      {
        schema: "upready.template-check-baseline/v1",
        note: "Gate failures the existing variants already had when this baseline was written. template:check fails only on a failure not listed here. Rewrite it with --write-baseline only when a failure is fixed or accepted, never to hide a new one.",
        written: new Date().toISOString(),
        commit,
        base,
        host: opts.host ?? null,
        locale,
        widths,
        failures,
      },
      null,
      2
    )}\n`
  )
  console.log(`baseline: ${failures.length} gate failures → ${baselineFile}`)
  // The run that wrote the baseline is judged against it, like the next run will be.
  baseline = new Set(failures)
  ;({ fresh, inherited, known } = compareWithBaseline(results, baseline))
}
const inheritedKeys = new Set(inherited.map((f) => f.key))
for (const t of results) {
  for (const r of t.results) {
    for (const f of r.failures) {
      const key = failureKey(t.target, r.rule, f.sig)
      f.baseline = baseline.has(key)
      f.inherited = inheritedKeys.has(key)
    }
  }
}

/* ------------------------------------------------------------------ report */

const outDir = path.resolve(
  opts.out ??
    path.join(repoRoot, "artifacts", "templates", "check", today, isFixture ? "fixture" : opts.only.length ? `only-${opts.only.join("+").replace(/[^a-z0-9+-]+/gi, "-")}` : "")
)
fs.mkdirSync(outDir, { recursive: true })

const gateFails = results.flatMap((t) => t.results.filter((r) => r.kind === "gate" && !r.pass).map((r) => ({ t, r })))
const reportFails = results.flatMap((t) => t.results.filter((r) => r.kind === "report" && !r.pass).map((r) => ({ t, r })))
const status = exitOverride ?? (fresh.length ? 1 : 0)
const verdict = opts["self-test"]
  ? `SELF-TEST ${status === 0 ? "PASS" : "FAIL"}`
  : status === 2
    ? "NOT CHECKED"
    : status === 1
      ? "FAIL"
      : "PASS"

const json = {
  schema: "upready.template-check-report/v1",
  date: today,
  commit,
  base: isFixture ? null : base,
  host: opts.host ?? null,
  locale,
  widths,
  only: opts.only,
  verdict,
  exit: status,
  baseline: isFixture ? null : { file: baselineFile, failures: baseline.size, found: Boolean(baselineDoc) },
  summary: {
    targets: results.length,
    newGateFailures: fresh.length,
    inheritedGateFailures: inherited.length,
    baselineGateFailures: known.length,
    reportFailures: reportFails.length,
  },
  problems,
  thresholds: { ...THRESHOLDS, typeScale },
  rules: RULES,
  notPorted: NOT_PORTED,
  newFailures: fresh,
  inheritedFailures: inherited,
  targets: results,
}
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(json, null, 2)}\n`)

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
const fmt = (v) => (v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v))
const perRule = RULES.map((rule) => {
  const rows = results.flatMap((t) => t.results.filter((r) => r.rule === rule.id))
  const failedTargets = rows.filter((r) => !r.pass)
  const newCount = fresh.filter((f) => f.rule === rule.id).length
  const inheritedCount = inherited.filter((f) => f.rule === rule.id).length
  const knownCount = known.filter((f) => f.rule === rule.id).length
  return { rule, checked: rows.length, passed: rows.length - failedTargets.length, failed: failedTargets.length, newCount, inheritedCount, knownCount }
})
const ru = []
ru.push(`# template:check — ${today}`)
ru.push("")
ru.push(
  `**Итог: ${verdict}.** Проверено целей: ${results.length} (шаблоны × страницы, блоки площадки, ширины ${widths.join(" и ")} px). ` +
    (isFixture
      ? `Фикстура, без базы: отказов gate ${gateFails.length}.`
      : `Новых отказов gate: **${fresh.length}**; унаследованных (известный долг общих частей витрины на страницах шаблона и в блоках): ${inherited.length}; ` +
        `отказов из базы (известный долг существующих вариантов): ${known.length}; ` +
        `report-правил вне порога: ${reportFails.length}.`)
)
if (!isFixture) {
  ru.push(
    fresh.length
      ? "Что делать: каждый новый отказ ниже — с id правила, целью и замером. Чинить блок или шаблон; базу не переписывать, чтобы спрятать отказ."
      : "Что делать: ничего, новых отказов нет. Отказы из базы — долг существующих вариантов композиции, он виден в report.json."
  )
  if (inherited.length) {
    ru.push(
      "Унаследованные не валят прогон: база держит тот же отказ (правило и замер) на той же странице и ширине другого шаблона, " +
        "его дают общие части витрины, а не этот шаблон; в блоке — отказ, которого нет, когда элементы внутри переиспользованной " +
        "части витрины (колонка «Shared part») не замеряются, и который база держит для блока той же ширины. Всё остальное блок " +
        "отвечает сам. Они перечислены отдельной таблицей ниже."
    )
  }
}
if (problems.length) ru.push(`Не проверено: ${problems.join("; ")}.`)
ru.push("")
ru.push(`Commit ${commit} · ${isFixture ? "fixtures" : `${base}${opts.host ? ` as ${opts.host}` : ""} · locale ${locale}`}${opts.only.length ? ` · --only ${opts.only.join(",")}` : ""} · baseline ${isFixture ? "none" : `${baseline.size} keys`} · exit ${status}`)
ru.push("")
ru.push("## Rules")
ru.push("")
ru.push("| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Inherited failures | Baseline failures |")
ru.push("|---|---|---|---|---|---|---|---|---|")
for (const p of perRule) {
  ru.push(`| ${p.rule.id} | ${p.rule.kind} | ${esc(p.rule.threshold)} | ${p.checked} | ${p.passed} | ${p.failed} | ${p.newCount} | ${p.inheritedCount} | ${p.knownCount} |`)
}
ru.push("")
ru.push(`Not ported from the lab: ${NOT_PORTED.map((n) => `${n.id} (${n.why})`).join("; ")}.`)
ru.push("")
const listed = isFixture ? gateFails.flatMap(({ t, r }) => r.failures.map((f) => ({ target: t.target, rule: r.rule, detail: f.detail }))) : fresh
ru.push(isFixture ? "## Gate failures" : "## New gate failures")
ru.push("")
if (!listed.length) ru.push("None.")
else {
  ru.push("| Target | Rule | Measured |")
  ru.push("|---|---|---|")
  for (const f of listed) ru.push(`| ${esc(f.target)} | ${f.rule} | ${esc(f.detail)} |`)
}
ru.push("")
if (!isFixture) {
  ru.push("## Inherited gate failures")
  ru.push("")
  if (!inherited.length) ru.push("None.")
  else {
    ru.push("| Target | Rule | Measured | Shared part | Baseline holds it for |")
    ru.push("|---|---|---|---|---|")
    for (const f of inherited) ru.push(`| ${esc(f.target)} | ${f.rule} | ${esc(f.detail)} | ${esc(f.part ?? "–")} | ${esc(f.from.join(", "))} |`)
  }
  ru.push("")
}
ru.push("## Targets")
ru.push("")
ru.push("| Target | Gate rules failed (new / inherited / baseline) | Report rules out of range |")
ru.push("|---|---|---|")
for (const t of results) {
  const g = t.results.filter((r) => r.kind === "gate" && !r.pass)
  const count = (r, pick) => r.failures.filter(pick).length
  const gText = g
    .map((r) => `${r.rule} (${count(r, (f) => !f.baseline && !f.inherited)}/${count(r, (f) => f.inherited)}/${count(r, (f) => f.baseline)})`)
    .join(", ")
  const rText = t.results.filter((r) => r.kind === "report").map((r) => `${r.rule} ${r.pass ? "ok" : "out"} ${fmt(r.value)}`).join("; ")
  ru.push(`| ${esc(t.target)} | ${esc(gText || "none")} | ${esc(rText || "–")} |`)
}
ru.push("")
ru.push("Per target and per rule, pass or fail with the measured value and every failure: `report.json`.")
fs.writeFileSync(path.join(outDir, "report.md"), `${ru.join("\n")}\n`)

console.log(
  isFixture
    ? `template:check ${verdict}: ${results.length} fixture targets, ${fresh.length} gate failures (no baseline) → ${path.join(outDir, "report.md")}`
    : `template:check ${verdict}: ${results.length} targets, ${fresh.length} new gate failures, ${inherited.length} inherited, ${known.length} in the baseline → ${path.join(outDir, "report.md")}`
)
for (const f of fresh.slice(0, 40)) console.log(`  ✗ ${f.rule}  ${f.target}  ${f.detail}`)
if (fresh.length > 40) console.log(`  … ${fresh.length - 40} more in report.md`)
for (const p of problems) console.log(`  ! ${p}`)
process.exit(status)
