#!/usr/bin/env node
// Builds the documentation site from the guide (t-2026-10-09-104): VitePress with its default theme (.vitepress/config.mjs),
// once for every brand of brands.json and for both places the site is served from.
//
//   node docs/owner-guide/publish.mjs --out <dir> [--only <brand>]
//
//   <dir>/<brand>/root/          base "/", the docs hosts (docs.upready.dev, a customer's docs.<their domain>)
//   <dir>/<brand>/panel/help/    base "/help/", the help inside the panel
//   <dir>/brands.map             the body of an nginx `map $host $help_brand`: the default brand and a line per host
//
// A brand is named after its logo file (brands/cherkashino.svg is «cherkashino»), so two hosts with the same name and
// logo share one build. nginx picks the folder by the host (apps/tenant-panel/nginx.conf), so a page carries one brand
// and never swaps it in the browser. apps/tenant-panel/Dockerfile runs this after `vite build`. Any static server that
// tries `<path>.html` shows a build as well.
//
// Refuses before building when a page shows a frame that is not in guide/shots or a row of brands.json is broken.
// VitePress itself refuses a link to a page that does not exist, and check.mjs checks the anchors.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { GUIDE_DIR, REPO, SHOTS_DIR, brandProblems, imageRefs, parseArgs, readBrands } from "./lib.mjs"

const args = parseArgs(process.argv.slice(2), { out: "value", only: "value" })
if (!args.out) throw new Error("нужен --out <папка>")
const out = resolve(args.out)

const problems = [
  ...imageRefs()
    .filter(({ id }) => !existsSync(join(SHOTS_DIR, `${id}.webp`)))
    .map((m) => `нет кадра ${m.id}.webp (его показывает guide/${m.page})`),
  ...brandProblems(),
]
if (problems.length) {
  for (const p of problems) console.error(p)
  process.exit(1)
}

const keyOf = (b) => b.logo.split("/").pop().replace(/\.[a-z]+$/, "")
const brands = readBrands()
const rows = [brands.default, ...Object.values(brands.hosts)]
const builds = new Map(rows.map((b) => [keyOf(b), b]))
for (const b of rows) if (builds.get(keyOf(b)).name !== b.name) throw new Error(`brands.json: у логотипа ${b.logo} два названия`)
if (args.only && !builds.has(args.only)) throw new Error(`--only ${args.only}: такого бренда нет; есть: ${[...builds.keys()].join(", ")}`)

// vitepress is a dependency of the panel (the image installs its packages), and the guide borrows it from there.
const require = createRequire(join(REPO, "apps/tenant-panel/package.json"))
const pkg = require.resolve("vitepress/package.json")
const bin = join(dirname(pkg), require(pkg).bin.vitepress)

for (const [key, brand] of builds) {
  if (args.only && key !== args.only) continue
  for (const [base, dir] of [["/", join(out, key, "root")], ["/help/", join(out, key, "panel", "help")]]) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const run = spawnSync(process.execPath, [bin, "build", GUIDE_DIR, "--outDir", dir], {
      env: { ...process.env, HELP_BRAND: JSON.stringify(brand), HELP_BASE: base },
      encoding: "utf8",
    })
    if (run.status !== 0) {
      console.error(run.stdout + run.stderr)
      throw new Error(`сборка ${key} ${base} не прошла`)
    }
    console.log(`справка ${brand.name}, ${base} → ${dir}`)
  }
}

const map = [`default ${keyOf(brands.default)};`, ...Object.entries(brands.hosts).map(([host, b]) => `${host} ${keyOf(b)};`)]
writeFileSync(join(out, "brands.map"), `# Written by docs/owner-guide/publish.mjs from brands.json.\n${map.join("\n")}\n`)
console.log(`brands.map: хостов ${map.length - 1}, по умолчанию ${keyOf(brands.default)}`)
