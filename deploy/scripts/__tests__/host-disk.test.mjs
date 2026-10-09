// Unit tests for deploy/scripts/host-disk.mjs and the «host disk» block of deploy-instance.sh
// (t-2026-10-09-58) — no Docker, no SSH, no network.
//
// On 09.10.2026 the RU release stopped at step 4: the Docker build cache (39.3 GB, nothing pruned it) had
// filled the 77 GB disk and pg_dump wrote «no space left on device». Two behaviours are pinned here:
// the build cache is pruned only on a host whose profile switches it on, and the release refuses before
// pg_dump when the host has no room for the dump.
//
// The last tests cut the block between «# --- host disk» and «# --- end host disk» out of
// deploy-instance.sh and run it under bash with a stand-in `rssh` that records every remote command and
// answers it the way the test names.
//
//   node --test deploy/scripts/__tests__/host-disk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, backupRoom, hostSettings, loadInstanceProfile, main, pruneCommand } from "../host-disk.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..", "..");
const GB = 1024 ** 3;

test("RU prunes its build cache down to 8 GB, INTL never does", () => {
  const ru = hostSettings(loadInstanceProfile("ru"));
  const intl = hostSettings(loadInstanceProfile("intl"));
  assert.equal(ru.prune, true);
  assert.equal(pruneCommand(ru), "docker buildx prune --force --all --max-used-space 8gb");
  assert.equal(intl.prune, false);
  assert.equal(pruneCommand(intl), null);
});

test("pruning is off unless the profile says true, and the limit comes from the profile", () => {
  assert.equal(hostSettings({}).prune, false);
  assert.equal(hostSettings({ host: { buildCache: { prune: "yes" } } }).prune, false);
  assert.deepEqual(hostSettings({}), { prune: false, ...DEFAULTS });
  assert.equal(
    pruneCommand(hostSettings({ host: { buildCache: { prune: true, maxUsedGb: 12 } } })),
    "docker buildx prune --force --all --max-used-space 12gb",
  );
  assert.equal(pruneCommand(hostSettings({ host: { buildCache: { prune: true, maxUsedGb: -1 } } })).endsWith(" 8gb"), true);
});

test("the dump needs twice the database, or the 5 GB floor for a small one", () => {
  const settings = hostSettings(loadInstanceProfile("ru"));
  const big = backupRoom({ freeBytes: 30 * GB, dbBytes: 10 * GB, settings });
  assert.equal(big.neededBytes, 20 * GB);
  assert.equal(big.ok, true);
  assert.match(big.line, /30\.0 GB free, the dump needs 20\.0 GB \(database 10\.0 GB × 2\) — ok/);

  const small = backupRoom({ freeBytes: 6 * GB, dbBytes: 0.3 * GB, settings });
  assert.equal(small.neededBytes, 5 * GB);
  assert.equal(small.ok, true);

  const unread = backupRoom({ freeBytes: 6 * GB, dbBytes: 0, settings });
  assert.equal(unread.neededBytes, 5 * GB);
});

test("too little room refuses, naming what is free and what is needed", () => {
  const settings = hostSettings(loadInstanceProfile("ru"));
  const full = backupRoom({ freeBytes: 0, dbBytes: 0.3 * GB, settings });
  assert.equal(full.ok, false);
  assert.equal(
    full.line,
    "disk: only 0.0 GB free, the dump needs 5.0 GB (the 5 GB floor; database 0.3 GB × 2 is less) — not starting pg_dump or the migrations",
  );
  assert.equal(backupRoom({ freeBytes: 19 * GB, dbBytes: 10 * GB, settings }).ok, false);
});

test("the CLI answers 0 with room, 3 without, 2 on bad arguments", () => {
  const lines = [];
  const out = (s) => lines.push(s);
  assert.equal(main(["backup-room", "--instance", "ru", "--free", String(40 * GB), "--db", String(GB)], { out }), 0);
  assert.equal(main(["backup-room", "--instance", "ru", "--free", String(GB), "--db", String(GB)], { out }), 3);
  assert.equal(main(["backup-room", "--instance", "ru", "--free", "lots", "--db", "1"], { out }), 2);
  assert.equal(main(["prune-command", "--instance", "../ru"], { out }), 2);
  assert.equal(main(["bogus", "--instance", "ru"], { out }), 2);
  lines.length = 0;
  assert.equal(main(["prune-command", "--instance", "intl"], { out }), 0);
  assert.deepEqual(lines, []);
});

// ── the bash block of deploy-instance.sh ────────────────────────────────────────────────────────────

const SCRIPT = readFileSync(path.join(REPO_ROOT, "deploy/scripts/deploy-instance.sh"), "utf8");
const BLOCK = SCRIPT.slice(SCRIPT.indexOf("# --- host disk"), SCRIPT.indexOf("# --- end host disk"));

/** Runs `call` after the block, as instance `instance`, with the stand-in host answering per `answers`. */
const runBlock = (instance, call, answers = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "host-disk-"));
  const calls = path.join(dir, "calls.txt");
  writeFileSync(calls, "");
  const harness = `set -euo pipefail
INSTANCE=${instance}
REPO_ROOT='${REPO_ROOT}'
log() { echo "LOG $*"; }
rssh() {
  printf '%s\\n' "$*" >> '${calls}'
  case "$*" in
    *"buildx prune"*) if [ "\${PRUNE_FAIL:-0}" = 1 ]; then echo "unknown flag: --max-used-space"; return 1; fi; echo "Total:  31.3GB" ;;
    *"df -B1"*) echo "\${FREE}" ;;
    *pg_database_size*) echo "\${DBSIZE}" ;;
    *"df -h"*) echo "  30G   44G  41%" ;;
    *"system df"*) echo "Build Cache  355  0  39.3GB  39.3GB" ;;
    *"du -sh"*) echo "23G" ;;
  esac
}
${BLOCK}
${call}
echo "STATUS $?"`;
  const res = spawnSync("bash", ["-c", harness], {
    encoding: "utf8",
    env: { ...process.env, FREE: "", DBSIZE: "", PRUNE_FAIL: "0", ...answers },
  });
  return { out: res.stdout + res.stderr, code: res.status, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
};

test("deploy-instance.sh prunes on RU after the build, and only there", () => {
  assert.ok(BLOCK.includes("prune_build_cache()") && BLOCK.includes("backup_room_ok()"), "the block was not found");
  const build = SCRIPT.slice(SCRIPT.indexOf("step_build_images() {"), SCRIPT.indexOf("# ------------------------------------------------------------------- step 3"));
  assert.match(build, /done\n  prune_build_cache\n\}/, "prune_build_cache runs after the build loop of step 2");

  const ru = runBlock("ru", "prune_build_cache");
  assert.deepEqual(ru.calls.slice(0, 1), ["docker buildx prune --force --all --max-used-space 8gb 2>&1"]);
  assert.match(ru.out, /LOG build cache pruned: Total: {2}31\.3GB; disk \/ now {3}30G {3}44G {2}41%/);
  assert.match(ru.out, /STATUS 0/);

  const intl = runBlock("intl", "prune_build_cache");
  assert.deepEqual(intl.calls, [], "nothing is sent to the INTL host");
  assert.match(intl.out, /LOG build cache: not pruned on this host \(host\.buildCache\.prune is off in deploy\/instances\/intl\.json\)/);
});

test("a failed prune is a warning, and the release goes on", () => {
  const ru = runBlock("ru", "prune_build_cache", { PRUNE_FAIL: "1" });
  assert.match(ru.out, /LOG WARNING: build cache prune failed, the release goes on: unknown flag: --max-used-space/);
  assert.match(ru.out, /STATUS 0/);
});

test("deploy-instance.sh refuses before pg_dump when the host has no room, and says what takes it", () => {
  const backup = SCRIPT.slice(SCRIPT.indexOf("step_pre_migration_backup() {"), SCRIPT.indexOf("# ------------------------------------------------------------------- step 5"));
  assert.ok(backup.indexOf('backup_room_ok "$db" || fail') > 0, "step 4 asks for room");
  assert.ok(backup.indexOf('backup_room_ok "$db" || fail') < backup.indexOf("pg-backup.sh"), "before pg-backup.sh runs");

  const full = runBlock("ru", "backup_room_ok medusa_ru || echo REFUSED", { FREE: String(2 * GB), DBSIZE: String(Math.round(0.3 * GB)) });
  assert.match(full.out, /LOG disk: only 2\.0 GB free, the dump needs 5\.0 GB/);
  assert.match(full.out, /LOG what takes the space \(docker system df\):\nBuild Cache {2}355/);
  assert.match(full.out, /LOG the backup copies in \/opt\/upready-store\/backups\/mt: 23G/);
  assert.match(full.out, /REFUSED/);

  const room = runBlock("ru", "backup_room_ok medusa_ru", { FREE: String(40 * GB), DBSIZE: String(Math.round(0.3 * GB)) });
  assert.match(room.out, /LOG disk: 40\.0 GB free, the dump needs 5\.0 GB .* — ok/);
  assert.match(room.out, /STATUS 0/);
  assert.equal(room.calls.some((c) => c.includes("system df")), false);
});

test("unreadable numbers do not stop a release on their own", () => {
  const noFree = runBlock("ru", "backup_room_ok medusa_ru", { FREE: "", DBSIZE: "1" });
  assert.match(noFree.out, /LOG WARNING: disk: could not read the free space on the host/);
  assert.match(noFree.out, /STATUS 0/);

  const noSize = runBlock("ru", "backup_room_ok medusa_ru", { FREE: String(40 * GB), DBSIZE: "ERROR: oops" });
  assert.match(noSize.out, /LOG WARNING: disk: could not read the size of medusa_ru — the floor alone decides/);
  assert.match(noSize.out, /STATUS 0/);
});
