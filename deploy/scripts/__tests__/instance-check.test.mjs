// Unit tests for deploy/scripts/instance-check.mjs — no Postgres, no Docker,
// no network: every function under test is pure, and the one that shells out
// to psql (queryDb) is exercised only through the pure functions it feeds
// (checkDbProviders, checkDbAnalytics), never by actually running psql.
//
//   node --test deploy/scripts/__tests__/instance-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  parseEnvFile,
  loadProfile,
  forbiddenProviders,
  checkEnv,
  checkDbProviders,
  checkDbAnalytics,
  UsageError,
  INSTANCES_DIR,
} from "../instance-check.mjs";

test("parseArgs reads --flag value and --flag=value the same way", () => {
  assert.deepEqual(parseArgs(["--instance", "ru", "--env", "a.env"]), {
    instance: "ru",
    env: "a.env",
    db: null,
  });
  assert.deepEqual(parseArgs(["--instance=intl", "--env=b.env", "--db=postgres://x"]), {
    instance: "intl",
    env: "b.env",
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
