// node --test .github/scripts/__tests__/templates-guard.test.mjs
// The verdict and the scope as functions, then the real script through its command line for the exit codes.
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { LABEL, currentPull, main, scopeOf, verdict } from "../templates-guard.mjs"

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates-guard.mjs")
const run = (args, input = "") => spawnSync("node", [script, ...args], { encoding: "utf8", input })
const guard = (base, head, labels) => run(["--base", base, "--head", head, "--labels", JSON.stringify(labels)])

test("templates/x into dev is red without ivan-ok and green with it", () => {
  const refused = verdict({ base: "dev", head: "templates/x", labels: ["design"] })
  assert.equal(refused.ok, false)
  assert.match(refused.message, /only with the label ivan-ok, and only Ivan sets it/)
  assert.match(refused.message, /Only Ivan sets ivan-ok/)
  assert.match(refused.message, /не должно попадать в ветку, которая идет на деплой/)
  assert.equal(verdict({ base: "dev", head: "templates/x", labels: ["design", LABEL] }).ok, true)
})

test("templates/x into main is red without ivan-ok too", () => {
  assert.equal(verdict({ base: "main", head: "templates/x", labels: [] }).ok, false)
  assert.equal(verdict({ base: "main", head: "templates/x", labels: [LABEL] }).ok, true)
})

test("templates/x into templates/main is green", () => {
  assert.equal(verdict({ base: "templates/main", head: "templates/x", labels: [] }).ok, true)
})

test("feat/x into dev is green", () => {
  assert.equal(verdict({ base: "dev", head: "feat/x", labels: [] }).ok, true)
})

test("dev into templates/main is green", () => {
  assert.equal(verdict({ base: "templates/main", head: "dev", labels: [] }).ok, true)
})

test("a branch that only contains the word templates is not a templates/* branch", () => {
  assert.equal(verdict({ base: "dev", head: "feat/templates-guard", labels: [] }).ok, true)
  assert.equal(verdict({ base: "dev", head: "ci/templates/x", labels: [] }).ok, true)
})

test("the command line exits 1 on a refusal and 0 otherwise", () => {
  const refused = guard("dev", "templates/x", [])
  assert.equal(refused.status, 1)
  assert.match(refused.stdout, /^::error title=Templates Guard::templates\/x → dev: refused/)
  assert.equal(guard("dev", "templates/x", [LABEL]).status, 0)
  assert.equal(guard("templates/main", "templates/x", []).status, 0)
  assert.equal(guard("dev", "feat/x", []).status, 0)
  assert.equal(guard("templates/main", "dev", []).status, 0)
})

test("the command line reads the labels as GitHub's toJSON prints them", () => {
  const pretty = `[\n  "design",\n  "${LABEL}"\n]`
  assert.equal(run(["--base", "dev", "--head", "templates/x", "--labels", pretty]).status, 0)
  assert.equal(run(["--base", "dev", "--head", "templates/x", "--labels", "[]"]).status, 1)
})

test("the command line exits 2 on a bad call rather than passing", () => {
  assert.equal(run(["--base", "dev", "--head", "templates/x"]).status, 2)
  assert.equal(run(["--base", "dev", "--head", "templates/x", "--labels", "ivan-ok"]).status, 2)
  assert.equal(run(["--base", "dev", "--head", "templates/x", "--labels", "[1]"]).status, 2)
  assert.equal(run(["--base", "dev", "--labels", "[]"]).status, 2)
  assert.equal(run(["--bogus"]).status, 2)
})

test("a storefront-only change needs no heavy job", () => {
  assert.deepEqual(scopeOf(["apps/storefront/src/modules/home/templates/index.tsx", "apps/storefront/public/a.png"]), {
    backend: false,
    panel: false,
    deploy: false,
  })
})

test("each heavy job comes back with the paths it checks", () => {
  assert.deepEqual(scopeOf(["apps/backend/src/api/route.ts"]), { backend: true, panel: false, deploy: false })
  assert.deepEqual(scopeOf(["apps/tenant-panel/src/App.tsx"]), { backend: false, panel: true, deploy: false })
  assert.deepEqual(scopeOf(["apps/storefront/src/i18n/config.ts"]), { backend: false, panel: true, deploy: false })
  assert.deepEqual(scopeOf(["docs/evidence/t-1/shots/a.png"]), { backend: false, panel: true, deploy: false })
  assert.deepEqual(scopeOf(["deploy/scripts/deploy-instance.sh"]), { backend: false, panel: false, deploy: true })
})

test("a change to the workflows or the root install runs every heavy job", () => {
  for (const file of [".github/workflows/pr-checks.yml", "pnpm-lock.yaml", "package.json"]) {
    assert.deepEqual(scopeOf([file]), { backend: true, panel: true, deploy: true }, file)
  }
  assert.deepEqual(scopeOf(["apps/storefront/package.json"]), { backend: false, panel: false, deploy: false })
})

test("--scope prints the lines $GITHUB_OUTPUT takes", () => {
  const scope = run(["--scope"], "apps/storefront/src/a.tsx\napps/backend/src/b.ts\n")
  assert.equal(scope.status, 0)
  assert.equal(scope.stdout, "backend=true\npanel=false\ndeploy=false\n")
})

// The workflow passes --pr with GITHUB_TOKEN and GITHUB_REPOSITORY set: the API's answer decides over the event's.
const env = { GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_API_URL: "https://api.test" }
const answer = (base, labels) => async () => ({ ok: true, json: async () => ({ base: { ref: base }, labels: labels.map((name) => ({ name })) }) })
const broken = async () => ({ ok: false, status: 502, json: async () => ({}) })
const never = async () => {
  throw new Error("the API must not be called")
}
const quiet = { log: () => {}, error: () => {} }
const judge = (args, fetchImpl, extra = env) => main(args, { env: extra, fetchImpl, ...quiet })
const payload = (base, labels) => ["--base", base, "--head", "templates/x", "--labels", JSON.stringify(labels), "--pr", "7"]

test("currentPull reads the base and the label names, and throws on an error answer", async () => {
  let asked
  const pull = await currentPull({
    repo: "o/r",
    pr: "7",
    token: "t",
    apiUrl: "https://api.test",
    fetchImpl: async (url, init) => {
      asked = { url, auth: init.headers.authorization }
      return answer("dev", ["design", LABEL])()
    },
  })
  assert.deepEqual(pull, { base: "dev", labels: ["design", LABEL] })
  assert.deepEqual(asked, { url: "https://api.test/repos/o/r/pulls/7", auth: "Bearer t" })
  await assert.rejects(currentPull({ repo: "o/r", pr: "7", token: "t", fetchImpl: broken }), /HTTP 502/)
})

test("ivan-ok set after the event turns a rerun green, and a removed one turns it red", async () => {
  assert.equal(await judge(payload("dev", []), answer("dev", [LABEL])), 0)
  assert.equal(await judge(payload("dev", [LABEL]), answer("dev", [])), 1)
})

test("a base changed after the event is judged as it is now", async () => {
  assert.equal(await judge(payload("templates/main", []), answer("dev", [])), 1)
  assert.equal(await judge(payload("dev", []), answer("templates/main", [])), 0)
})

test("when the API fails, the event's base and labels decide", async () => {
  assert.equal(await judge(payload("dev", []), broken), 1)
  assert.equal(await judge(payload("dev", [LABEL]), broken), 0)
})

test("the API is not called without a token, without --pr, or for a head outside templates/*", async () => {
  assert.equal(await judge(payload("dev", []), never, { GITHUB_REPOSITORY: "o/r" }), 1)
  assert.equal(await judge(["--base", "dev", "--head", "templates/x", "--labels", "[]"], never), 1)
  assert.equal(await judge(["--base", "dev", "--head", "feat/x", "--labels", "[]", "--pr", "7"], never), 0)
})
