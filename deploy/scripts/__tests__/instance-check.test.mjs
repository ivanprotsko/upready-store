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
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  checkMailRelay,
  checkSchool,
  senderDomain,
  checkDbProviders,
  checkDbAnalytics,
  checkDbTenants,
  hostOf,
  BACKUP_TARGET_KEYS,
  MAIL_KEYS,
  SCHOOL_KEYS,
  DEFAULT_SENDER_DOMAINS,
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

test("checkEnv: ru profile fails on the Tribute switch, whatever its value, and intl takes it (t-cherk-22)", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);

  const flag = checkEnv(parseEnvFile("TRIBUTE_AVAILABLE=true\n"), ru);
  assert.equal(flag.length, 1);
  assert.match(flag[0], /TRIBUTE_AVAILABLE/);
  assert.equal(checkEnv(parseEnvFile("TRIBUTE_AVAILABLE=false\n"), ru).length, 1);

  const rows = checkDbProviders(["tribute"], ru);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /forbidden provider "tribute"/);

  assert.deepEqual(checkEnv(parseEnvFile("TRIBUTE_AVAILABLE=true\n"), intl), []);

  // The backend reads only the variables compose names, so the switch must be one of them.
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  const from = compose.slice(compose.indexOf("container_name: mt-backend"));
  const backend = from.slice(0, from.indexOf("\n    networks:"));
  assert.match(backend, /^ {6}TRIBUTE_AVAILABLE: \$\{TRIBUTE_AVAILABLE:-\}$/m);
  assert.equal(compose.match(/^\s+TRIBUTE_AVAILABLE:/gm).length, 1);
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
  assert.throws(() => validateProfile({ ...ru, mailRelay: { description: "a relay" } }), /mailRelay\.defaultsAreThisHost/);
});

test("a recorded exception without a reason or without what closes it is a configuration error", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  const [entry] = intl.tenants.recordedExceptions;
  assert.equal(entry.handle, "olavka");
  const withEntry = (changed) => ({ ...intl, tenants: { recordedExceptions: [changed] } });
  validateProfile(withEntry(entry));
  assert.throws(() => validateProfile(withEntry({ ...entry, reason: "" })), /recorded exception for "olavka" without reason/);
  assert.throws(() => validateProfile(withEntry({ ...entry, closes: undefined })), /recorded exception for "olavka" without closes/);
  assert.throws(() => validateProfile(withEntry({ ...entry, hosts: [] })), UsageError);
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

const RU_HOSTS = ["cherkashino.ru", "www.cherkashino.ru", "xn--80ajkgrgj8cn.xn--p1ai", "www.xn--80ajkgrgj8cn.xn--p1ai"];

test("checkDbTenants: INTL fails on a tenant that answers on a RU domain, and names its handle and hosts", () => {
  const intl = { ...loadProfile("intl", INSTANCES_DIR), tenants: { recordedExceptions: [] } };
  const others = loadOtherProfiles("intl", INSTANCES_DIR);
  const clean = [
    { handle: "cherkashino-com", hosts: ["cherkashino.com", "www.cherkashino.com"] },
    { handle: "acme", hosts: ["shop.example"] },
    { handle: "globex", hosts: [] },
  ];
  assert.deepEqual(checkDbTenants(clean, intl, others), { violations: [], known: [] });

  const moved = checkDbTenants(
    [...clean, { handle: "initech", hosts: ["shop2.example", "www.cherkashino.ru"] }, { handle: "umbrella", hosts: ["m.cherkashino.ru"] }],
    intl,
    others,
  );
  assert.deepEqual(moved.known, []);
  assert.equal(moved.violations.length, 2);
  assert.match(moved.violations[0], /^tenant "initech" answers on a domain of instance ru \(www\.cherkashino\.ru\) .*not allowed on instance intl$/);
  assert.match(moved.violations[1], /^tenant "umbrella" .*\(m\.cherkashino\.ru\)/);
  // Only the hosts that offend are named: a tenant's other address stays out of the log.
  assert.doesNotMatch(moved.violations[0], /shop2\.example/);
});

test("checkDbTenants: a recorded exception is known, not a violation, only while it matches exactly", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  const others = loadOtherProfiles("intl", INSTANCES_DIR);

  // The live state of 06.10.2026: the RU shop's record with its four RU hosts.
  const recorded = checkDbTenants([{ handle: "olavka", hosts: RU_HOSTS }], intl, others);
  assert.deepEqual(recorded.violations, []);
  assert.equal(recorded.known.length, 1);
  assert.match(recorded.known[0], /^tenant "olavka" answers on a domain of instance ru .*recorded 2026-10-06: .*Closes with: Ivan's decision/);

  // One more RU host on the same tenant is outside the record.
  const grown = checkDbTenants([{ handle: "olavka", hosts: [...RU_HOSTS, "m.cherkashino.ru"] }], intl, others);
  assert.deepEqual(grown.known, []);
  assert.equal(grown.violations.length, 1);
  assert.match(grown.violations[0], /^tenant "olavka" .*m\.cherkashino\.ru/);

  // The same hosts on another tenant are not the recorded case.
  const other = checkDbTenants([{ handle: "acme", hosts: ["cherkashino.ru"] }], intl, others);
  assert.deepEqual(other.known, []);
  assert.equal(other.violations.length, 1);
});

test("checkDbTenants: RU fails on a tenant with a .com address and on a tenant with no RU address", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const others = loadOtherProfiles("ru", INSTANCES_DIR);
  // The live state of 06.10.2026: one tenant with the four RU hosts.
  assert.deepEqual(checkDbTenants([{ handle: "olavka", hosts: RU_HOSTS }], ru, others), { violations: [], known: [] });

  const foreign = checkDbTenants([{ handle: "olavka", hosts: RU_HOSTS }, { handle: "cherkashino-com", hosts: ["cherkashino.com"] }], ru, others);
  assert.equal(foreign.violations.length, 1);
  assert.match(foreign.violations[0], /^tenant "cherkashino-com" answers on a domain of instance intl \(cherkashino\.com\)/);

  const stray = checkDbTenants(
    [{ handle: "olavka", hosts: RU_HOSTS }, { handle: "acme", hosts: ["shop.example"] }, { handle: "globex", hosts: [] }],
    ru,
    others,
  );
  assert.equal(stray.violations.length, 2);
  assert.match(stray.violations[0], /^tenant "acme" has no address on the domains of instance ru \(cherkashino\.ru, /);
  assert.match(stray.violations[1], /^tenant "globex" has no address/);
  assert.doesNotMatch(stray.violations.join("\n"), /shop\.example/);
});

// ---- the tool itself, as a child process -----------------------------------

const TOOL = fileURLToPath(new URL("../instance-check.mjs", import.meta.url));
const REPO = path.resolve(path.dirname(TOOL), "..", "..");
const mail = (lines) => readEnvValues(lines.join("\n"), MAIL_KEYS, { wholeLine: true });

test("readEnvValues with wholeLine reads an unquoted value to the end of the line, the way docker compose does", () => {
  const values = mail([
    "SMTP_FROM=Cherkashino <noreply@cherkashino.ru>",
    "MAIL_SENDER_DOMAINS=cherkashino.ru shipshift.dev # two domains",
    'MAIL_HOSTNAME="mail.cherkashino.ru"',
    "SMTP_PASS=never-read",
  ]);
  assert.deepEqual([...values.keys()].sort(), ["MAIL_HOSTNAME", "MAIL_SENDER_DOMAINS", "SMTP_FROM"]);
  assert.equal(values.get("SMTP_FROM"), "Cherkashino <noreply@cherkashino.ru>");
  assert.equal(values.get("MAIL_SENDER_DOMAINS"), "cherkashino.ru shipshift.dev");
  assert.equal(values.get("MAIL_HOSTNAME"), "mail.cherkashino.ru");
});

test("senderDomain reads the domain of a bare address and of one with a display name", () => {
  assert.equal(senderDomain("noreply@Shipshift.dev"), "shipshift.dev");
  assert.equal(senderDomain("Cherkashino <noreply@cherkashino.ru>"), "cherkashino.ru");
  assert.equal(senderDomain("noreply"), null);
  assert.equal(senderDomain(undefined), null);
});

test("checkMailRelay: a backend that does not send through the stack's own relay is not checked", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  assert.deepEqual(checkMailRelay(mail(["SMTP_HOST=", "SMTP_FROM="]), ru), []);
  assert.deepEqual(checkMailRelay(mail(["SMTP_HOST=smtp.example.ru", "SMTP_FROM=shop@example.ru"]), ru), []);
});

test("checkMailRelay: INTL passes on the compose defaults and fails on a sender the relay does not sign for", () => {
  const intl = loadProfile("intl", INSTANCES_DIR);
  assert.deepEqual(checkMailRelay(mail(["SMTP_HOST=mail", "SMTP_FROM=noreply@shipshift.dev", "MAIL_SENDER_DOMAINS="]), intl), []);
  for (const from of ["noreply@cherkashino.com", "", "noreply"]) {
    const violations = checkMailRelay(mail(["SMTP_HOST=mail", `SMTP_FROM=${from}`]), intl);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /^SMTP_FROM is not an address in a domain the relay signs for/);
    assert.doesNotMatch(violations[0], /cherkashino/);
  }
  const both = ["SMTP_HOST=mail", "SMTP_FROM=noreply@cherkashino.com", "MAIL_SENDER_DOMAINS=shipshift.dev cherkashino.com"];
  assert.deepEqual(checkMailRelay(mail(both), intl), []);
  // The relay splits its list on spaces only, so a comma makes one domain that matches nothing.
  assert.equal(checkMailRelay(mail(["SMTP_HOST=mail", "SMTP_FROM=noreply@shipshift.dev", "MAIL_SENDER_DOMAINS=shipshift.dev,cherkashino.com"]), intl).length, 1);
});

test("checkMailRelay: RU fails while the relay would take the INTL host's name or domain, and passes on its own", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const bare = checkMailRelay(mail(["SMTP_HOST=mail", "SMTP_FROM=noreply@shipshift.dev"]), ru);
  assert.deepEqual(bare.map((line) => line.split(" ")[0]), ["MAIL_HOSTNAME", "MAIL_SENDER_DOMAINS"]);

  const noName = checkMailRelay(mail(["SMTP_HOST=mail", "SMTP_FROM=noreply@cherkashino.ru", "MAIL_SENDER_DOMAINS=cherkashino.ru"]), ru);
  assert.equal(noName.length, 1);
  assert.match(noName[0], /^MAIL_HOSTNAME is not set/);

  const own = ["SMTP_HOST=mail", "SMTP_FROM=noreply@cherkashino.ru", "MAIL_HOSTNAME=mail.cherkashino.ru", "MAIL_SENDER_DOMAINS=cherkashino.ru"];
  assert.deepEqual(checkMailRelay(mail(own), ru), []);
});

test("the footer requisites switch passes the env check on ru and on intl, and compose hands it to the storefront (t-2026-10-08-13)", () => {
  // The switch is a storefront setting, not a service a profile forbids. Whether a host sets it is
  // the operator's decision, so the check lets it through on both instances.
  for (const instance of ["ru", "intl"]) {
    const profile = loadProfile(instance, INSTANCES_DIR);
    assert.deepEqual(checkEnv(parseEnvFile("STOREFRONT_FOOTER_REQUISITES=1\n"), profile), [], instance);
  }

  // Off by default: compose passes an empty value when the env file does not name the variable.
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  const storefront = compose.slice(compose.indexOf("container_name: mt-storefront"));
  const service = storefront.slice(0, storefront.indexOf("\n    networks:"));
  assert.match(service, /^ {6}STOREFRONT_FOOTER_REQUISITES: \$\{STOREFRONT_FOOTER_REQUISITES:-\}$/m);
  // The storefront alone gets it: no other service of the stack reads the variable.
  assert.equal(compose.match(/^\s+STOREFRONT_FOOTER_REQUISITES:/gm).length, 1);
});

test("the test-mode dot switch passes the env check on ru and on intl, and compose hands it to the storefront (t-2026-10-08-13)", () => {
  for (const instance of ["ru", "intl"]) {
    const profile = loadProfile(instance, INSTANCES_DIR);
    assert.deepEqual(checkEnv(parseEnvFile("STOREFRONT_HIDE_TEST_MODE_DOT=1\n"), profile), [], instance);
  }

  // Off by default, and the storefront alone gets it.
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  const storefront = compose.slice(compose.indexOf("container_name: mt-storefront"));
  const service = storefront.slice(0, storefront.indexOf("\n    networks:"));
  assert.match(service, /^ {6}STOREFRONT_HIDE_TEST_MODE_DOT: \$\{STOREFRONT_HIDE_TEST_MODE_DOT:-\}$/m);
  assert.equal(compose.match(/^\s+STOREFRONT_HIDE_TEST_MODE_DOT:/gm).length, 1);
});

test("the catalog view controls switch passes the env check on ru and on intl, and compose hands it to the storefront (t-2026-10-06-09)", () => {
  for (const instance of ["ru", "intl"]) {
    const profile = loadProfile(instance, INSTANCES_DIR);
    assert.deepEqual(checkEnv(parseEnvFile("STOREFRONT_CATALOG_VIEW_CONTROLS=bpj,other-shop\n"), profile), [], instance);
  }

  // Off by default, and the storefront alone gets it.
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  const storefront = compose.slice(compose.indexOf("container_name: mt-storefront"));
  const service = storefront.slice(0, storefront.indexOf("\n    networks:"));
  assert.match(service, /^ {6}STOREFRONT_CATALOG_VIEW_CONTROLS: \$\{STOREFRONT_CATALOG_VIEW_CONTROLS:-\}$/m);
  assert.equal(compose.match(/^\s+STOREFRONT_CATALOG_VIEW_CONTROLS:/gm).length, 1);
});

test("the school's sign-in hosts pass the env check on ru, fail it on intl, and compose hands them to the backend and the storefront (t-2026-10-08-36)", () => {
  const env = parseEnvFile("SCHOOL_SSO_RETURN_HOSTS=school.cherkashina.ru\n");
  assert.deepEqual(checkEnv(env, loadProfile("ru", INSTANCES_DIR)), []);
  const intl = checkEnv(env, loadProfile("intl", INSTANCES_DIR));
  assert.equal(intl.length, 1);
  assert.match(intl[0], /^forbidden env SCHOOL_SSO_RETURN_HOSTS is set/);
  // Named but empty is not set, so the INTL template's silence and an empty line both pass.
  assert.deepEqual(checkEnv(parseEnvFile("SCHOOL_SSO_RETURN_HOSTS=\n"), loadProfile("intl", INSTANCES_DIR)), []);

  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  for (const name of ["mt-backend", "mt-storefront"]) {
    const from = compose.slice(compose.indexOf(`container_name: ${name}`));
    const service = from.slice(0, from.indexOf("\n    networks:"));
    assert.match(service, /^ {6}SCHOOL_SSO_RETURN_HOSTS: \$\{SCHOOL_SSO_RETURN_HOSTS:-\}$/m, name);
  }
  assert.equal(compose.match(/^\s+SCHOOL_SSO_RETURN_HOSTS:/gm).length, 2);
});

test("compose.mt.yml gives the relay the default domain this check assumes, and takes both keys from the env file", () => {
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  assert.ok(compose.includes(`ALLOWED_SENDER_DOMAINS: \${MAIL_SENDER_DOMAINS:-${DEFAULT_SENDER_DOMAINS.join(" ")}}`));
  assert.match(compose, /POSTFIX_myhostname: \$\{MAIL_HOSTNAME:-[^}]+\}/);
});

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

test("the tool exits 1 on a RU env that turns its own relay on with the INTL host's name and domain, and never prints the sender", () => {
  const template = readFileSync(path.join(REPO, "deploy", "mt", "ru.env.example"), "utf8");
  const withMail = (lines) => writeScratch("ru-mail.env", [template, ...lines]);

  const wrong = runTool(["--instance", "ru", "--env", withMail(["SMTP_HOST=mail", "SMTP_FROM=noreply@cherkashino.ru"])]);
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stderr.match(/^VIOLATION: (MAIL_HOSTNAME|MAIL_SENDER_DOMAINS) is not set/gm).length, 2);
  assert.match(wrong.stderr, /^VIOLATION: SMTP_FROM is not an address in a domain the relay signs for/m);
  assert.doesNotMatch(wrong.stdout + wrong.stderr, /noreply@/);

  const right = withMail(["SMTP_HOST=mail", "SMTP_FROM=noreply@cherkashino.ru", "MAIL_HOSTNAME=mail.cherkashino.ru", "MAIL_SENDER_DOMAINS=cherkashino.ru"]);
  assert.equal(runTool(["--instance", "ru", "--env", right]).status, 0);
});

const RU_ROW = `olavka|${RU_HOSTS.join(",")}`;

test("the tool exits 1 on a tenant of another instance and 0 on a database of its own shops", () => {
  const intlArgs = ["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--db", DB_URL];
  const ruArgs = ["--instance", "ru", "--env", "deploy/mt/ru.env.example", "--db", DB_URL];

  const intlClean = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: "acme|\ncherkashino-com|cherkashino.com,www.cherkashino.com" });
  assert.equal(intlClean.status, 0, intlClean.stderr);
  assert.equal(intlClean.stderr, "");
  const ruClean = runTool(ruArgs, { FAKE_LOGINS: "yandex", FAKE_TENANTS: RU_ROW });
  assert.equal(ruClean.status, 0, ruClean.stderr);

  const intlDirty = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: "acme|cherkashino.ru\ncherkashino-com|cherkashino.com" });
  assert.equal(intlDirty.status, 1);
  assert.match(intlDirty.stderr, /^VIOLATION: tenant "acme" answers on a domain of instance ru \(cherkashino\.ru\) /m);

  const ruDirty = runTool(ruArgs, { FAKE_LOGINS: "yandex\nyandex", FAKE_TENANTS: `acme|\n${RU_ROW}` });
  assert.equal(ruDirty.status, 1);
  assert.match(ruDirty.stderr, /^VIOLATION: tenant "acme" has no address on the domains of instance ru /m);
});

test("the tool prints a recorded exception as a known violation and keeps its exit code", () => {
  const intlArgs = ["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--db", DB_URL];

  // Recorded exactly: named in the log, exit 0.
  const recorded = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: `cherkashino-com|cherkashino.com\n${RU_ROW}` });
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.match(recorded.stderr, /^KNOWN VIOLATION \(recorded\): tenant "olavka" answers on a domain of instance ru /m);
  assert.doesNotMatch(recorded.stderr, /^VIOLATION: /m);
  // The run passes, and its last line does not call the instance clean.
  assert.match(recorded.stdout, /^instance-check: intl has no new violation, 1 recorded one\(s\) above /m);
  assert.doesNotMatch(recorded.stdout, /is clean/);

  // One more RU host on the recorded tenant: exit 1.
  const grown = runTool(intlArgs, { FAKE_LOGINS: "both", FAKE_TENANTS: `${RU_ROW},m.cherkashino.ru` });
  assert.equal(grown.status, 1);
  assert.match(grown.stderr, /^VIOLATION: tenant "olavka" .*m\.cherkashino\.ru/m);

  // The recorded tenant next to an unrecorded one: the known line stays, the exit code is 1.
  const mixed = runTool(intlArgs, { FAKE_LOGINS: "both\nboth", FAKE_TENANTS: `acme|www.cherkashino.ru\n${RU_ROW}` });
  assert.equal(mixed.status, 1);
  assert.match(mixed.stderr, /^KNOWN VIOLATION \(recorded\): tenant "olavka" /m);
  assert.match(mixed.stderr, /^VIOLATION: tenant "acme" /m);
});

test("the tool exits 2 on a recorded exception that does not say what closes it", () => {
  // A copy of the tool beside a copy of the profiles, with the entry's `closes` taken out.
  const copy = path.join(SCRATCH, "copy");
  mkdirSync(path.join(copy, "scripts"), { recursive: true });
  cpSync(TOOL, path.join(copy, "scripts", "instance-check.mjs"));
  cpSync(INSTANCES_DIR, path.join(copy, "instances"), { recursive: true });
  const file = path.join(copy, "instances", "intl.json");
  const profile = JSON.parse(readFileSync(file, "utf8"));
  delete profile.tenants.recordedExceptions[0].closes;
  writeFileSync(file, JSON.stringify(profile));

  const run = spawnSync(process.execPath, [path.join(copy, "scripts", "instance-check.mjs"), "--instance", "intl", "--env", "deploy/mt/shipshift.env.example"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage error: profile "intl" has a recorded exception for "olavka" without closes/);
});

test("the tool exits 2 without the database password in its output when psql fails", () => {
  const failed = runTool(["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--db", DB_URL], { FAKE_PSQL_FAIL: "1" });
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /error reading --db: psql failed with status 2/);
  assert.doesNotMatch(failed.stdout + failed.stderr, /s3cretpw/);
});

test("the tool says that backup targets were not checked when it has no backup env to read, and does not fail on it", () => {
  const none = path.join(SCRATCH, "none.env");
  const missing = runTool(["--instance", "ru", "--env", "deploy/mt/ru.env.example", "--backup-env", none]);
  assert.equal(missing.status, 0, missing.stderr);
  assert.ok(missing.stdout.includes(`instance-check: backup targets NOT checked (no such file: ${none})`));
  assert.doesNotMatch(missing.stdout, /backup targets in /);

  const notGiven = runTool(["--instance", "intl", "--env", "deploy/mt/shipshift.env.example"]);
  assert.equal(notGiven.status, 0, notGiven.stderr);
  assert.match(notGiven.stdout, /^instance-check: backup targets NOT checked \(no --backup-env given\)$/m);

  const given = runTool(["--instance", "intl", "--env", "deploy/mt/shipshift.env.example", "--backup-env", "deploy/backup/nightly.env.example"]);
  assert.doesNotMatch(given.stdout, /NOT checked/);
});

const school = (lines) => readEnvValues(lines.join("\n"), SCHOOL_KEYS);

test("checkSchool: the school runs on RU's own domain and reads RU's own shop, and nowhere else (t-2026-10-08-37)", () => {
  const ru = loadProfile("ru", INSTANCES_DIR);
  const intl = loadProfile("intl", INSTANCES_DIR);
  const own = ["SCHOOL_DOMAIN=school.cherkashina.ru", "SCHOOL_SHOP_ORIGIN=https://cherkashino.ru"];
  assert.deepEqual(checkSchool(school(own), ru, [intl]), []);
  // No school at all is no violation on either instance.
  assert.deepEqual(checkSchool(school([]), ru, [intl]), []);
  assert.deepEqual(checkSchool(school(["SCHOOL_DOMAIN="]), intl, [ru]), []);

  const otherHost = checkSchool(school(["SCHOOL_DOMAIN=school.example.org"]), ru, [intl]);
  assert.deepEqual(otherHost, ["SCHOOL_DOMAIN is not a school domain of instance ru (allowed: school.cherkashina.ru)"]);

  const foreignShop = checkSchool(school(["SCHOOL_SHOP_ORIGIN=https://cherkashino.com"]), ru, [intl]);
  assert.equal(foreignShop.length, 1);
  assert.match(foreignShop[0], /^SCHOOL_SHOP_ORIGIN is not a shop of instance ru but of instance intl/);
  // RU holds only the shops its profile names, so a shop on no profile's domain is not RU's either.
  assert.match(checkSchool(school(["SCHOOL_SHOP_ORIGIN=https://shop.example.org"]), ru, [intl])[0], /^SCHOOL_SHOP_ORIGIN is not a shop of instance ru —/);

  // INTL names no school domain, and RU's shop is not INTL's to read.
  const onIntl = checkSchool(school(own), intl, [ru]);
  assert.deepEqual(onIntl.map((line) => line.split(" ")[0]), ["SCHOOL_DOMAIN", "SCHOOL_SHOP_ORIGIN"]);
  assert.match(onIntl[0], /\(allowed: none\)$/);
  assert.match(onIntl[1], /but of instance ru/);
});

test("the tool exits 1 on an INTL env that runs RU's school, and never prints the domain or the shop", () => {
  const env = writeScratch("intl-school.env", [
    readFileSync(path.join(REPO, "deploy", "mt", "shipshift.env.example"), "utf8"),
    "SCHOOL_DOMAIN=school.cherkashina.ru",
    "SCHOOL_SHOP_ORIGIN=https://cherkashino.ru",
  ]);
  const run = runTool(["--instance", "intl", "--env", env]);
  assert.equal(run.status, 1);
  assert.equal(run.stderr.match(/^VIOLATION: SCHOOL_/gm).length, 2);
  assert.doesNotMatch(run.stderr, /school\.cherkashina\.ru|https:\/\/cherkashino\.ru/);
});

test("compose.mt.yml starts the school only under its own profile and takes its keys from the env file", () => {
  const compose = readFileSync(path.join(REPO, "deploy", "compose.mt.yml"), "utf8");
  const start = compose.indexOf("\n  school:\n");
  assert.notEqual(start, -1);
  const service = compose.slice(start, compose.indexOf("\n\n", start + 1));
  assert.match(service, /^ {4}profiles: \["school"\]$/m);
  for (const key of ["SCHOOL_DOMAIN", "SCHOOL_PUBLISHABLE_KEY", "SCHOOL_SHOP_ORIGIN"]) {
    assert.match(service, new RegExp(`^ {6}${key}: \\$\\{${key}:-\\}$`, "m"), key);
  }
  // The landing owns `/` on the same host: the school's routers never claim it.
  for (const rule of service.match(/rule=.*$/gm)) {
    assert.match(rule, /PathPrefix\(`\/app`\)/);
    assert.doesNotMatch(rule, /PathPrefix\(`\/`\)/);
  }
});
