// Unit tests for deploy/scripts/instance-check.mjs — no Postgres, no Docker,
// no network: every function under test is pure, and the one that shells out
// to psql (queryDb) is exercised only through the pure functions it feeds
// (checkDbProviders, checkDbAnalytics), never by actually running psql.
//
// The tests at the end of the file run the tool itself as a child process and
// read its real exit code. Where they pass --db, a stand-in `psql` script
// comes first on PATH and answers each query with rows the test names.
//
//   node --test deploy/scripts/__tests__/instance-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  parseEnvFile,
  readEnvValues,
  loadProfile,
  loadOtherProfiles,
  validateProfile,
  forbiddenProviders,
  checkEnv,
  checkBackupTargets,
  checkDbProviders,
  checkDbAnalytics,
  checkDbTenants,
  hostOf,
  BACKUP_TARGET_KEYS,
  UsageError,
  INSTANCES_DIR,
} from "../instance-check.mjs";

test("parseArgs reads --flag value and --flag=value the same way", () => {
  assert.deepEqual(parseArgs(["--instance", "ru", "--env", "a.env"]), {
    instance: "ru",
    env: "a.env",
    backupEnv: null,
    db: null,
  });
  assert.deepEqual(parseArgs(["--instance=intl", "--env=b.env", "--backup-env=c.env", "--db=postgres://x"]), {
    instance: "intl",
    env: "b.env",
    backupEnv: "c.env",
    db: "postgres://x",
  });
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["--nope"]), UsageError);
});

test("parseEnvFile sees a name is set only when its value is non-empty, and never needs to read the value back", () => {
  const map = parseEnvFile(
    [
      "# a comment",
      "",
      "RESEND_API_KEY=re_live_abc123",
      "EMPTY_KEY=",
      "QUOTED=\"some value\"",
      "  SPACED  =  value  ",
    ].join("\n"),
  );
  assert.equal(map.get("RESEND_API_KEY").set, true);
  assert.equal(map.get("EMPTY_KEY").set, false);
  assert.equal(map.get("QUOTED").set, true);
  assert.equal(map.get("SPACED").set, true);
  assert.equal(map.has("# a comment"), false);
});

test("the real ru and intl profiles load and parse", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);
  assert.equal(ru.instance, "ru");
  assert.equal(intl.instance, "intl");
  assert.ok(ru.providers.payment.forbidden.includes("tribute"));
  assert.ok(intl.providers.payment.forbidden.includes("robokassa"));
});

test("loadProfile rejects an instance with no profile file", () => {
  assert.throws(() => loadProfile("mars", INSTANCES_DIR), UsageError);
});

test("forbiddenProviders flattens every category's forbidden list and deduplicates", () => {
  const profile = {
    providers: {
      payment: { forbidden: ["tribute"] },
      fulfillment: { forbidden: ["ozon", "tribute"] },
      auth: { forbidden: [] },
    },
  };
  assert.deepEqual(forbiddenProviders(profile).sort(), ["ozon", "tribute"]);
});

test("checkEnv: ru profile fails on RESEND_API_KEY set, passes on a clean ru env", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);

  const dirty = parseEnvFile("RESEND_API_KEY=re_live_abc\nPOSTGRES_PASSWORD=x\n");
  const dirtyViolations = checkEnv(dirty, ru);
  assert.equal(dirtyViolations.length, 1);
  assert.match(dirtyViolations[0], /RESEND_API_KEY/);

  const clean = parseEnvFile("POSTGRES_PASSWORD=x\nSMTP_HOST=mail\n");
  assert.deepEqual(checkEnv(clean, ru), []);
});

test("checkEnv: ru profile fails on either GA4 env name", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.equal(checkEnv(parseEnvFile("NEXT_PUBLIC_GA_MEASUREMENT_ID=G-ABC123"), ru).length, 1);
  assert.equal(checkEnv(parseEnvFile("GA_MEASUREMENT_ID=G-ABC123"), ru).length, 1);
});

test("checkEnv: ru profile fails on a forbidden prefix, matched against any suffix", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const violations = checkEnv(parseEnvFile("TRIBUTE_API_KEY=whatever\nX402_WALLET_ADDRESS=0xabc\n"), ru);
  assert.equal(violations.length, 2);
});

test("checkEnv: ru profile fails on the crypto payments switch and on BTCPay or Bitcart keys (ask-20261005-070255-438f)", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);

  const flag = checkEnv(parseEnvFile("PAYMENTS_CRYPTO_AVAILABLE=true\n"), ru);
  assert.equal(flag.length, 1);
  assert.match(flag[0], /PAYMENTS_CRYPTO_AVAILABLE/);
  assert.match(flag[0], /282-FZ/);
  // Any value is a violation on RU, «false» included: the variable has no business there.
  assert.equal(checkEnv(parseEnvFile("PAYMENTS_CRYPTO_AVAILABLE=false\n"), ru).length, 1);

  assert.equal(checkEnv(parseEnvFile("BTCPAY_SERVER_URL=https://pay.test\nBITCART_TOKEN=x\n"), ru).length, 2);
  assert.deepEqual(checkEnv(parseEnvFile("PAYMENTS_CRYPTO_AVAILABLE=true\nBTCPAY_SERVER_URL=https://pay.test\n"), intl), []);
});

test("ru profile has no x402 (t-2026-10-03-33): X402_ variables and an x402 tenant row both fail, intl takes both", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);

  const env = checkEnv(parseEnvFile("X402_MAINNET_AVAILABLE=true\n"), ru);
  assert.equal(env.length, 1);
  assert.match(env[0], /X402_MAINNET_AVAILABLE/);
  assert.match(env[0], /x402/);

  const rows = checkDbProviders(["x402"], ru);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /forbidden provider "x402"/);

  assert.deepEqual(checkEnv(parseEnvFile("PAYMENTS_CRYPTO_AVAILABLE=true\nX402_MAINNET_AVAILABLE=true\n"), intl), []);
  assert.deepEqual(checkDbProviders(["x402", "btcpay", "tribute"], intl), []);
});

test("checkEnv: an empty forbidden value never trips the check — only a SET value is a violation", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.deepEqual(checkEnv(parseEnvFile("RESEND_API_KEY=\n"), ru), []);
});

test("checkEnv: intl profile has no forbidden env names today, so even Resend and GA4 pass", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  const violations = checkEnv(
    parseEnvFile("RESEND_API_KEY=re_live_abc\nNEXT_PUBLIC_GA_MEASUREMENT_ID=G-ABC123\n"),
    intl,
  );
  assert.deepEqual(violations, []);
});

test("checkDbProviders: a RU database with a tribute secret fails; robokassa and cdek pass", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.equal(checkDbProviders(["robokassa", "cdek", "tribute"], ru).length, 1);
  assert.deepEqual(checkDbProviders(["robokassa", "cdek"], ru), []);
});

test("checkDbProviders: an INTL database with a robokassa or wildberries secret fails", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  assert.equal(checkDbProviders(["tribute", "robokassa"], intl).length, 1);
  assert.equal(checkDbProviders(["tribute", "wildberries"], intl).length, 1);
  assert.deepEqual(checkDbProviders(["tribute"], intl), []);
});

test("checkDbProviders: a Bitcart or BTCPay store fails RU and passes INTL (ask-20261005-070255-438f)", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);
  const bitcart = checkDbProviders(["robokassa", "bitcart"], ru);
  assert.equal(bitcart.length, 1);
  assert.match(bitcart[0], /"bitcart"/);
  assert.equal(checkDbProviders(["btcpay", "bitcart"], ru).length, 2);
  assert.deepEqual(checkDbProviders(["tribute", "btcpay", "bitcart"], intl), []);
});

test("checkDbAnalytics: a RU database with any tenant GA4 id fails; zero tenants passes", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.equal(checkDbAnalytics(3, ru).length, 1);
  assert.deepEqual(checkDbAnalytics(0, ru), []);
});

test("checkDbAnalytics: INTL allows GA4, so it never fails this check", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  assert.deepEqual(checkDbAnalytics(5, intl), []);
});

test("checkDbLoginMethods: RU allows Yandex ID only, INTL allows e-mail and Yandex (K15)", async () => {
  const { checkDbLoginMethods } = await import("../instance-check.mjs");
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);
  assert.deepEqual(checkDbLoginMethods(["yandex"], ru), []);
  assert.equal(checkDbLoginMethods(["both", "both", "yandex"], ru).length, 1);
  assert.match(checkDbLoginMethods(["both", "both"], ru)[0], /^2 tenant\(s\) .*"both".*emailpass/);
  assert.deepEqual(checkDbLoginMethods(["both", "email", "yandex"], intl), []);
  assert.deepEqual(checkDbLoginMethods(["both"], { instance: "x", providers: {} }), []);
});

test("readEnvValues returns the keys you ask for and no other, read the way a shell sources the file", () => {
  const values = readEnvValues(
    [
      "# S3_ENABLED=1",
      "S3_ENABLED=1 # on",
      'S3_ENDPOINT_URL="https://s3.twcstorage.ru"',
      "export CROSS_COPY_SSH_HOST='203.0.113.7'",
      "AWS_SECRET_ACCESS_KEY=never-read",
    ].join("\n"),
    BACKUP_TARGET_KEYS,
  );
  assert.deepEqual([...values.keys()].sort(), ["CROSS_COPY_SSH_HOST", "S3_ENABLED", "S3_ENDPOINT_URL"]);
  assert.equal(values.get("S3_ENABLED"), "1");
  assert.equal(values.get("S3_ENDPOINT_URL"), "https://s3.twcstorage.ru");
  assert.equal(values.get("CROSS_COPY_SSH_HOST"), "203.0.113.7");
});

test("hostOf reads the host of a URL and of a bare host, and gives null for nothing", () => {
  assert.equal(hostOf("https://S3.twcstorage.ru/bucket"), "s3.twcstorage.ru");
  assert.equal(hostOf("s3.twcstorage.ru:443"), "s3.twcstorage.ru");
  assert.equal(hostOf("203.0.113.7"), "203.0.113.7");
  assert.equal(hostOf(""), null);
  assert.equal(hostOf(undefined), null);
});

test("the real profiles carry every field the backup and tenant checks read", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  validateProfile(ru);
  validateProfile(loadProfile("intl", INSTANCES_DIR));
  assert.deepEqual(loadOtherProfiles("ru", INSTANCES_DIR).map((profile) => profile.instance), ["intl"]);
  assert.deepEqual(loadOtherProfiles("intl", INSTANCES_DIR).map((profile) => profile.instance), ["ru"]);
  assert.throws(() => validateProfile({ ...ru, backup: { crossBorderCopy: "forbidden" } }), /backup\.s3EndpointHosts, backup\.crossCopyHosts/);
  assert.throws(() => validateProfile({ ...ru, domains: { primary: [] } }), UsageError);
});

const targets = (lines) => readEnvValues(lines.join("\n"), BACKUP_TARGET_KEYS);

test("checkBackupTargets: RU passes on the Timeweb endpoint and fails on any other S3 endpoint", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.deepEqual(checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.twcstorage.ru"]), ru), []);

  const abroad = checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.eu-central-1.amazonaws.com"]), ru);
  assert.equal(abroad.length, 1);
  assert.match(abroad[0], /^backup target S3_ENDPOINT_URL .*allowed: s3\.twcstorage\.ru.*outside the country of instance ru$/);
  // The message names the key and the profile's list, never the value it read.
  assert.doesNotMatch(abroad[0], /amazonaws/);

  assert.equal(checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL="]), ru).length, 1);
  // cross-copy.sh copies nowhere while S3_ENABLED is not 1, so a stale endpoint is no copy.
  assert.deepEqual(checkBackupTargets(targets(["S3_ENABLED=0", "S3_ENDPOINT_URL=https://s3.eu-central-1.amazonaws.com"]), ru), []);
  assert.deepEqual(checkBackupTargets(targets([]), ru), []);
});

test("checkBackupTargets: a cross-copy host fails on both instances, and INTL fails on an enabled S3 copy", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);

  for (const profile of [ru, intl]) {
    const crossCopy = checkBackupTargets(targets(["CROSS_COPY_SSH_HOST=203.0.113.7"]), profile);
    assert.equal(crossCopy.length, 1);
    assert.match(crossCopy[0], /^backup target CROSS_COPY_SSH_HOST .*allowed: none/);
    assert.doesNotMatch(crossCopy[0], /203\.0\.113\.7/);
    assert.deepEqual(checkBackupTargets(targets(["CROSS_COPY_SSH_HOST="]), profile), []);
  }

  // intl.json names no S3 endpoint yet, so the RU bucket and an unknown one fail alike.
  assert.equal(checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.twcstorage.ru"]), intl).length, 1);
  assert.equal(checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.example.eu"]), intl).length, 1);

  const listed = { instance: "x", backup: { s3EndpointHosts: ["s3.example.eu"], crossCopyHosts: ["backup2.example.eu"] } };
  assert.deepEqual(
    checkBackupTargets(targets(["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.example.eu", "CROSS_COPY_SSH_HOST=backup2.example.eu"]), listed),
    [],
  );
});

test("checkDbTenants: INTL fails on a tenant that answers on a RU domain", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  const others = loadOtherProfiles("intl", INSTANCES_DIR);
  assert.deepEqual(checkDbTenants([["cherkashino.com", "www.cherkashino.com"], ["shop.example"], []], intl, others), []);

  const moved = checkDbTenants([["cherkashino.com"], ["shop.example", "www.cherkashino.ru"], ["m.cherkashino.ru"]], intl, others);
  assert.equal(moved.length, 1);
  assert.match(moved[0], /^2 tenant\(s\) .*a domain of instance ru \(cherkashino\.ru, www\.cherkashino\.ru\).*not allowed on instance intl$/);
  // Counts and the profiles' own domains only: a tenant's other address is never printed.
  assert.doesNotMatch(moved[0], /shop\.example/);
});

test("checkDbTenants: RU fails on a tenant with a .com address and on a tenant with no RU address", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const others = loadOtherProfiles("ru", INSTANCES_DIR);
  assert.deepEqual(checkDbTenants([["cherkashino.ru", "www.cherkashino.ru"]], ru, others), []);

  const foreign = checkDbTenants([["cherkashino.ru"], ["cherkashino.com"]], ru, others);
  assert.equal(foreign.length, 1);
  assert.match(foreign[0], /^1 tenant\(s\) .*a domain of instance intl/);

  const stray = checkDbTenants([["cherkashino.ru"], ["shop.example"], []], ru, others);
  assert.equal(stray.length, 1);
  assert.match(stray[0], /^2 tenant\(s\) .*no address on the domains of instance ru \(cherkashino\.ru, www\.cherkashino\.ru\)/);
  assert.doesNotMatch(stray[0], /shop\.example/);
});

// ---- the tool itself, as a child process -----------------------------------

const TOOL = fileURLToPath(new URL("../instance-check.mjs", import.meta.url));
const REPO = path.resolve(path.dirname(TOOL), "..", "..");
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), "instance-check-test-"));
const DB_URL = "postgres://medusa:s3cretpw@mt-postgres:5432/medusa_mt";

// Stands in for psql: one answer per query of queryDb, picked by a word of its SQL.
writeFileSync(
  path.join(SCRATCH, "psql"),
  [
    "#!/bin/sh",
    'if [ -n "$FAKE_PSQL_FAIL" ]; then echo "psql: error: connection to \\"$1\\" failed" >&2; exit 2; fi',
    'case "$4" in',
    '  *tenant_integration_secret*) printf "%s\\n" "$FAKE_PROVIDERS" ;;',
    '  *ga4_measurement_id*) echo 0 ;;',
    '  *buyer_login_method*) printf "%s\\n" "$FAKE_LOGINS" ;;',
    '  *string_agg*) printf "%s\\n" "$FAKE_TENANTS" ;;',
    "esac",
    "",
  ].join("\n"),
);
chmodSync(path.join(SCRATCH, "psql"), 0o755);

function writeScratch(name, lines) {
  const file = path.join(SCRATCH, name);
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

function runTool(args, fake = {}) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PATH: `${SCRATCH}${path.delimiter}${process.env.PATH}`, ...fake },
  });
}

test("the tool exits 0 on both profiles against the env templates this repository ships", () => {
  for (const [instance, env] of [["ru", "deploy/mt/ru.env.example"], ["intl", "deploy/mt/shipshift.env.example"]]) {
    const run = runTool(["--instance", instance, "--env", env, "--backup-env", "deploy/backup/nightly.env.example"]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, new RegExp(`^instance-check: ${instance} is clean`));
  }
});

test("the tool exits 1 on a backup target outside the instance's country and never prints the target", () => {
  const backupEnv = writeScratch("abroad.env", [
    "S3_ENABLED=1",
    "S3_ENDPOINT_URL=https://s3.eu-central-1.amazonaws.com",
    "CROSS_COPY_SSH_HOST=203.0.113.7",
  ]);
  for (const [instance, env] of [["ru", "deploy/mt/ru.env.example"], ["intl", "deploy/mt/shipshift.env.example"]]) {
    const run = runTool(["--instance", instance, "--env", env, "--backup-env", backupEnv]);
    assert.equal(run.status, 1);
    assert.equal(run.stderr.match(/^VIOLATION: backup target /gm).length, 2);
    assert.doesNotMatch(run.stdout + run.stderr, /amazonaws|203\.0\.113\.7/);
  }

  const home = writeScratch("home.env", ["S3_ENABLED=1", "S3_ENDPOINT_URL=https://s3.twcstorage.ru", "CROSS_COPY_SSH_HOST="]);
  assert.equal(runTool(["--instance", "ru", "--env", "deploy/mt/ru.env.example", "--backup-env", home]).status, 0);
});

test("the tool exits 1 on a tenant of another instance and 0 on a database of its own shops", () => {
  const intlArgs = ["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--db", DB_URL];
  const ruArgs = ["--instance", "ru", "--env", "deploy/mt/ru.env.example", "--db", DB_URL];

  const intlClean = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: "ten_1|cherkashino.com,www.cherkashino.com\nten_2|" });
  assert.equal(intlClean.status, 0, intlClean.stderr);
  const ruClean = runTool(ruArgs, { FAKE_LOGINS: "yandex", FAKE_TENANTS: "ten_1|cherkashino.ru,www.cherkashino.ru" });
  assert.equal(ruClean.status, 0, ruClean.stderr);

  const intlDirty = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: "ten_1|cherkashino.com\nten_2|cherkashino.ru" });
  assert.equal(intlDirty.status, 1);
  assert.match(intlDirty.stderr, /^VIOLATION: 1 tenant\(s\) in this database answer on a domain of instance ru /m);

  const ruDirty = runTool(ruArgs, { FAKE_LOGINS: "yandex\nyandex", FAKE_TENANTS: "ten_1|cherkashino.ru\nten_2|" });
  assert.equal(ruDirty.status, 1);
  assert.match(ruDirty.stderr, /^VIOLATION: 1 tenant\(s\) in this database have no address on the domains of instance ru /m);
});

test("the tool exits 2 without the database password in its output when psql fails, and on a missing backup env file", () => {
  const failed = runTool(["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--db", DB_URL], { FAKE_PSQL_FAIL: "1" });
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /error reading --db: psql failed with status 2/);
  assert.doesNotMatch(failed.stdout + failed.stderr, /s3cretpw/);

  const missing = runTool(["--instance", "ru", "--env", "deploy/mt/ru.env.example", "--backup-env", path.join(SCRATCH, "none.env")]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no such env file/);
});
