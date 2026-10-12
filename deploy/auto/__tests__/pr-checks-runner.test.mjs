// Where the jobs of .github/workflows run (t-2026-10-12-30, point 11): a dependabot pull request never lands
// on the single self-hosted runner [self-hosted, upready-store], every other run of PR Checks still does.
// A static check of the YAML: each job's `runs-on` is read from the file and its expression evaluated for
// the events that start the workflow. The evaluator covers the part of GitHub's expression language the
// workflows use (literals, github.*, ! == != && ||, startsWith, endsWith, contains, fromJSON, format), with
// GitHub's rules: `&&` and `||` return an operand, strings compare without case. No network, no package.
//
//   node --test deploy/auto/__tests__/pr-checks-runner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = path.resolve(here, "..", "..", "..", ".github", "workflows");
const SELF_HOSTED = ["self-hosted", "upready-store"];

// ------------------------------------------------------------- the evaluator
const TOKEN = /\s*(?:('(?:[^']|'')*')|(-?\d+(?:\.\d+)?)|(==|!=|&&|\|\||[!(),])|([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*))/y;
function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.trimEnd().length) {
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`cannot read the expression at ${TOKEN.lastIndex}: ${src}`);
    if (m[1] !== undefined) out.push({ str: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2] !== undefined) out.push({ num: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ op: m[3] });
    else out.push({ id: m[4] });
  }
  return out;
}
const truthy = (v) => !(v === false || v === null || v === undefined || v === 0 || v === "" || Number.isNaN(v));
const text = (v) => (v === null || v === undefined ? "" : String(v));
const same = (a, b) => (typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b);
const FUNCTIONS = {
  startswith: (a, b) => text(a).toLowerCase().startsWith(text(b).toLowerCase()),
  endswith: (a, b) => text(a).toLowerCase().endsWith(text(b).toLowerCase()),
  contains: (a, b) => (Array.isArray(a) ? a.some((x) => same(x, b)) : text(a).toLowerCase().includes(text(b).toLowerCase())),
  fromjson: (s) => JSON.parse(s),
  format: (f, ...args) => text(f).replace(/\{(\d+)\}/g, (_, i) => text(args[Number(i)])),
};
function evaluate(src, context) {
  const t = tokenize(src);
  let i = 0;
  const peek = (op) => t[i]?.op === op;
  const take = (op) => { if (!peek(op)) throw new Error(`expected ${op} in ${src}`); i += 1; };
  const or = () => { let v = and(); while (peek("||")) { i += 1; const r = and(); v = truthy(v) ? v : r; } return v; };
  const and = () => { let v = cmp(); while (peek("&&")) { i += 1; const r = cmp(); v = truthy(v) ? r : v; } return v; };
  const cmp = () => {
    let v = unary();
    while (peek("==") || peek("!=")) { const op = t[i].op; i += 1; const r = unary(); v = op === "==" ? same(v, r) : !same(v, r); }
    return v;
  };
  const unary = () => { if (peek("!")) { i += 1; return !truthy(unary()); } return primary(); };
  const primary = () => {
    const k = t[i++];
    if (!k) throw new Error(`the expression ends early: ${src}`);
    if ("str" in k) return k.str;
    if ("num" in k) return k.num;
    if (k.op === "(") { const v = or(); take(")"); return v; }
    if (k.id === "true") return true;
    if (k.id === "false") return false;
    if (k.id === "null") return null;
    if (peek("(")) {
      const fn = FUNCTIONS[k.id.toLowerCase()];
      if (!fn) throw new Error(`the test does not know the function ${k.id}`);
      i += 1;
      const args = [];
      if (!peek(")")) { args.push(or()); while (peek(",")) { i += 1; args.push(or()); } }
      take(")");
      return fn(...args);
    }
    if (k.id) return k.id.split(".").reduce((o, key) => (o === null || o === undefined ? null : o[key] ?? null), context);
    throw new Error(`unexpected ${JSON.stringify(k)} in ${src}`);
  };
  const v = or();
  if (i !== t.length) throw new Error(`left over after the expression: ${src}`);
  return v;
}
// A `runs-on` value as GitHub reads it: an expression, a flow list or a single label, always a list here.
function labels(raw, context) {
  const expr = raw.match(/^\$\{\{(.*)\}\}$/);
  const v = expr ? evaluate(expr[1], context) : raw.startsWith("[") ? raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")) : raw;
  return [v].flat();
}

// ----------------------------------------------------------------- the YAML
function workflow(file) {
  const src = readFileSync(path.join(WORKFLOWS, file), "utf8");
  const lines = src.split("\n");
  const jobs = {};
  let inJobs = false;
  let job = null;
  for (const line of lines) {
    if (/^\S/.test(line)) { inJobs = /^jobs:\s*$/.test(line); job = null; continue; }
    if (!inJobs) continue;
    const head = line.match(/^ {2}([\w-]+):\s*$/);
    if (head) { job = head[1]; continue; }
    const runsOn = line.match(/^ {4}runs-on:\s*(.+?)\s*$/);
    if (job && runsOn) jobs[job] = runsOn[1];
  }
  const on = src.match(/^on:\s*\n((?:[ #].*\n|\n)*)/m)?.[1] ?? "";
  return { jobs, pullRequest: /^ {2}pull_request(_target)?:/m.test(on) };
}

const github = (over) => ({ github: { event_name: "pull_request", head_ref: "", ref: "refs/heads/dev", actor: "ivanprotsko", triggering_actor: "ivanprotsko", ...over } });
const DEPENDABOT = [
  ["a dependabot pull request", github({ head_ref: "dependabot/npm_and_yarn/next-15.5.4", actor: "dependabot[bot]", triggering_actor: "dependabot[bot]" })],
  ["a dependabot pull request of github-actions", github({ head_ref: "dependabot/github_actions/actions/checkout-5", actor: "dependabot[bot]", triggering_actor: "dependabot[bot]" })],
  ["a dependabot run re-run by the lead (a re-run keeps the first actor)", github({ head_ref: "dependabot/npm_and_yarn/next-15.5.4", actor: "dependabot[bot]" })],
  ["a commit the lead pushed onto a dependabot branch", github({ head_ref: "dependabot/npm_and_yarn/next-15.5.4" })],
];
const OURS = [
  ["a push to dev", github({ event_name: "push" })],
  ["a pull request of a person or an agent", github({ head_ref: "fix/dependabot-runner" })],
  ["a run by hand on dev", github({ event_name: "workflow_dispatch" })],
  ["the lead's run by hand on a dependabot branch, before the merge", github({ event_name: "workflow_dispatch", ref: "refs/heads/dependabot/npm_and_yarn/next-15.5.4" })],
];

test("the evaluator reads GitHub's rules: an operand from && and ||, strings without case", () => {
  assert.equal(evaluate("startsWith(github.head_ref, 'Dependabot/')", github({ head_ref: "dependabot/x" })), true);
  assert.equal(evaluate("github.actor == 'DEPENDABOT[bot]'", github({ actor: "dependabot[bot]" })), true);
  assert.equal(evaluate("false && 'a' || 'b'", {}), "b");
  assert.deepEqual(evaluate("fromJSON('[\"x\", \"y\"]')", {}), ["x", "y"]);
  assert.equal(evaluate("format('pr-checks-{0}', github.event.pull_request.number || github.ref)", github({ event_name: "push" })), "pr-checks-refs/heads/dev");
  assert.equal(evaluate("!startsWith(github.head_ref, 'dependabot/')", github({})), true);
});

test("PR Checks: every job of a dependabot pull request runs on GitHub's runner, never on [self-hosted, upready-store]", () => {
  const { jobs } = workflow("pr-checks.yml");
  assert.deepEqual(Object.keys(jobs).sort(), ["backend", "deploy-checks", "panel-and-repository", "scope", "storefront"]);
  for (const [name, raw] of Object.entries(jobs)) {
    for (const [what, context] of DEPENDABOT) {
      const l = labels(raw, context);
      assert.deepEqual(l, ["ubuntu-latest"], `${name}, ${what}: ${raw}`);
      assert.ok(!l.includes("self-hosted") && !l.includes("upready-store"), `${name}, ${what}`);
    }
  }
});

test("PR Checks: dev, the pull requests of people and agents and a run by hand stay on [self-hosted, upready-store]", () => {
  for (const [name, raw] of Object.entries(workflow("pr-checks.yml").jobs)) {
    for (const [what, context] of OURS) assert.deepEqual(labels(raw, context), SELF_HOSTED, `${name}, ${what}`);
  }
});

test("no other workflow a pull request starts can put a job on the self-hosted runner", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("pr-checks.yml") && files.length >= 3, files.join(", "));
  for (const file of files.filter((f) => f !== "pr-checks.yml")) {
    const { jobs, pullRequest } = workflow(file);
    if (!pullRequest) continue;
    for (const [name, raw] of Object.entries(jobs)) {
      for (const [what, context] of DEPENDABOT) assert.ok(!labels(raw, context).includes("self-hosted"), `${file} ${name}, ${what}`);
    }
  }
});
