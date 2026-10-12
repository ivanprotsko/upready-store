// Unit tests for deploy/scripts/tenant-live.mjs, Ivan's switch of a shop's
// live flag (t-2026-10-12-31). No Postgres, no host: stand-in `psql` and `ssh`
// scripts come first on PATH, write down what they were given and answer with
// a line the test names. live-flag.pg.test.mjs runs the same SQL on a real
// database.
//
//   node --test deploy/scripts/__tests__/tenant-live.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError, parseArgs, showSql, switchSql, today } from "../tenant-live.mjs";

const TOOL = fileURLToPath(new URL("../tenant-live.mjs", import.meta.url));
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), "tenant-live-test-"));
const DB_URL = "postgres://medusa:s3cretpw@localhost:5433/scratch";
const YES = ["--live", "true", "--by", "ivan", "--yes-ivan"];

test("the header tells an agent it never changes the flag", () => {
  const header = readFileSync(TOOL, "utf8").split("\nimport ")[0];
  assert.match(header, /AGENTS NEVER RUN THIS TO CHANGE THE FLAG/);
  assert.match(header, /docs\/instances\/RULES\.md §7, live flag/);
});

test("parseArgs refuses a switch without --yes-ivan, in both directions", () => {
  for (const live of ["true", "false"]) {
    assert.throws(() => parseArgs(["--db", DB_URL, "--handle", "olavka", "--live", live, "--by", "ivan"]), (error) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, /^refused without --yes-ivan: only Ivan switches/);
      return true;
    });
  }
});

test("parseArgs takes a switch with --yes-ivan and dates it today in this machine's zone", () => {
  const now = new Date(2026, 9, 12, 23, 30);
  assert.deepEqual(parseArgs(["--instance", "intl", "--handle", "olavka", ...YES], now), {
    instance: "intl",
    db: null,
    handle: "olavka",
    live: true,
    by: "ivan",
    since: "2026-10-12",
    yesIvan: true,
    show: false,
  });
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(parseArgs(["--db", DB_URL, "--handle", "olavka", "--live=false", "--by=ivan", "--since=2026-10-01", "--yes-ivan"]).since, "2026-10-01");
});

test("parseArgs refuses what would reach the SQL unchecked, and a target that is not exactly one", () => {
  const refused = [
    ["--handle", "olavka", ...YES],
    ["--instance", "intl", "--db", DB_URL, "--handle", "olavka", ...YES],
    ["--instance", "eu", "--handle", "olavka", ...YES],
    ["--db", DB_URL, "--handle", "Olavka'; drop table tenant; --", ...YES],
    ["--db", DB_URL, "--handle", "olavka", "--live", "yes", "--by", "ivan", "--yes-ivan"],
    ["--db", DB_URL, "--handle", "olavka", "--live", "true", "--yes-ivan"],
    ["--db", DB_URL, "--handle", "olavka", "--live", "true", "--by", "ivan'", "--yes-ivan"],
    ["--db", DB_URL, "--handle", "olavka", "--live", "true", "--by", "ivan", "--since", "12.10.2026", "--yes-ivan"],
    ["--db", DB_URL, "--handle", "olavka", "--show", "--live", "true"],
    ["--db", DB_URL, "--handle", "olavka", "--nope"],
  ];
  for (const argv of refused) assert.throws(() => parseArgs(argv), UsageError, argv.join(" "));
  assert.equal(parseArgs(["--db", DB_URL, "--handle", "olavka", "--show"]).show, true);
});

test("switchSql writes the three keys into metadata and nothing else; showSql only reads", () => {
  const sql = switchSql({ handle: "olavka", live: true, since: "2026-10-12", by: "ivan" });
  assert.match(sql, /SET metadata = coalesce\(t\.metadata, '\{\}'::jsonb\) \|\| jsonb_build_object\('live', true, 'live_since', '2026-10-12', 'live_by', 'ivan'\), updated_at = now\(\)/);
  assert.match(sql, /WHERE t\.handle = 'olavka' AND t\.deleted_at IS NULL FOR UPDATE/);
  assert.equal(sql.match(/UPDATE /g).length, 1);
  assert.doesNotMatch(showSql("olavka"), /UPDATE|INSERT|DELETE/);
});

// Stand-ins for psql and ssh: each writes its arguments and stdin to a file and prints $FAKE_ANSWER.
for (const name of ["psql", "ssh"]) {
  writeFileSync(
    path.join(SCRATCH, name),
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > "$FAKE_DIR/${name}.args"`,
      `cat > "$FAKE_DIR/${name}.stdin"`,
      'if [ -n "$FAKE_FAIL" ]; then echo "psql: error: connection to server at \\"$1\\" failed" >&2; exit 2; fi',
      'if [ -n "$FAKE_ANSWER" ]; then printf "%s\\n" "$FAKE_ANSWER"; fi',
      "",
    ].join("\n"),
  );
  chmodSync(path.join(SCRATCH, name), 0o755);
}

function runTool(args, fake = {}) {
  const dir = mkdtempSync(path.join(SCRATCH, "run-"));
  const run = spawnSync(process.execPath, [TOOL, ...args], {
    encoding: "utf8",
    env: { PATH: `${SCRATCH}${path.delimiter}${process.env.PATH}`, HOME: dir, FAKE_DIR: dir, ...fake },
  });
  const read = (file) => (existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), "utf8") : null);
  return { ...run, args: (name) => read(`${name}.args`)?.trimEnd().split("\n") ?? null, stdin: (name) => read(`${name}.stdin`) };
}

test("--db: the switch goes to psql on stdin and the tool prints the flag before and after", () => {
  const run = runTool(["--db", DB_URL, "--handle", "olavka", "--since", "2026-10-12", ...YES], {
    FAKE_ANSWER: "olavka|false||>olavka|true|2026-10-12|ivan",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'tenant-live: --db tenant "olavka" was live=false, now live=true since 2026-10-12 by ivan\n');
  assert.deepEqual(run.args("psql"), [DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"]);
  assert.equal(run.stdin("psql"), switchSql({ handle: "olavka", live: true, since: "2026-10-12", by: "ivan" }));
  assert.equal(run.args("ssh"), null);
});

test("--db: no such tenant exits 1 and says nothing changed; a failing psql exits 2 without the password", () => {
  const missing = runTool(["--db", DB_URL, "--handle", "nobody", ...YES]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^tenant-live: no tenant "nobody" on --db; nothing changed$/m);

  const failed = runTool(["--db", DB_URL, "--handle", "olavka", ...YES], { FAKE_FAIL: "1" });
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /^tenant-live: psql failed with status 2: psql: error: connection to server at "<--db>" failed$/m);
  assert.doesNotMatch(failed.stdout + failed.stderr, /s3cretpw/);
});

test("--instance: psql runs inside the host's mt-postgres over ssh, with the host and key deploy-instance.sh uses", () => {
  const run = runTool(["--instance", "intl", "--handle", "olavka", "--show"], {
    CONTABO_SERVER_IP: "203.0.113.10",
    INTL_HOST_SSH_KEY: "/keys/intl",
    FAKE_ANSWER: "olavka|false||",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'tenant-live: instance intl tenant "olavka" live=false\n');
  assert.deepEqual(run.args("ssh"), [
    "-i",
    "/keys/intl",
    "-o",
    "BatchMode=yes",
    "root@203.0.113.10",
    `docker exec -i mt-postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -f -'`,
  ]);
  assert.equal(run.stdin("ssh"), showSql("olavka"));
  assert.equal(run.args("psql"), null);
});

test("--instance: the address comes from that one line of ~/upready/.env.keys, and its absence stops the tool", () => {
  const home = mkdtempSync(path.join(SCRATCH, "home-"));
  const keys = path.join(home, "upready");
  mkdirSync(keys, { recursive: true });
  writeFileSync(path.join(keys, ".env.keys"), "SOME_TOKEN=not-read\nRU_HOST_IP=198.51.100.7\n");
  const dir = mkdtempSync(path.join(SCRATCH, "run-"));
  const run = spawnSync(process.execPath, [TOOL, "--instance", "ru", "--handle", "olavka", "--show"], {
    encoding: "utf8",
    env: { PATH: `${SCRATCH}${path.delimiter}${process.env.PATH}`, HOME: home, FAKE_DIR: dir, FAKE_ANSWER: "olavka|true|2026-10-12|ivan" },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'tenant-live: instance ru tenant "olavka" live=true since 2026-10-12 by ivan\n');
  const args = readFileSync(path.join(dir, "ssh.args"), "utf8").split("\n");
  assert.equal(args[1], path.join(home, ".ssh", "id_ed25519_do"));
  assert.equal(args[4], "root@198.51.100.7");
  assert.doesNotMatch(run.stdout + run.stderr, /not-read/);

  const nowhere = runTool(["--instance", "intl", "--handle", "olavka", "--show"]);
  assert.equal(nowhere.status, 2);
  assert.match(nowhere.stderr, /no address for the intl host: set CONTABO_SERVER_IP or write it into ~\/upready\/\.env\.keys/);
  assert.equal(nowhere.args("ssh"), null);
});

test("a refused switch reaches neither psql nor ssh", () => {
  const run = runTool(["--instance", "intl", "--handle", "olavka", "--live", "true", "--by", "ivan"], { CONTABO_SERVER_IP: "203.0.113.10" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^tenant-live: refused without --yes-ivan/m);
  assert.equal(run.args("ssh"), null);
  assert.equal(run.args("psql"), null);
});
