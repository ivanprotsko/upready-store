#!/usr/bin/env node
/**
 * Keeps template work out of the branches that deploy (t-2026-10-12-33). Ivan, 12.10.2026: «всё что касается
 * шаблонов должно быть в отдельной ветке, и оно не должно попадать в ветку, которая идет на деплой». Template and
 * block work lives on templates/main and templates/<slug> (AGENTS.md, «`templates/*` Branches»).
 *
 *   node .github/scripts/templates-guard.mjs --base <base ref> --head <head ref> --labels '<JSON array of names>'
 *
 * Exit 1 when a templates/* branch heads for dev or main without the label ivan-ok, exit 0 otherwise, exit 2 on a
 * bad call. .github/workflows/templates-guard.yml runs it on every pull request into dev, main and templates/**.
 *
 *   git diff --name-only HEAD^1 HEAD | node .github/scripts/templates-guard.mjs --scope
 *
 * Prints `backend=`, `panel=` and `deploy=` lines (true or false) for $GITHUB_OUTPUT. The Template Scope job of
 * pr-checks.yml uses them to run Backend, Panel And Repository and Deploy Checks on a pull request into
 * templates/** only when it changes what those jobs check.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const DEPLOY_BRANCHES = ["dev", "main"]
export const TEMPLATE_PREFIX = "templates/"
export const LABEL = "ivan-ok"
export const RULE = `a ${TEMPLATE_PREFIX}* branch enters dev or main only with the label ${LABEL}, and only Ivan sets it`
export const IVAN =
  "Ivan, 12.10.2026: «всё что касается шаблонов должно быть в отдельной ветке, и оно не должно попадать в ветку, которая идет на деплой»"

/** { ok, message }: whether a pull request from `head` into `base` with `labels` may go on. */
export function verdict({ base, head, labels }) {
  const pair = `${head} → ${base}`
  if (!DEPLOY_BRANCHES.includes(base) || !head.startsWith(TEMPLATE_PREFIX)) {
    return { ok: true, message: `${pair}: not a ${TEMPLATE_PREFIX}* branch heading for dev or main, nothing to guard` }
  }
  if (labels.includes(LABEL)) return { ok: true, message: `${pair}: carries ${LABEL}, Ivan's word to let it in` }
  return {
    ok: false,
    message: [
      `${pair}: refused by the Templates Guard.`,
      `The rule (AGENTS.md, «${TEMPLATE_PREFIX}* Branches»): ${RULE}.`,
      `Only Ivan sets ${LABEL}. No agent and no lead adds it.`,
      IVAN,
      `Template work goes to templates/main. Retarget this pull request there.`,
    ].join("\n"),
  }
}

// Panel And Repository also compares storefront files with their copies in the panel and the school
// (scripts/check-locale-catalogs.mjs, scripts/check-shared-markdown.mjs) and reads docs/evidence
// (scripts/check-evidence-manifest.mjs), so those paths run it too. A change to the workflows or to what the
// root installs runs every job.
const EVERY_JOB = [".github/", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]
export const SCOPES = {
  backend: ["apps/backend/", ...EVERY_JOB],
  panel: [
    "apps/tenant-panel/",
    "apps/school/",
    "apps/shared/",
    "scripts/",
    "docs/evidence/",
    "apps/storefront/src/i18n/config.ts",
    "apps/storefront/src/lib/util/markdown.ts",
    "apps/storefront/src/lib/util/lesson-body.ts",
    ...EVERY_JOB,
  ],
  deploy: ["deploy/", ...EVERY_JOB],
}

/** { backend, panel, deploy }: which heavy job of pr-checks.yml the changed files still need. */
export function scopeOf(files) {
  const touches = (prefix) => files.some((file) => (prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix))
  return Object.fromEntries(Object.entries(SCOPES).map(([job, prefixes]) => [job, prefixes.some(touches)]))
}

function parseArgs(argv) {
  const args = { scope: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === "--scope") args.scope = true
    else if (["--base", "--head", "--labels"].includes(flag) && i + 1 < argv.length) args[flag.slice(2)] = argv[++i]
    else throw new Error(`unknown argument ${flag}`)
  }
  return args
}

function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`templates-guard: ${error.message}`)
    return 2
  }
  if (args.scope) {
    const files = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
    const scope = scopeOf(files)
    for (const [job, needed] of Object.entries(scope)) console.log(`${job}=${needed}`)
    console.error(`templates-guard --scope: ${files.length} changed file(s), ${JSON.stringify(scope)}`)
    return 0
  }
  if (!args.base || !args.head || args.labels === undefined) {
    console.error("usage: templates-guard.mjs --base <ref> --head <ref> --labels '<JSON array>' | --scope")
    return 2
  }
  let labels
  try {
    labels = JSON.parse(args.labels)
  } catch {
    labels = null
  }
  if (!Array.isArray(labels) || !labels.every((name) => typeof name === "string")) {
    console.error(`templates-guard: --labels must be a JSON array of label names, got ${args.labels}`)
    return 2
  }
  const { ok, message } = verdict({ base: args.base, head: args.head, labels })
  if (ok) {
    console.log(message)
    return 0
  }
  console.log(`::error title=Templates Guard::${message.split("\n")[0]} ${RULE}.`)
  console.log(message)
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
