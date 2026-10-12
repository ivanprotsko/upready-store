// Tests of deploy-instance.sh --on-host (t-2026-10-12-30): the seven steps run on the instance's own host
// by the release agent. The script runs from a release tree in a temporary folder, with DEPLOY_HOST_ROOT
// standing for /opt/upready-store and stand-ins for docker, curl and ssh. No Docker, no network, no host.
//
//   node --test deploy/scripts/__tests__/deploy-instance-on-host.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..", "..");

const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$*" in
  "inspect mt-postgres") exit 1 ;;
  *"mt-ingress-sync"*"--list"*) echo "shop.example" ;;
  *" up -d --build"*) echo "Container mt-backend Recreated" ;;
esac
exit 0
`;
const FAKE_SSH = `#!/usr/bin/env bash
echo "ssh $*" >> "$FAKE_LOG"
exit 1
`;

function hostWorld() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "deploy-on-host-"));
  const tree = path.join(dir, "tree");
  const hostRoot = path.join(dir, "opt-upready-store");
  const bin = path.join(dir, "bin");
  for (const d of [bin, path.join(hostRoot, "mt"), path.join(tree, "deploy/scripts"), path.join(tree, "deploy/instances")]) mkdirSync(d, { recursive: true });
  // The release tree: the real script, its tools and profiles, and a stand-in for every listed path.
  for (const f of ["deploy/scripts/deploy-instance.sh", "deploy/scripts/host-disk.mjs", "deploy/instances/intl.json", "deploy/instances/ru.json", "deploy/release-paths.txt"]) {
    copyFileSync(path.join(REPO_ROOT, f), path.join(tree, f));
  }
  chmodSync(path.join(tree, "deploy/scripts/deploy-instance.sh"), 0o755);
  for (const dirPath of ["apps/backend", "scripts", "specs/design-system", "docs/owner-guide", "handoff", "docs/evidence"]) mkdirSync(path.join(tree, dirPath), { recursive: true });
  for (const f of ["apps/backend/index.ts", "scripts/x.mjs", "specs/design-system/tokens.json", "docs/owner-guide/README.md", "package.json", "pnpm-workspace.yaml",
    "pnpm-lock.yaml", ".npmrc", "turbo.json", ".dockerignore", "LICENSE", "handoff/operator.md", "docs/evidence/live-customer.png", "AGENTS.md"]) {
    writeFileSync(path.join(tree, f), `${f}\n`);
  }
  // The host: its own env file, and a file of an older release the copy must take away.
  const envFile = path.join(hostRoot, "mt", "shipshift.env");
  writeFileSync(envFile, "ENGINE_DOMAIN=engine.example\nPANEL_DOMAIN=panel.example\nSTORES_DOMAIN=stores.example\n");
  writeFileSync(path.join(hostRoot, "mt", "left-from-an-old-release.txt"), "old\n");
  const log = path.join(dir, "calls.log");
  writeFileSync(path.join(bin, "docker"), FAKE_DOCKER);
  writeFileSync(path.join(bin, "ssh"), FAKE_SSH);
  copyFileSync(path.resolve(REPO_ROOT, "deploy/auto/__tests__/fake-curl.mjs"), path.join(bin, "curl"));
  for (const b of ["docker", "ssh", "curl"]) chmodSync(path.join(bin, b), 0o755);
  const routes = path.join(dir, "routes.json");
  // HOME is the temporary folder and no host IP is set: like the runner and both hosts, there is no
  // ~/upready/.env.keys, so a lookup of it must not end the script (it did on the runner, run 38250887193).
  const env = {
    ...process.env,
    HOME: dir,
    CONTABO_SERVER_IP: undefined,
    RU_HOST_IP: undefined,
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_HOST_ROOT: hostRoot,
    DEPLOY_LOG_DIR: path.join(dir, "logs"),
    FAKE_LOG: log,
    FAKE_CURL_LOG: log,
    FAKE_CURL_ROUTES: routes,
  };
  const run = (args, curlRoutes = [{ url: ".", status: 200 }]) => {
    writeFileSync(routes, JSON.stringify(curlRoutes));
    return spawnSync("bash", [path.join(tree, "deploy/scripts/deploy-instance.sh"), ...args], { env, encoding: "utf8" });
  };
  return { dir, tree, hostRoot, envFile, run, calls: () => (existsSync(log) ? readFileSync(log, "utf8") : "") };
}
const SKIP_BUILDS = ["--skip-backend-build", "--skip-storefront-build", "--skip-panel-build"];

test("--on-host runs the seven steps on this host: no ssh, the listed paths only, the env file kept", () => {
  const w = hostWorld();
  const r = w.run(["intl", "c".repeat(40), "--on-host", "--env-file", w.envFile, ...SKIP_BUILDS]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const s of [1, 2, 3, 4, 5, 6]) assert.match(r.stdout, new RegExp(`step ${s}/7: `));
  assert.match(r.stdout, /VERIFY OK/);
  assert.match(r.stdout, /RESULT exit=0 step=6\s*$/);
  assert.match(r.stdout, /host=this host .*\(on the host, tree /);

  const mt = path.join(w.hostRoot, "mt");
  assert.deepEqual(readdirSync(mt).sort(), [".dockerignore", ".npmrc", "LICENSE", "apps", "deploy", "docs", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "scripts", "shipshift.env", "specs", "turbo.json"]);
  assert.deepEqual(readdirSync(path.join(mt, "docs")), ["owner-guide"], "only docs/owner-guide of docs/");
  assert.equal(readFileSync(w.envFile, "utf8").startsWith("ENGINE_DOMAIN=engine.example"), true, "the env file is untouched");

  const calls = w.calls();
  assert.doesNotMatch(calls, /^ssh /m, "no ssh on the host");
  assert.match(calls, new RegExp(`docker compose -p mt -f ${w.hostRoot}/mt/deploy/compose\\.mt\\.yml --env-file ${w.hostRoot}/mt/shipshift\\.env up -d --build`));
  assert.match(calls, /node deploy\/scripts\/instance-check\.mjs --instance intl --env shipshift\.env/);
  for (const u of ["https://engine.example/health", "https://panel.example/healthz", "https://shop.example/"]) {
    assert.ok(calls.includes(`"url":"${u}"`), `step 6 checks ${u} from the host`);
  }
});

test("--on-host: a red check ends at step 6, and the last line says so", () => {
  const w = hostWorld();
  const r = w.run(["intl", "c".repeat(40), "--on-host", "--env-file", w.envFile, ...SKIP_BUILDS], [
    { url: "panel\\.example", status: 502 },
    { url: ".", status: 200 },
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL GET https:\/\/panel\.example\/healthz → 502 \(expected 200\)/);
  assert.match(r.stdout, /VERIFY FAILED — 1 check\(s\) red/);
  assert.match(r.stdout, /RESULT exit=1 step=6\s*$/);
});

test("--on-host needs the host's own env file, and the tree must hold every listed path", () => {
  const w = hostWorld();
  const noEnv = w.run(["intl", "c".repeat(40), "--on-host"]);
  assert.equal(noEnv.status, 2);
  assert.match(noEnv.stderr, /--on-host needs --env-file/);

  writeFileSync(path.join(w.tree, "deploy/release-paths.txt"), "apps\nnot-in-this-tree\n");
  const missing = w.run(["intl", "c".repeat(40), "--on-host", "--env-file", w.envFile, ...SKIP_BUILDS]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /the release tree .* has no not-in-this-tree/);
  assert.match(missing.stdout, /RESULT exit=1 step=1/);
  assert.ok(existsSync(path.join(w.hostRoot, "mt", "left-from-an-old-release.txt")), "nothing on the host changed");
});

test("deploy/release-paths.txt is the allowlist step 1 always carried, and nothing internal", () => {
  const list = readFileSync(path.join(REPO_ROOT, "deploy/release-paths.txt"), "utf8")
    .split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  assert.deepEqual(list, ["apps", "deploy", "scripts", "specs/design-system", "docs/owner-guide", "package.json", "pnpm-workspace.yaml",
    "pnpm-lock.yaml", ".npmrc", "turbo.json", ".dockerignore", "LICENSE"]);
  for (const internal of ["handoff", "artifacts", "docs", "tools", "glossary", "AGENTS.md", "CLAUDE.md", ".github", "HANDOFF.json"]) {
    assert.ok(!list.includes(internal), `${internal} never goes to a host`);
  }
});
