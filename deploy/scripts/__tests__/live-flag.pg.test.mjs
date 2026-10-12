// The live check and Ivan's switch against a real Postgres, t-2026-10-12-31.
// instance-check.test.mjs and tenant-live.test.mjs stand a script in for psql;
// this file runs the very SQL both tools send, on the real schema.
//
// It runs only when LIVE_CHECK_PG_URL names a scratch database with the
// backend's schema (a copy of an integration-test template does) and psql is
// on PATH. Without it every test here is skipped, which is what CI does.
//
//   LIVE_CHECK_PG_URL=postgres://localhost:5433/scratch node --test deploy/scripts/__tests__/live-flag.pg.test.mjs
//
// Every row is synthetic and made here, under handles of this run's own, so
// a run never reads or changes a row it did not write. Nothing is deleted:
// the rows stay in the scratch database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveSignal, liveVerdict, queryLiveSigns } from "../instance-check.mjs";

const DB = process.env.LIVE_CHECK_PG_URL;
const skip = DB ? false : "LIVE_CHECK_PG_URL is not set";
const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tenant-live.mjs");
const RUN = `t31${Date.now().toString(36)}`;
// A customer's e-mail is unique (with has_account), and rows stay from run to run, so each run has its own.
const mail = (local, domain) => `${local}-${RUN}@${domain}`;

const sql = (statement) => execFileSync("psql", [DB, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" });
const q = (value) => (value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);

let serial = 0;
const id = (prefix) => `${prefix}_${RUN}_${(serial += 1)}`;

function tenant(suffix, metadata) {
  const tenantId = id("ten");
  sql(`INSERT INTO tenant (id, handle, name, metadata) VALUES (${q(tenantId)}, ${q(`${RUN}-${suffix}`)}, 'Synthetic', ${q(JSON.stringify(metadata))}::jsonb)`);
  return tenantId;
}

function customer(email, tenantId = null) {
  const customerId = id("cus");
  const metadata = tenantId ? JSON.stringify({ tenant_id: tenantId }) : null;
  sql(`INSERT INTO customer (id, email, metadata) VALUES (${q(customerId)}, ${q(email)}, ${metadata ? `${q(metadata)}::jsonb` : "NULL"})`);
  return customerId;
}

/** An order of the tenant, and when `session` is given a payment session with that `data`. */
function order(tenantId, email, { customerId = null, session = null } = {}) {
  const orderId = id("order");
  sql(`INSERT INTO "order" (id, currency_code, email, customer_id) VALUES (${q(orderId)}, 'rub', ${q(email)}, ${q(customerId)})`);
  sql(`INSERT INTO tenant_tenant_order_order (id, tenant_id, order_id) VALUES (${q(id("tenord"))}, ${q(tenantId)}, ${q(orderId)})`);
  if (session) {
    const collection = id("pay_col");
    sql(`INSERT INTO payment_collection (id, currency_code, amount, raw_amount) VALUES (${q(collection)}, 'rub', 100, '{"value":"100","precision":20}'::jsonb)`);
    sql(`INSERT INTO order_payment_collection (id, order_id, payment_collection_id) VALUES (${q(id("ordpay"))}, ${q(orderId)}, ${q(collection)})`);
    sql(
      `INSERT INTO payment_session (id, currency_code, amount, raw_amount, provider_id, payment_collection_id, data) VALUES (${q(id("payses"))}, 'rub', 100, '{"value":"100","precision":20}'::jsonb, 'pp_synthetic', ${q(collection)}, ${q(JSON.stringify(session))}::jsonb)`,
    );
  }
  return orderId;
}

function account(tenantId, provider, { isTest, isEnabled = true }) {
  sql(
    `INSERT INTO tenant_integration_secret (id, provider, payload, is_test, is_enabled, tenant_id) VALUES (${q(id("tis"))}, ${q(provider)}, 'synthetic-not-encrypted', ${isTest}, ${isEnabled}, ${q(tenantId)})`,
  );
}

const signsOf = () => new Map(queryLiveSigns(DB).filter((row) => row.handle.startsWith(`${RUN}-`)).map((row) => [row.handle.slice(RUN.length + 1), row]));

test("the live check classifies synthetic shops on the real schema", { skip }, () => {
  // A shop under test: e-mails on reserved and team domains, and Robokassa in its test contour.
  const fixture = tenant("fixture", { test_shop: false });
  const tester = customer(`buyer-${RUN}+test@mail.ru`, fixture);
  order(fixture, `buyer-${RUN}+test@mail.ru`, { customerId: tester, session: { is_test: true } });
  order(fixture, "a@sub.example.com", { session: { is_test: true } });
  order(fixture, "qa@acme.test");
  order(fixture, "staff@upready.dev");
  order(fixture, "owner@test.shop-domain.ru");
  // A real-looking address that paid in the test contour is a test order, and its customer a test one.
  const colleague = customer(mail("synthetic-1", "gmail.com"), fixture);
  order(fixture, mail("synthetic-1", "gmail.com"), { customerId: colleague, session: { is_test: true } });
  account(fixture, "robokassa", { isTest: true });
  account(fixture, "tribute", { isTest: true }); // its is_test means nothing, so it is not read

  // A shop with a real-looking buyer who paid live, and live accounts.
  const real = tenant("real", {});
  const buyer = customer(mail("synthetic-2", "mail.ru"), real);
  order(real, mail("synthetic-2", "mail.ru"), { customerId: buyer, session: { is_test: false } });
  order(real, mail("synthetic-3", "notexample.com"));
  account(real, "robokassa", { isTest: false });
  account(real, "cdek", { isTest: false });
  account(real, "pochta", { isTest: true, isEnabled: false }); // switched off, so not read

  // A live shop: a Telegram buyer (tg_<id>@telegram.local is a real person) and an x402 test-network order.
  const mixed = tenant("mixed", { live: true, live_since: "2026-10-01", live_by: "ivan" });
  customer(`tg_${Date.now()}@telegram.local`, mixed);
  order(mixed, mail("synthetic-4", "yandex.ru"), { session: { testnet: true } });

  // A live shop with nothing in it.
  tenant("empty", { live: true, live_since: "2026-10-12", live_by: "ivan" });

  const signs = signsOf();
  assert.deepEqual([...signs.keys()].sort(), ["empty", "fixture", "mixed", "real"]);

  const f = signs.get("fixture");
  assert.deepEqual(f.orders, { total: 6, testEmail: 5, testPaid: 3, test: 6 });
  assert.deepEqual(f.customers, { total: 2, testEmail: 1, test: 2 });
  assert.deepEqual(f.accounts, [{ provider: "robokassa", mode: "test" }]);
  assert.equal(f.live, false);
  assert.equal(liveVerdict(f), "test-only");
  assert.equal(liveSignal(f), null);

  const r = signs.get("real");
  assert.deepEqual(r.orders, { total: 2, testEmail: 0, testPaid: 0, test: 0 });
  assert.deepEqual(r.customers, { total: 1, testEmail: 0, test: 0 });
  assert.deepEqual(r.accounts, [{ provider: "cdek", mode: "live" }, { provider: "robokassa", mode: "live" }]);
  assert.equal(liveVerdict(r), "real-signs");
  assert.match(liveSignal(r), /is not live .* shows real signs \(real-signs\)/);

  const m = signs.get("mixed");
  assert.equal(m.live, true);
  assert.equal(m.since, "2026-10-01");
  assert.equal(m.by, "ivan");
  assert.deepEqual(m.orders, { total: 1, testEmail: 0, testPaid: 1, test: 1 });
  assert.deepEqual(m.customers, { total: 1, testEmail: 0, test: 0 });
  assert.equal(liveVerdict(m), "mixed");
  assert.equal(liveSignal(m), null);

  const e = signs.get("empty");
  assert.equal(liveVerdict(e), "test-only");
  assert.match(liveSignal(e), /is live since 2026-10-12 but shows test signs only/);
});

test("Ivan's switch writes the three keys on the real schema and leaves every other key alone", { skip }, () => {
  const handle = `${RUN}-switch`;
  tenant("switch", { test_shop: false, buyer_login_method: "yandex" });
  const env = { ...process.env };
  const tool = (...args) => spawnSync(process.execPath, [TOOL, "--db", DB, "--handle", handle, ...args], { encoding: "utf8", env });

  const shown = tool("--show");
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(shown.stdout.trim(), `tenant-live: --db tenant "${handle}" live=false`);

  const on = tool("--live", "true", "--by", "ivan", "--since", "2026-10-12", "--yes-ivan");
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.stdout.trim(), `tenant-live: --db tenant "${handle}" was live=false, now live=true since 2026-10-12 by ivan`);

  const metadata = JSON.parse(sql(`SELECT metadata FROM tenant WHERE handle = ${q(handle)}`).trim());
  assert.deepEqual(metadata, { test_shop: false, buyer_login_method: "yandex", live: true, live_since: "2026-10-12", live_by: "ivan" });

  const off = tool("--live", "false", "--by", "ivan", "--since", "2026-10-13", "--yes-ivan");
  assert.equal(off.status, 0, off.stderr);
  assert.match(off.stdout, /was live=true since 2026-10-12 by ivan, now live=false since 2026-10-13 by ivan/);

  const missing = spawnSync(process.execPath, [TOOL, "--db", DB, "--handle", `${RUN}-nobody`, "--live", "false", "--by", "ivan", "--yes-ivan"], { encoding: "utf8", env });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no tenant ".*-nobody" on --db; nothing changed/);
});
