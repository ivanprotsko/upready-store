// The last line of deploy-instance.sh against its reader (t-2026-10-12-30, review note 1 on #346).
//
// The script writes through `exec > >(tee -a "$LOG")`, and bash does not wait for that tee when it exits.
// release-agent.sh reads release.out the moment the script ends: a «VERIFY FAILED» or `RESULT exit=… step=…`
// still inside the tee is not there yet, and a step-6 run with only known reds is journalled as a failure at
// step 0. Here the tee starts one second late, the way a busy host can delay it, so the race is certain, and
// the script's output goes to a file the way the agent sends it (`>"$dir/release.out" 2>&1`): spawnSync then
// returns when bash exits, not when the last writer of a pipe closes it. No Docker, no network, no host.
//
//   node --test deploy/auto/__tests__/result-line.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..", "..");
const REAL_TEE = spawnSync("sh", ["-c", "command -v tee"], { encoding: "utf8" }).stdout.trim();

const FAKE_DOCKER = `#!/usr/bin/env bash
case "$*" in *"mt-ingress-sync"*"--list"*) echo "shop.example" ;; esac
exit 0
`;

function world() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "result-line-"));
  const tree = path.join(dir, "tree");
  const bin = path.join(dir, "bin");
  for (const d of [bin, path.join(tree, "deploy/scripts"), path.join(tree, "deploy/instances")]) mkdirSync(d, { recursive: true });
  for (const f of ["deploy/scripts/deploy-instance.sh", "deploy/instances/intl.json"]) copyFileSync(path.join(REPO_ROOT, f), path.join(tree, f));
  chmodSync(path.join(tree, "deploy/scripts/deploy-instance.sh"), 0o755);
  const envFile = path.join(dir, "shipshift.env");
  writeFileSync(envFile, "ENGINE_DOMAIN=engine.example\nPANEL_DOMAIN=panel.example\nSTORES_DOMAIN=stores.example\n");
  writeFileSync(path.join(bin, "tee"), `#!/bin/sh\nsleep 1\nexec ${REAL_TEE} "$@"\n`);
  writeFileSync(path.join(bin, "docker"), FAKE_DOCKER);
  copyFileSync(path.join(here, "fake-curl.mjs"), path.join(bin, "curl"));
  for (const b of ["tee", "docker", "curl"]) chmodSync(path.join(bin, b), 0o755);
  const routes = path.join(dir, "routes.json");
  writeFileSync(routes, JSON.stringify([{ url: "panel\\.example", status: 502 }, { url: ".", status: 200 }]));
  const env = {
    ...process.env,
    HOME: dir,
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_HOST_ROOT: path.join(dir, "opt-upready-store"),
    DEPLOY_LOG_DIR: path.join(dir, "logs"),
    FAKE_CURL_ROUTES: routes,
  };
  // As release-agent.sh runs it: stdout and stderr into one file, read right after the exit.
  const run = (script, args) => {
    const out = path.join(dir, "release.out");
    const fd = openSync(out, "w");
    const r = spawnSync("bash", [script, ...args], { env, stdio: ["ignore", fd, fd] });
    closeSync(fd);
    return { status: r.status, out: readFileSync(out, "utf8") };
  };
  return { dir, tree, envFile, env, run };
}

test("control: with the bare `exec > >(tee -a LOG)`, a reader right after the exit misses the last line", () => {
  const w = world();
  const bare = path.join(w.dir, "bare.sh");
  writeFileSync(bare, `set -euo pipefail\nexec > >(tee -a "$1") 2>&1\ntrap 'echo "RESULT exit=$? step=6"' EXIT\necho "VERIFY FAILED"\nexit 1\n`);
  const r = w.run(bare, [path.join(w.dir, "bare.log")]);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.out, /RESULT/, "the race this file is about: the tee had not written yet");
});

test("deploy-instance.sh: release.out and the log hold «VERIFY FAILED» and the RESULT line the moment it exits", () => {
  const w = world();
  const started = Date.now();
  const r = w.run(path.join(w.tree, "deploy/scripts/deploy-instance.sh"), ["intl", "c".repeat(40), "--on-host", "--env-file", w.envFile, "--verify-only"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL GET https:\/\/panel\.example\/healthz → 502 \(expected 200\)/);
  assert.match(r.out, /VERIFY FAILED — 1 check\(s\) red/);
  assert.match(r.out, /RESULT exit=1 step=6\n$/, "the last line is in release.out when the reader looks");
  const logs = readdirSync(w.env.DEPLOY_LOG_DIR);
  assert.equal(logs.length, 1);
  assert.match(readFileSync(path.join(w.env.DEPLOY_LOG_DIR, logs[0]), "utf8"), /RESULT exit=1 step=6\n$/, "and in the script's own log");
  assert.ok(Date.now() - started < 10000, "the wait for the tee is bounded");
});
