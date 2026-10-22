#!/usr/bin/env node
// t-2026-10-20-23: builds the owner-cabinet prototype the way the rule-60 kit does — one JSON
// screen file per state, `$ref` for shared data, components as plain functions, every page
// self-contained (styles inlined, nothing from the network, no state code). The colours are the
// tenant panel's own theme, read from this branch: apps/tenant-panel/src/theme/hub-theme.css.
// The data is the contract's examples: docs/owner-cabinet/contract/example.*.json.
//
//   node artifacts/mockups/2026-10-20-owner-cabinet/build.mjs            → dist/<state>.html
//   node artifacts/mockups/2026-10-20-owner-cabinet/build.mjs --publish  → also the proto-viewer work
//
// Publishing writes the root of the work (the current version) and its snapshot versions/<n>/, n from
// prototype.json's `version`, the way proto-viewer's version.mjs lays a version out. It never removes
// a file there: earlier versions, review.jsonl and Ivan's review-files stay as they are.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { components } from "./src/components.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "../../..")
const WORK_ID = "upready-store-t-2026-10-20-23-owner-cabinet"
const PUBLISH_ROOT = "/Users/ivanprotsko/upready/evidence/proto"

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

// `{ "$ref": "<path>#/<pointer>" }`, the path relative to the file holding it. Copies, never filters.
const inline = (value, base) => {
  if (Array.isArray(value)) return value.map((item) => inline(item, base))
  if (!value || typeof value !== "object") return value
  if (typeof value.$ref === "string") {
    const [file, pointer = ""] = value.$ref.split("#")
    const path = resolve(base, file)
    const target = pointer
      .split("/")
      .filter(Boolean)
      .reduce((at, part) => {
        if (at === undefined) throw new Error(`${value.$ref}: no ${part}`)
        return at[part]
      }, readJson(path))
    return inline(target, dirname(path))
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inline(item, base)]))
}

const render = (call) => {
  const component = components[call.component]
  if (!component) throw new Error(`unknown component ${call.component}`)
  const props = { ...call.props }
  if (Array.isArray(props.body)) props.body = props.body.map(render).join("")
  if (props.bar?.component) props.bar = render(props.bar)
  return component(props)
}

const theme = readFileSync(join(repo, "apps/tenant-panel/src/theme/hub-theme.css"), "utf8")
const css = readFileSync(join(here, "src/panel.css"), "utf8")

// The one script a page carries: the colour scheme from `?scheme=light|dark` (else the OS), and the
// same query kept on the links between the states. No state of the screen lives in it.
const schemeScript = `(()=>{const q=new URLSearchParams(location.search).get("scheme");const d=q?q==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);addEventListener("DOMContentLoaded",()=>{if(!location.search)return;for(const a of document.querySelectorAll('a[href$=".html"]'))a.href=a.getAttribute("href")+location.search})})()`

const page = ({ title, html }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script>${schemeScript}</script>
<style>${theme}
${css}</style>
</head>
<body>
${html}
<script src="/proto-anchor.js"></script>
</body>
</html>
`

const screensDir = join(here, "screens")
const prototype = readJson(join(screensDir, "prototype.json"))
const dist = join(here, "dist")
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

for (const state of prototype.states) {
  const screen = inline(readJson(join(screensDir, `${state.id}.json`)), screensDir)
  const html = render({ component: screen.template, props: screen.props })
  writeFileSync(join(dist, `${state.id}.html`), page({ title: screen.title, html }))
}
console.log(`built ${prototype.states.length} states into ${dist}`)

if (process.argv.includes("--publish")) {
  const target = join(PUBLISH_ROOT, WORK_ID)
  const snapshot = join(target, "versions", String(prototype.version.n))
  if (existsSync(snapshot)) throw new Error(`${snapshot} exists: a published version is never rewritten`)
  mkdirSync(snapshot, { recursive: true })
  for (const file of readdirSync(dist)) {
    cpSync(join(dist, file), join(target, file))
    cpSync(join(dist, file), join(snapshot, file))
  }
  const proto = {
    id: WORK_ID,
    title: prototype.title,
    project: "upready-store",
    task: "t-2026-10-20-23",
    author: "opus-t23-boat",
    date: prototype.date,
    note: prototype.note,
    version: { n: prototype.version.n, date: new Date().toISOString(), note: prototype.version.note },
    schemeParam: "scheme",
    variants: [{ id: "a", title: "Вариант A" }],
    states: prototype.states.map(({ id, title, note, page: pageName, option }) => ({
      id,
      title,
      note,
      page: pageName,
      ...(option ? { option } : {}),
    })),
    mocks: prototype.states.flatMap(({ id }) => [
      { variant: "a", state: id, device: "desktop", src: `${id}.html`, width: 1280 },
      { variant: "a", state: id, device: "mobile", src: `${id}.html`, width: 390 },
    ]),
    comments: prototype.comments,
  }
  writeFileSync(join(target, "proto.json"), `${JSON.stringify(proto, null, 2)}\n`)
  writeFileSync(join(snapshot, "proto.json"), `${JSON.stringify(proto, null, 2)}\n`)
  console.log(`published ${target} and ${snapshot}`)
}
