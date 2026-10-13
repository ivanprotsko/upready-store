// Unit tests for deploy/scripts/tenant-paid.mjs, the operator's paid mark
// (t-2026-10-14-11). No network: the HTTP client takes a stand-in fetch.
//
//   node --test deploy/scripts/__tests__/tenant-paid.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageError, allTenants, client, describe, findTenant, listLines, paidBody, parseArgs } from "../tenant-paid.mjs";

const NOW = new Date("2026-10-14T01:00:00Z");
const OK = ["--tenant", "olavka", "--via", "tribute", "--ref", "ord_123"];

test("parseArgs takes a handle, via and ref, and defaults --at to now", () => {
  const args = parseArgs(OK, NOW);
  assert.equal(args.tenant, "olavka");
  assert.equal(args.via, "tribute");
  assert.equal(args.ref, "ord_123");
  assert.equal(args.at, "2026-10-14T01:00:00.000Z");
  assert.equal(args.dryRun, false);
});

test("parseArgs takes a tenant id, --flag=value and a normalised --at", () => {
  const args = parseArgs(["--tenant=ten_01ABC", "--via=tribute", "--ref=r1", "--at", "2026-10-13T10:00:00+08:00", "--dry-run"], NOW);
  assert.equal(args.tenant, "ten_01ABC");
  assert.equal(args.at, "2026-10-13T02:00:00.000Z");
  assert.equal(args.dryRun, true);
});

test("parseArgs refuses a missing or bad tenant, via, ref and at", () => {
  const bad = [
    ["--via", "tribute", "--ref", "r"],
    ["--tenant", "Bad Handle", "--via", "tribute", "--ref", "r"],
    ["--tenant", "olavka", "--via", "stripe", "--ref", "r"],
    ["--tenant", "olavka", "--via", "tribute"],
    ["--tenant", "olavka", "--via", "tribute", "--ref", "a b;c"],
    [...OK, "--at", "yesterday"],
    [...OK, "--at"],
    [...OK, "--nope"],
  ];
  for (const argv of bad) assert.throws(() => parseArgs(argv, NOW), UsageError, argv.join(" "));
});

test("--list takes nothing else", () => {
  assert.equal(parseArgs(["--list"]).list, true);
  assert.throws(() => parseArgs(["--list", "--tenant", "olavka"]), UsageError);
  assert.throws(() => parseArgs(["--list", "--dry-run"]), UsageError);
});

test("the request body is exactly the three metadata keys", () => {
  assert.deepEqual(paidBody(parseArgs(OK, NOW)), {
    metadata: { paid_via: "tribute", paid_at: "2026-10-14T01:00:00.000Z", tribute_ref: "ord_123" },
  });
});

test("describe and listLines show date, via, ref; newest first, unpaid left out", () => {
  assert.equal(describe(null), "not marked paid");
  assert.equal(describe({ paid_via: "tribute", paid_at: "2026-10-14", tribute_ref: "r1" }), "paid via tribute at 2026-10-14, ref r1");
  const lines = listLines([
    { handle: "a", metadata: { paid_via: "tribute", paid_at: "2026-10-12", tribute_ref: "r1" } },
    { handle: "b", metadata: { live: true } },
    { handle: "c", metadata: { paid_via: "tribute", paid_at: "2026-10-14", tribute_ref: "r2" } },
    { handle: "d", metadata: null },
  ]);
  assert.deepEqual(lines, ["2026-10-14  tribute  r2  c", "2026-10-12  tribute  r1  a"]);
});

const fakeFetch = (routes, seen = []) => async (url, init) => {
  seen.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
  const handler = routes[`${init.method} ${new URL(url).pathname}`];
  if (!handler) return { ok: false, status: 404, statusText: "Not Found", text: async () => JSON.stringify({ message: "nope" }) };
  return { ok: true, status: 200, text: async () => JSON.stringify(handler(new URL(url), init)) };
};

test("the client sends a Bearer token, or Basic for an sk_ key", async () => {
  const seen = [];
  await client("https://x.test/", "jwt.value", fakeFetch({ "GET /admin/tenants": () => ({}) }, seen)).get("/admin/tenants");
  await client("https://x.test", "sk_abc", fakeFetch({ "GET /admin/tenants": () => ({}) }, seen)).get("/admin/tenants");
  assert.equal(seen[0].headers.authorization, "Bearer jwt.value");
  assert.equal(seen[1].headers.authorization, `Basic ${Buffer.from("sk_abc:").toString("base64")}`);
});

test("findTenant matches a handle exactly, reads an id directly, and answers null for a missing one", async () => {
  const http = client("https://x.test", "t", fakeFetch({
    "GET /admin/tenants": () => ({ tenants: [{ id: "ten_2", handle: "olavka-shop" }, { id: "ten_1", handle: "olavka" }] }),
    "GET /admin/tenants/ten_9": () => ({ tenant: { id: "ten_9", handle: "nine" } }),
  }));
  assert.equal((await findTenant(http, "olavka")).id, "ten_1");
  assert.equal(await findTenant(http, "other"), null);
  assert.equal((await findTenant(http, "ten_9")).handle, "nine");
  assert.equal(await findTenant(http, "ten_404"), null);
});

test("the write is one POST to the tenant id with the three keys", async () => {
  const seen = [];
  const http = client("https://x.test", "t", fakeFetch({
    "POST /admin/tenants/ten_1": (_url, init) => ({ tenant: { id: "ten_1", handle: "olavka", metadata: JSON.parse(init.body).metadata } }),
  }, seen));
  const { tenant } = await http.post("/admin/tenants/ten_1", paidBody(parseArgs(OK, NOW)));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "POST");
  assert.deepEqual(Object.keys(JSON.parse(seen[0].body)), ["metadata"]);
  assert.equal(tenant.metadata.tribute_ref, "ord_123");
});

test("allTenants walks every page", async () => {
  const http = client("https://x.test", "t", fakeFetch({
    "GET /admin/tenants": (url) => {
      const offset = Number(url.searchParams.get("offset"));
      return { tenants: [{ id: `ten_${offset}` }], count: 201, offset };
    },
  }));
  assert.equal((await allTenants(http)).length, 2);
});
