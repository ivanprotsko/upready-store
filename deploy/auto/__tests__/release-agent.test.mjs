// Tests of deploy/auto/release-agent.sh (t-2026-10-12-30): no network, no Docker, no host.
//
// GitHub is fake-curl.mjs answering from routes; the release tree is a tarball the test builds, whose
// deploy/scripts/deploy-instance.sh is a stand-in that records how it was called and ends the way the test
// asks (green, red at step 4, red checks at step 6). Each test runs the agent's ticks under bash the way the
// systemd timer does, then reads the journal, the state and the calls made to GitHub.
//
//   node --test deploy/auto/__tests__/release-agent.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "../journal-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(here, "..", "release-agent.sh");
const API = "https://api.github.test";
const REPO = "ivanprotsko/upready-store";
const sha = (c) => c.repeat(40);
const [A, B, C, D] = ["a", "b", "c", "d"].map(sha);
const TOKEN = "ghs_TEST_SECRET_7f3a90";
const REQUIRED = ["Backend", "Storefront", "Panel And Repository", "Deploy Checks"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FAKE_DEPLOY = `#!/usr/bin/env bash
root="$(cd "$(dirname "$0")/../.." && pwd)"
{ echo "args: $*"; echo "tree: $(cd "$root" && find . -type f | sort | tr '\\n' ' ')"; } >> "$FAKE_DEPLOY_CALLS"
p() { echo "[00:00:00] [$INST] $*"; }
INST="$1"
case " $* " in *" --verify-only "*)
  for u in \${FAKE_BASELINE_REDS:-}; do p "FAIL GET $u (tenant storefront) → 502 (expected 200)"; done
  p "RESULT exit=0 step=6"; exit 0 ;; esac
case "\${FAKE_DEPLOY:-ok}" in
  ok) p "step 1/7: release tree"; p "step 6/7: verify"; p "VERIFY OK — every check passed"; p "RESULT exit=0 step=6"; exit 0 ;;
  fail4) p "step 4/7: pre-migration dump"; p "FAILED: not enough free disk for the pre-migration dump — free space on the host"; p "RESULT exit=1 step=4"; exit 1 ;;
  red) p "step 6/7: verify"
       for u in \${FAKE_RELEASE_REDS:-}; do p "FAIL GET $u (tenant storefront) → 502 (expected 200)"; done
       p "VERIFY FAILED — red"; p "RESULT exit=1 step=6"; exit 1 ;;
esac
`;

function buildTarball(dir, { withList = true } = {}) {
  const src = path.join(dir, withList ? "src" : "src-nolist");
  const top = path.join(src, "ivanprotsko-upready-store-ccccccc");
  const files = {
    "deploy/scripts/deploy-instance.sh": FAKE_DEPLOY,
    "apps/backend/index.txt": "backend\n",
    "package.json": "{}\n",
    "handoff/operator-tasks.md": "internal, never on a host\n",
    "docs/evidence/live-customer.png": "a frame with a real buyer\n",
  };
  if (withList) files["deploy/release-paths.txt"] = "# test list\napps\ndeploy\npackage.json\n";
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    writeFileSync(path.join(top, rel), body);
  }
  chmodSync(path.join(top, "deploy/scripts/deploy-instance.sh"), 0o755);
  const out = path.join(dir, withList ? "release.tgz" : "release-nolist.tgz");
  const r = spawnSync("tar", ["-czf", out, "-C", src, "ivanprotsko-upready-store-ccccccc"]);
  assert.equal(r.status, 0, String(r.stderr));
  return out;
}

const RUNS = [
  { id: 3, head_sha: D, status: "in_progress", conclusion: null, created_at: "2026-10-12T11:00:00Z" },
  { id: 2, head_sha: C, status: "completed", conclusion: "success", created_at: "2026-10-12T10:40:00Z" },
  { id: 1, head_sha: B, status: "completed", conclusion: "success", created_at: "2026-10-12T10:20:00Z" },
];

function world({ instance = "intl", journal = [A], auth = "token" } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "release-agent-"));
  for (const d of ["bin", "state", "shm", "tmp"]) mkdirSync(path.join(dir, d));
  copyFileSync(path.join(here, "fake-curl.mjs"), path.join(dir, "bin", "curl"));
  chmodSync(path.join(dir, "bin", "curl"), 0o755);
  writeFileSync(path.join(dir, "token"), `${TOKEN}\n`);
  const tarball = buildTarball(dir);
  if (journal.length) {
    const t = "2026-10-12T10:00:00Z";
    writeFileSync(path.join(dir, "state", "journal.json"), JSON.stringify({
      schema: "upready-store.release-journal/1", instance, host: "test-host",
      records: journal.map((s) => ({
        id: `${instance}-adopted-${s.slice(0, 8)}`, sha: s, instance, kind: "adopted", start: t, end: t, result: "adopted",
        step: null, step_name: null, reason: "live", log: null, checks_run: null, after: null, switch: null, new_reds: [], published: true,
      })),
    }));
  }
  const env = {
    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
    HOME: dir,
    TMPDIR: path.join(dir, "tmp"),
    RELEASE_AGENT_CONF: path.join(dir, "no-such.env"),
    RELEASE_INSTANCE: instance,
    RELEASE_ENV_FILE: "/opt/upready-store/mt/shipshift.env",
    RELEASE_STATE_DIR: path.join(dir, "state"),
    RELEASE_TMP: path.join(dir, "shm"),
    RELEASE_GRACE_TRIES: "3",
    RELEASE_GRACE_SLEEP: "0",
    GITHUB_API_URL: API,
    FAKE_CURL_ROUTES: path.join(dir, "routes.json"),
    FAKE_CURL_LOG: path.join(dir, "curl.log"),
    FAKE_CURL_STATE: path.join(dir, "curl-state.json"),
    FAKE_DEPLOY_CALLS: path.join(dir, "deploy-calls.log"),
  };
  if (auth === "token") env.GITHUB_TOKEN_FILE = path.join(dir, "token");
  const w = {
    dir, env, tarball,
    routes(list) { writeFileSync(env.FAKE_CURL_ROUTES, JSON.stringify(list)); },
    tick(extra = {}) {
      const r = spawnSync("bash", [AGENT], { env: { ...env, ...extra }, encoding: "utf8" });
      w.last = r;
      return r;
    },
    journal: () => JSON.parse(readFileSync(path.join(dir, "state", "journal.json"), "utf8")),
    state: () => JSON.parse(readFileSync(path.join(dir, "state", "state.json"), "utf8")),
    calls: () => (existsSync(env.FAKE_CURL_LOG) ? readFileSync(env.FAKE_CURL_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []),
    posted: () => w.calls().filter((c) => c.method === "POST" && /\/statuses\//.test(c.url)).map((c) => ({ sha: c.url.split("/").pop(), ...JSON.parse(c.data) })),
    deployCalls: () => (existsSync(env.FAKE_DEPLOY_CALLS) ? readFileSync(env.FAKE_DEPLOY_CALLS, "utf8") : ""),
  };
  return w;
}

function githubRoutes(w, { switchJson = { name: "AUTO_RELEASE_DEV", value: "on" }, switchStatus = 200, runs = RUNS, statuses = {}, tarball = w.tarball, extra = [] } = {}) {
  const r = `${esc(API)}/repos/${esc(REPO)}`;
  return [
    ...extra,
    { method: "GET", url: `${r}/actions/variables/AUTO_RELEASE_DEV$`, status: switchStatus, json: switchJson },
    { method: "GET", url: `${r}/commits\\?sha=dev&`, json: [D, C, B, A].map((s) => ({ sha: s })) },
    { method: "GET", url: `${r}/actions/workflows/pr-checks\\.yml/runs\\?branch=dev`, json: { workflow_runs: runs } },
    { method: "GET", url: `${r}/actions/runs/\\d+/jobs`, json: { jobs: REQUIRED.map((name) => ({ name, conclusion: "success" })) } },
    ...Object.entries(statuses).map(([s, state]) => ({
      method: "GET", url: `${r}/commits/${s}/status$`, json: { statuses: state ? [{ context: "release/intl", state }] : [] },
    })),
    { method: "GET", url: `${r}/commits/[0-9a-f]{40}/status$`, json: { statuses: [] } },
    { method: "POST", url: `${r}/statuses/`, status: 201, json: {} },
    { method: "GET", url: `${r}/tarball/`, file: tarball },
  ];
}

function assertValid(w) {
  assert.deepEqual(check(w.journal()), [], "journal.json against journal.schema.json");
  assert.deepEqual(check(w.state()), [], "state.json against state.schema.json");
}

function allFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });
}

function assertNoSecret(w, secret) {
  assert.ok(!w.last.stdout.includes(secret) && !w.last.stderr.includes(secret), "the token is not printed");
  for (const f of allFiles(path.join(w.dir, "state"))) assert.ok(!readFileSync(f, "utf8").includes(secret), `the token is not in ${f}`);
  assert.ok(w.calls().every((c) => !c.argsHoldAuth), "the token never is an argument of curl");
}

test("INTL releases the newest dev sha whose required checks are green, and only that one", () => {
  const w = world();
  w.routes(githubRoutes(w));
  const r = w.tick();
  assert.equal(r.status, 0, r.stderr);

  const records = w.journal().records;
  assert.equal(records.length, 2);
  const rec = records[1];
  assert.equal(rec.sha, C, "D is still being checked, B is older than C");
  assert.equal(rec.result, "success");
  assert.equal(rec.checks_run, 2);
  assert.equal(rec.after, "required checks green");
  assert.equal(rec.published, true);
  assert.match(rec.id, /^intl-\d{8}T\d{6}Z-cccccccc$/);

  assert.deepEqual(w.posted().map((p) => [p.sha, p.context, p.state]), [[C, "release/intl", "pending"], [C, "release/intl", "success"]]);

  const calls = w.deployCalls();
  assert.match(calls, /args: intl c{40} --on-host --env-file \/opt\/upready-store\/mt\/shipshift\.env --verify-only/);
  assert.match(calls, /args: intl c{40} --on-host --env-file \/opt\/upready-store\/mt\/shipshift\.env\n/);
  assert.ok(calls.indexOf("--verify-only") < calls.lastIndexOf("args: intl"), "the baseline runs before the release");
  assert.doesNotMatch(calls, /handoff|docs\/evidence/, "only the paths of deploy/release-paths.txt reach the disk");
  assert.match(calls, /\.\/apps\/backend\/index\.txt/);
  assert.deepEqual(readdirSync(w.env.RELEASE_TMP), [], "the tarball leaves /dev/shm");
  assert.equal(existsSync(path.join(w.dir, "state", "stage", C)), false, "the stage is gone after the release");

  const state = w.state();
  assert.equal(state.switch.value, "on");
  assert.equal(state.dev_head, D);
  assert.equal(state.last.sha, C);
  assert.equal(state.current, null);
  assertValid(w);
  assertNoSecret(w, TOKEN);

  // The next tick: C is in the journal, D is still being checked. Nothing starts.
  w.tick();
  assert.equal(w.journal().records.length, 2);
  assert.equal(w.state().waiting, "dev dddddddd: checks in_progress (run 3)");
});

test("a sha with a red required job or no run is passed over", () => {
  const w = world();
  const runs = [
    { id: 5, head_sha: D, status: "completed", conclusion: "failure", created_at: "2026-10-12T11:00:00Z" },
    { id: 4, head_sha: C, status: "completed", conclusion: "success", created_at: "2026-10-12T10:40:00Z" },
  ];
  const r = `${esc(API)}/repos/${esc(REPO)}`;
  w.routes(githubRoutes(w, {
    runs,
    extra: [{ method: "GET", url: `${r}/actions/runs/4/jobs`, json: { jobs: [{ name: "Backend", conclusion: "success" }, { name: "Storefront", conclusion: "skipped" }] } }],
  }));
  w.tick();
  assert.equal(w.journal().records.length, 1, "C misses required jobs, D is red, B has no run");
  assert.equal(w.state().waiting, "dev dddddddd: checks failure (run 5)");
});

test("the switch: off, missing or unreadable means no release, and the state says which", () => {
  for (const [opts, value, reason] of [
    [{ switchJson: { name: "AUTO_RELEASE_DEV", value: "off" } }, "off", /AUTO_RELEASE_DEV = off/],
    [{ switchStatus: 404, switchJson: { message: "Not Found" } }, "off", /does not exist/],
    [{ switchStatus: 500, switchJson: { message: "boom" } }, "unknown", /HTTP 500\): treated as off/],
  ]) {
    const w = world();
    w.routes(githubRoutes(w, opts));
    w.tick();
    assert.equal(w.journal().records.length, 1, `switch ${value}: nothing released`);
    assert.deepEqual(w.posted(), []);
    assert.equal(w.deployCalls(), "");
    const state = w.state();
    assert.equal(state.switch.value, value);
    assert.match(state.switch.reason, reason);
    assert.match(state.waiting, /^the switch: /);
    assertValid(w);
  }
});

test("RU releases only a sha INTL published release/intl = success on", () => {
  const w = world({ instance: "ru" });
  w.routes(githubRoutes(w, { statuses: { [C]: "pending", [B]: null } }));
  w.tick();
  assert.equal(w.journal().records.length, 1, "INTL has not finished C, and never released B");
  assert.equal(w.state().waiting, "dev dddddddd: INTL has not released it (release/intl: none)");

  w.routes(githubRoutes(w, { statuses: { [C]: "success" } }));
  w.tick();
  const rec = w.journal().records[1];
  assert.equal(rec.sha, C);
  assert.equal(rec.result, "success");
  assert.equal(rec.after, "release/intl = success");
  assert.deepEqual(w.posted().map((p) => [p.context, p.state]), [["release/ru", "pending"], ["release/ru", "success"]]);
  assert.match(w.deployCalls(), /args: ru c{40} --on-host/);
  assertValid(w);
});

test("RU does not release past INTL: INTL green on C but checks red on C is still no release", () => {
  const w = world({ instance: "ru" });
  w.routes(githubRoutes(w, {
    statuses: { [C]: "success" },
    runs: [{ id: 2, head_sha: C, status: "completed", conclusion: "failure", created_at: "2026-10-12T10:40:00Z" }],
  }));
  w.tick();
  assert.equal(w.journal().records.length, 1);
});

test("a failed step goes into the journal and out as a failure status, and the sha is not retried", () => {
  const w = world();
  w.routes(githubRoutes(w));
  const r = w.tick({ FAKE_DEPLOY: "fail4" });
  assert.equal(r.status, 0, "a failed release is not a failed tick");
  const rec = w.journal().records[1];
  assert.equal(rec.result, "failure");
  assert.equal(rec.step, 4);
  assert.equal(rec.step_name, "pre-migration dump");
  assert.match(rec.reason, /^FAILED: not enough free disk/);
  assert.match(rec.log, /state\/logs\/intl-.*-cccccccc$/);
  assert.ok(existsSync(path.join(rec.log, "release.out")) && existsSync(path.join(rec.log, "baseline.out")));
  const end = w.posted().at(-1);
  assert.equal(end.state, "failure");
  assert.equal(end.context, "release/intl");
  assert.match(end.description, /^failed at step 4 \(pre-migration dump\): FAILED: not enough free disk/);
  assert.ok(end.description.length <= 140);
  assertValid(w);

  w.tick();
  assert.equal(w.journal().records.length, 2, "C failed once and is not taken again");
});

test("step 6: a check red before the release too is forgiven, a new red gets the grace, a red that stays fails", () => {
  const known = "https://old-shop.example/";
  const fresh = "https://panel.example/healthz";

  const w1 = world();
  w1.routes(githubRoutes(w1));
  w1.tick({ FAKE_DEPLOY: "red", FAKE_BASELINE_REDS: known, FAKE_RELEASE_REDS: known });
  let rec = w1.journal().records[1];
  assert.equal(rec.result, "success");
  assert.match(rec.reason, /already red before the release: https:\/\/old-shop\.example\//);

  const w2 = world();
  w2.routes(githubRoutes(w2, { extra: [{ method: "GET", url: esc(fresh), statuses: [502, 200] }] }));
  w2.tick({ FAKE_DEPLOY: "red", FAKE_RELEASE_REDS: fresh });
  rec = w2.journal().records[1];
  assert.equal(rec.result, "success");
  assert.match(rec.reason, /came back within the grace/);

  const w3 = world();
  w3.routes(githubRoutes(w3, { extra: [{ method: "GET", url: esc(fresh), statuses: [502] }] }));
  w3.tick({ FAKE_DEPLOY: "red", FAKE_BASELINE_REDS: known, FAKE_RELEASE_REDS: `${known} ${fresh}` });
  rec = w3.journal().records[1];
  assert.equal(rec.result, "failure");
  assert.equal(rec.step, 6);
  assert.deepEqual(rec.new_reds, [fresh]);
  assert.equal(w3.posted().at(-1).state, "failure");
  assertValid(w3);
});

test("a record left running by a run that died becomes interrupted and its status is published", () => {
  const w = world();
  const j = w.journal();
  j.records.push({
    id: "intl-20261012T103000Z-cccccccc", sha: C, instance: "intl", kind: "release", start: "2026-10-12T10:30:00Z", end: null,
    result: "running", step: null, step_name: null, reason: null, log: null, checks_run: 2, after: "required checks green",
    switch: "AUTO_RELEASE_DEV = on", new_reds: [], published: false,
  });
  writeFileSync(path.join(w.dir, "state", "journal.json"), JSON.stringify(j));
  w.routes(githubRoutes(w, { switchJson: { name: "AUTO_RELEASE_DEV", value: "off" } }));
  w.tick();
  const rec = w.journal().records[1];
  assert.equal(rec.result, "interrupted");
  assert.equal(rec.published, true);
  assert.deepEqual(w.posted().map((p) => [p.sha, p.state]), [[C, "failure"]]);
  assert.match(w.posted()[0].description, /^interrupted: the agent stopped/);
  assertValid(w);
});

test("a tarball without deploy/release-paths.txt fails at step 0 and nothing is unpacked", () => {
  const w = world();
  const nolist = buildTarball(w.dir, { withList: false });
  w.routes(githubRoutes(w, { tarball: nolist }));
  w.tick();
  const rec = w.journal().records[1];
  assert.equal(rec.result, "failure");
  assert.equal(rec.step, 0);
  assert.equal(rec.step_name, "prepare");
  assert.match(rec.reason, /no deploy\/release-paths\.txt in cccccccc/);
  assert.equal(w.deployCalls(), "");
  assertValid(w);
});

test("the GitHub App: a JWT signed with the key, then the installation token; neither is printed", () => {
  const w = world({ auth: "app" });
  const key = path.join(w.dir, "app.pem");
  const pub = path.join(w.dir, "app.pub");
  assert.equal(spawnSync("openssl", ["genrsa", "-out", key, "2048"]).status, 0);
  assert.equal(spawnSync("openssl", ["rsa", "-in", key, "-pubout", "-out", pub]).status, 0);
  const installToken = "ghs_INSTALLATION_9c1e";
  const r = `${esc(API)}/repos/${esc(REPO)}`;
  w.routes(githubRoutes(w, {
    switchJson: { name: "AUTO_RELEASE_DEV", value: "off" },
    extra: [
      { method: "GET", url: `${r}/installation$`, json: { id: 77 } },
      { method: "POST", url: `${esc(API)}/app/installations/77/access_tokens$`, status: 201, json: { token: installToken } },
    ],
  }));
  w.tick({ GITHUB_APP_ID: "4242", GITHUB_APP_KEY_FILE: key });

  const calls = w.calls();
  assert.deepEqual(calls.slice(0, 3).map((c) => `${c.method} ${c.url.replace(API, "")}`), [
    `GET /repos/${REPO}/installation`,
    "POST /app/installations/77/access_tokens",
    `GET /repos/${REPO}/actions/variables/AUTO_RELEASE_DEV`,
  ]);
  const jwt = calls[0].auth.replace(/^Authorization: Bearer /, "");
  const [h, p, s] = jwt.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(payload.iss, "4242");
  assert.equal(payload.exp - payload.iat, 600);
  writeFileSync(path.join(w.dir, "signed"), `${h}.${p}`);
  writeFileSync(path.join(w.dir, "sig"), Buffer.from(s, "base64url"));
  const verify = spawnSync("openssl", ["dgst", "-sha256", "-verify", pub, "-signature", path.join(w.dir, "sig"), path.join(w.dir, "signed")], { encoding: "utf8" });
  assert.equal(verify.status, 0, `the JWT signature verifies with the App's public key: ${verify.stdout}${verify.stderr}`);
  assert.equal(calls[2].auth, `Authorization: Bearer ${installToken}`);
  assert.equal(w.state().github, "ok");
  assertNoSecret(w, installToken);
  assertNoSecret(w, jwt);
});

test("no credentials: the tick asks GitHub nothing and the state says why", () => {
  const w = world({ auth: "none" });
  w.routes(githubRoutes(w));
  w.tick();
  assert.deepEqual(w.calls(), []);
  assert.match(w.state().github, /^error: no credentials/);
  assertValid(w);
});

test("the journal check catches what the schema cannot", () => {
  const w = world();
  const j = w.journal();
  const base = { ...j.records[0] };
  j.records.push({ ...base, id: "intl-20261012T110000Z-cccccccc", sha: C, kind: "release", result: "failure", step: null, start: "2026-10-12T11:00:00Z", end: "2026-10-12T11:30:00Z" });
  j.records.push({ ...base, id: "intl-20261012T120000Z-cccccccc", sha: C, kind: "release", result: "running", end: null, start: "2026-10-12T12:00:00Z" });
  const errors = check(j);
  assert.ok(errors.some((e) => /a failure names no step/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /cccccccc is in the journal twice/.test(e)), errors.join("\n"));
  assert.deepEqual(check({ schema: "nope" }), ['$.schema: "nope" is not a known release file']);
});
