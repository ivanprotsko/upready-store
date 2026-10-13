#!/usr/bin/env node
/**
 * Keeps template work out of the branches that deploy (t-2026-10-12-33). Ivan, 12.10.2026: «всё что касается
 * шаблонов должно быть в отдельной ветке, и оно не должно попадать в ветку, которая идет на деплой». Template and
 * block work lives on templates/main and templates/<slug> (AGENTS.md, «`templates/*` Branches»).
 *
 *   node .github/scripts/templates-guard.mjs --base <base ref> --head <head ref> --labels '<JSON array of names>' [--pr <number>]
 *
 * Exit 1 when a templates/* branch heads for dev or main without the label ivan-ok, exit 0 otherwise, exit 2 on a
 * bad call. .github/workflows/templates-guard.yml runs it on every pull request into dev, main and templates/**.
 * With `--pr` it reads the pull request's base and labels from the API when it runs (see `main`).
 *
 *   git diff --name-only HEAD^1 HEAD | node .github/scripts/templates-guard.mjs --scope
 *
 * Prints `backend=`, `catalogue=`, `panel=` and `deploy=` lines (true or false) for $GITHUB_OUTPUT. The Template
 * Scope job of pr-checks.yml uses them to run Backend, Backend Catalogue, Panel And Repository and Deploy Checks on a
 * pull request into templates/** only when it changes what those jobs check. When the only backend file it changes is
 * the generated catalogue of templates, as every block or template pull request does, it runs Backend Catalogue, the
 * backend's specs that read that file, instead of the whole Backend.
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
// pnpm templates:export writes it from the storefront's block registry, and the storefront's catalog-export test holds
// it equal to the export (t-2026-10-12-33 ci-catalog-scope).
export const CATALOGUE = "apps/backend/src/api/tenants/home/template/catalog.generated.json"
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

/**
 * { backend, catalogue, panel, deploy }: which heavy job of pr-checks.yml the changed files still need. The catalogue
 * alone among the backend's files needs Backend Catalogue; beside any other backend file Backend runs, and its unit
 * suites hold the catalogue's specs. A change to the workflows or the root install runs both.
 */
export function scopeOf(files) {
  const touches = (among) => (prefix) => among.some((file) => (prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix))
  const backend = SCOPES.backend.some(touches(files.filter((file) => file !== CATALOGUE)))
  return {
    backend,
    catalogue: EVERY_JOB.some(touches(files)) || (files.includes(CATALOGUE) && !backend),
    panel: SCOPES.panel.some(touches(files)),
    deploy: SCOPES.deploy.some(touches(files)),
  }
}

function parseArgs(argv) {
  const args = { scope: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === "--scope") args.scope = true
    else if (["--base", "--head", "--labels", "--pr"].includes(flag) && i + 1 < argv.length) args[flag.slice(2)] = argv[++i]
    else throw new Error(`unknown argument ${flag}`)
  }
  return args
}

/**
 * { base, labels } of the pull request as it is now. An event's payload is a snapshot, and a rerun replays it, so a
 * run that went red before Ivan's label would stay red on a rerun, and a run that starts late would judge an old base.
 */
export async function currentPull({ repo, pr, token, apiUrl = "https://api.github.com", fetchImpl = fetch }) {
  const where = `GET /repos/${repo}/pulls/${pr}`
  const response = await fetchImpl(`${apiUrl}/repos/${repo}/pulls/${pr}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  })
  if (!response.ok) throw new Error(`${where}: HTTP ${response.status}`)
  const body = await response.json()
  const labels = (body.labels ?? []).map((label) => label?.name)
  if (typeof body.base?.ref !== "string" || !labels.every((name) => typeof name === "string")) {
    throw new Error(`${where}: no base ref or label names in the answer`)
  }
  return { base: body.base.ref, labels }
}

/**
 * The command line. With `--pr`, GITHUB_TOKEN and GITHUB_REPOSITORY set (the workflow sets them), a templates/* head
 * is judged by the base and labels the API returns now; when that call fails, by the event's `--base` and `--labels`.
 */
export async function main(argv, { env = process.env, fetchImpl = fetch, log = console.log, error = console.error } = {}) {
  let args
  try {
    args = parseArgs(argv)
  } catch (failure) {
    error(`templates-guard: ${failure.message}`)
    return 2
  }
  if (args.scope) {
    const files = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
    const scope = scopeOf(files)
    for (const [job, needed] of Object.entries(scope)) log(`${job}=${needed}`)
    error(`templates-guard --scope: ${files.length} changed file(s), ${JSON.stringify(scope)}`)
    return 0
  }
  if (!args.base || !args.head || args.labels === undefined) {
    error("usage: templates-guard.mjs --base <ref> --head <ref> --labels '<JSON array>' [--pr <number>] | --scope")
    return 2
  }
  let labels
  try {
    labels = JSON.parse(args.labels)
  } catch {
    labels = null
  }
  if (!Array.isArray(labels) || !labels.every((name) => typeof name === "string")) {
    error(`templates-guard: --labels must be a JSON array of label names, got ${args.labels}`)
    return 2
  }
  let base = args.base
  if (args.head.startsWith(TEMPLATE_PREFIX) && args.pr && env.GITHUB_TOKEN && env.GITHUB_REPOSITORY) {
    try {
      const now = await currentPull({
        repo: env.GITHUB_REPOSITORY,
        pr: args.pr,
        token: env.GITHUB_TOKEN,
        apiUrl: env.GITHUB_API_URL || undefined,
        fetchImpl,
      })
      ;({ base, labels } = now)
      log(`templates-guard: #${args.pr} now has base ${base} and labels ${JSON.stringify(labels)}`)
    } catch (failure) {
      log(`::warning title=Templates Guard::could not read #${args.pr} now (${failure.message}), the event's base and labels decide`)
    }
  }
  const { ok, message } = verdict({ base, head: args.head, labels })
  if (ok) {
    log(message)
    return 0
  }
  log(`::error title=Templates Guard::${message.split("\n")[0]} ${RULE}.`)
  log(message)
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
