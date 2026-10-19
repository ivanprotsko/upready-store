import { test } from "node:test";
import assert from "node:assert/strict";

import { readConfig } from "../config.ts";
import { buildUrl, type FetchFn, HttpShopApi, ShopApiError } from "./api.ts";

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** A mocked network: records every request and answers from `respond`. */
function mockFetch(respond: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fn: FetchFn = async (input, init) => {
    const call: Call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status });
  };
  return { fn, calls };
}

const shop = { ...readConfig({}).shop, login: { email: "owner@shop.test", password: "pw" } };

test("Store API: the publishable key comes from /storefront/by-host and travels with the locale", async () => {
  const net = mockFetch((c) =>
    c.url.pathname === "/storefront/by-host" ? { body: { publishable_key: "pk_live" } } : { body: { products: [] } },
  );
  const api = new HttpShopApi(shop, { store: net.fn, owner: net.fn });
  await api.store("/store/products", { q: "кашта", limit: 5 });
  await api.store("/store/products", { q: "печен" });

  assert.equal(net.calls[0]!.url.searchParams.get("host"), "cherkashino.com");
  assert.equal(net.calls.filter((c) => c.url.pathname === "/storefront/by-host").length, 1, "the key is fetched once");
  const products = net.calls[1]!;
  assert.equal(products.url.origin, "https://shipshift.dev");
  assert.equal(products.url.searchParams.get("q"), "кашта");
  assert.equal(products.headers["x-publishable-api-key"], "pk_live");
  assert.equal(products.headers["x-medusa-locale"], "ru");
  assert.equal(products.method, "GET");
});

test("the region for prices is the one holding SHOP_COUNTRY", async () => {
  const net = mockFetch((c) =>
    c.url.pathname === "/storefront/by-host"
      ? { body: { publishable_key: "pk" } }
      : { body: { regions: [{ id: "reg_us", countries: [{ iso_2: "us" }] }, { id: "reg_ru", countries: [{ iso_2: "ru" }] }] } },
  );
  const api = new HttpShopApi(shop, { store: net.fn, owner: net.fn });
  assert.equal(await api.regionId(), "reg_ru");
  assert.equal(await api.regionId(), "reg_ru");
  assert.equal(net.calls.filter((c) => c.url.pathname === "/store/regions").length, 1, "looked up once");
});

test("shop panel API: logs in once, sends the bearer, logs in again on 401", async () => {
  let tokens = 0;
  let firstOrders = true;
  const net = mockFetch((c) => {
    if (c.url.pathname === "/auth/tenant/emailpass") return { body: { token: `t${++tokens}` } };
    if (firstOrders) {
      firstOrders = false;
      return { status: 401, body: { message: "expired" } };
    }
    return { body: { orders: [], count: 0 } };
  });
  const api = new HttpShopApi(shop, { store: net.fn, owner: net.fn });
  await api.owner("/tenants/orders", { limit: 5 });

  const [login, expired, relogin, retry] = net.calls;
  assert.equal(login!.method, "POST");
  assert.equal(relogin!.url.pathname, "/auth/tenant/emailpass");
  assert.deepEqual(JSON.parse(login!.body!), { email: "owner@shop.test", password: "pw" });
  assert.equal(expired!.headers.authorization, "Bearer t1");
  assert.equal(retry!.headers.authorization, "Bearer t2");
  assert.equal(net.calls.length, 4);
});

test("only GET on /store and /tenants leaves the client", async () => {
  const net = mockFetch(() => ({ body: { token: "t" } }));
  const api = new HttpShopApi(shop, { store: net.fn, owner: net.fn });
  await assert.rejects(api.owner("/admin/orders"), /Not a shop panel API path/);
  await assert.rejects(api.store("/tenants/orders"), /Not a Store API path/);
  assert.equal(net.calls.length, 0);
  await api.owner("/tenants/reviews");
  assert.deepEqual(
    net.calls.map((c) => c.method),
    ["POST", "GET"],
    "the login is the only POST",
  );
});

test("without a shop login the panel API refuses before any request", async () => {
  const net = mockFetch(() => ({ body: {} }));
  const api = new HttpShopApi({ ...shop, login: null }, { store: net.fn, owner: net.fn });
  await assert.rejects(api.owner("/tenants/orders"), (err) => err instanceof ShopApiError && err.status === 401);
  assert.equal(net.calls.length, 0);
});

test("buildUrl repeats a list parameter and drops empty ones", () => {
  const url = new URL(buildUrl("https://shipshift.dev", "/tenants/reviews", { product_id: ["a", "b"], q: "", limit: 5, x: undefined }));
  assert.deepEqual(url.searchParams.getAll("product_id"), ["a", "b"]);
  assert.equal(url.searchParams.has("q"), false);
  assert.equal(url.searchParams.get("limit"), "5");
});
