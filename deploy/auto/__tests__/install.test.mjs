// Tests of deploy/auto/install.sh and uninstall.sh (t-2026-10-12-30), in a temporary root with a stand-in
// systemctl: --dry-run prints every file and every command and writes nothing; a real run writes the pinned
// agent, a configuration without a secret, the seeded journal and the two units; uninstall keeps the history.
//
//   node --test deploy/auto/__tests__/install.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "../journal-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const INSTALL = path.resolve(here, "..", "install.sh");
const UNINSTALL = path.resolve(here, "..", "uninstall.sh");
const LIVE = "67430df181b818b8c45a3fd3a5d2cc3c804346e6";
const ARGS = ["--instance", "intl", "--env-file", "/opt/upready-store/mt/shipshift.env", "--app-id", "123456", "--live-sha", LIVE];

function root() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "release-install-"));
  const fake = path.join(dir, "systemctl");
  writeFileSync(fake, `#!/usr/bin/env bash\necho "$*" >> "${path.join(dir, "systemctl.log")}"\n`);
  chmodSync(fake, 0o755);
  const env = { ...process.env, RELEASE_INSTALL_ROOT: path.join(dir, "root"), SYSTEMCTL_BIN: fake };
  return { dir, env, root: path.join(dir, "root"), systemctl: () => (existsSync(path.join(dir, "systemctl.log")) ? readFileSync(path.join(dir, "systemctl.log"), "utf8") : "") };
}
const run = (script, args, env) => spawnSync("bash", [script, ...args], { env, encoding: "utf8" });

test("--dry-run prints every file it would write and every unit it would enable, and writes nothing", () => {
  const r = root();
  const out = run(INSTALL, [...ARGS, "--dry-run"], r.env);
  assert.equal(out.status, 0, out.stderr);
  const files = [...out.stdout.matchAll(/^--- would (?:write|copy \S+ ->) (\S+)/gm)].map((m) => m[1].replace(r.root, ""));
  assert.deepEqual(files, [
    "/opt/upready-store/auto/release-agent.sh",
    "/etc/upready-store-release/release.env",
    "/var/lib/upready-store-release/journal.json",
    "/etc/systemd/system/upready-store-release.service",
    "/etc/systemd/system/upready-store-release.timer",
  ]);
  assert.match(out.stdout, /^--- would run: \S*systemctl daemon-reload ---$/m);
  assert.match(out.stdout, /^--- would run: \S*systemctl enable --now upready-store-release\.timer ---$/m);
  assert.match(out.stdout, /ExecStart=\/opt\/upready-store\/auto\/release-agent\.sh/);
  assert.match(out.stdout, /OnUnitInactiveSec=2min/);
  assert.match(out.stdout, /"result": "adopted"/);
  assert.match(out.stderr, /AUTO_RELEASE_DEV: nothing is released until Ivan sets it to on/);
  assert.equal(existsSync(r.root), false, "nothing is written");
  assert.equal(r.systemctl(), "", "systemctl is not run");
});

test("a real run writes the pinned agent, a configuration without a secret, the journal and the units", () => {
  const r = root();
  const out = run(INSTALL, ARGS, r.env);
  assert.equal(out.status, 0, out.stderr);
  const agent = path.join(r.root, "opt/upready-store/auto/release-agent.sh");
  assert.equal(readFileSync(agent, "utf8"), readFileSync(path.resolve(here, "..", "release-agent.sh"), "utf8"));
  assert.equal(statSync(agent).mode & 0o777, 0o755);
  const conf = path.join(r.root, "etc/upready-store-release/release.env");
  assert.equal(statSync(conf).mode & 0o777, 0o600);
  assert.equal(readFileSync(conf, "utf8"), [
    "# The release agent of this host (deploy/auto/install.sh, t-2026-10-12-30). No secret in this file.",
    "RELEASE_INSTANCE=intl",
    "RELEASE_ENV_FILE=/opt/upready-store/mt/shipshift.env",
    "RELEASE_STATE_DIR=/var/lib/upready-store-release",
    "GITHUB_APP_ID=123456",
    "GITHUB_APP_KEY_FILE=/etc/upready-store-release/github-app.pem",
    "",
  ].join("\n"));
  const journal = JSON.parse(readFileSync(path.join(r.root, "var/lib/upready-store-release/journal.json"), "utf8"));
  assert.deepEqual(check(journal), []);
  assert.equal(journal.records[0].sha, LIVE);
  assert.equal(journal.records[0].id, "intl-adopted-67430df1");
  assert.deepEqual(readdirSync(path.join(r.root, "etc/systemd/system")).sort(), ["upready-store-release.service", "upready-store-release.timer"]);
  assert.equal(r.systemctl(), "daemon-reload\nenable --now upready-store-release.timer\n");
  assert.match(out.stderr, /the App key \/etc\/upready-store-release\/github-app\.pem is not on this host yet/);

  // A second run keeps the journal it finds.
  const again = run(INSTALL, ARGS, r.env);
  assert.equal(again.status, 0);
  assert.match(again.stderr, /already there: kept as it is/);

  // uninstall: the units and the agent go, the journal and the configuration stay.
  const dry = run(UNINSTALL, ["--dry-run"], r.env);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would run: \S*systemctl disable --now upready-store-release\.timer/);
  assert.match(dry.stdout, /would remove \S*upready-store-release\.service/);
  assert.ok(existsSync(agent), "--dry-run removes nothing");
  const un = run(UNINSTALL, [], r.env);
  assert.equal(un.status, 0, un.stderr);
  assert.equal(existsSync(agent), false);
  assert.deepEqual(readdirSync(path.join(r.root, "etc/systemd/system")), []);
  assert.ok(existsSync(conf) && existsSync(path.join(r.root, "var/lib/upready-store-release/journal.json")));
});

test("install refuses what it cannot write right", () => {
  const r = root();
  for (const [args, msg] of [
    [["--instance", "eu", "--env-file", "/x.env", "--app-id", "1"], /--instance must be intl or ru/],
    [["--instance", "ru", "--env-file", "ru-prod.env", "--app-id", "1"], /absolute path/],
    [["--instance", "ru", "--env-file", "/x.env"], /--app-id or --token-file is required/],
    [["--instance", "ru", "--env-file", "/x.env", "--app-id", "1", "--live-sha", "67430df1"], /full 40-character sha/],
  ]) {
    const out = run(INSTALL, args, r.env);
    assert.equal(out.status, 1);
    assert.match(out.stderr, msg);
  }
  assert.equal(existsSync(r.root), false);
});
