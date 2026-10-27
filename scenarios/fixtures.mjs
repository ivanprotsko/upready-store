// Fixtures of the Upready Store scenarios (t-2026-10-28-26: the list and the first recorded scenarios of the click-through gate).
// The contract is ui-walk's walk/fixtures.mjs, as scenario.mjs and ui-walk replay call it:
//   reset({context, scenario})       a clean test shop: a new shop with its own owner, so no earlier run leaves anything behind
//   seed(scenario) → fx               what one scenario needs on top of the shop: a product, a placed order, a buyer
//   login(actor, {context, …})        a session on the context for owner | buyer → {context, page}; guest has none
//   secret(name)                      the value of a secret, from the environment of the run only
// The stand is a LOCAL copy of the app: a Medusa backend on 127.0.0.1 with its own database, the storefront on
// <handle>.localhost, the tenant panel on 127.0.0.1. A backend that is not on localhost, or a database not named
// sc_store_* , is refused: nothing here touches a live shop, a live database or a live key.
// Test people are made fresh by every reset: the shop handle and the e-mails carry a run suffix, the password is
// SC_TEST_PASSWORD of the environment (a random one per process only while no shop exists yet). No value of a secret is printed or written.
//
//   SC_BACKEND_URL    the local backend            (default http://localhost:9371)
//   SC_PANEL_URL      the tenant panel             (default http://127.0.0.1:5180)
//   SC_STOREFRONT_PORT the storefront port         (default 8010; the shop is http://<handle>.localhost:<port>)
//   SC_TEST_PASSWORD  the password of the test people (default: random per process)
//   DATABASE_URL      optional: when set, its database name is checked against sc_store_*
import crypto from "node:crypto";

const BACKEND = (process.env.SC_BACKEND_URL || "http://localhost:9371").replace(/\/$/, "");
const PANEL = (process.env.SC_PANEL_URL || "http://127.0.0.1:5180").replace(/\/$/, "");
const SF_PORT = process.env.SC_STOREFRONT_PORT || "8010";

const SAFE_DB = /^sc_store_[a-z0-9_]+$/;
function guard() {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BACKEND))
    throw new Error(`fixtures: SC_BACKEND_URL «${BACKEND}» is not a localhost stand`);
  if (process.env.DATABASE_URL) {
    const name = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
    if (!SAFE_DB.test(name)) throw new Error(`fixtures: database «${name}» is not a test database (sc_store_*)`);
    const host = new URL(process.env.DATABASE_URL).hostname;
    if (!/^(localhost|127\.0\.0\.1)$/.test(host)) throw new Error(`fixtures: database host «${host}» is not local`);
  }
}

let generated = null;
/** A secret of the run: the environment, else (the test password only) one random value per process. */
export function secret(name) {
  if (process.env[name]) return process.env[name];
  if (name === "SC_TEST_PASSWORD") {
    if (!generated) generated = `Sc-${crypto.randomBytes(9).toString("base64url")}-1`;
    return generated;
  }
  // the CVC of the demo card of the test checkout: «Тестовая оплата — деньги не списываются», not a real secret
  if (name === "SC_TEST_CVC") return "123";
  return undefined;
}

let state = null; // the shop of this process: {handle, ownerEmail, key, ownerToken, region}

async function call(method, path, { body, token, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["x-publishable-api-key"] = key;
  const res = await fetch(BACKEND + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { ok: res.status < 400, status: res.status, data };
}
const must = (r, what) => {
  if (!r.ok) throw new Error(`fixtures: ${what} answered ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  return r.data;
};

export const SHOP = { handle: "scgate", name: "Тестовый магазин" };
export const shopUrl = (handle = state?.handle || SHOP.handle) => `http://${handle}.localhost:${SF_PORT}`;
export const panelUrl = () => PANEL;

/** The shop every scenario starts from. A fixed handle, so a recorded url replays: the shop is made once and reused. */
const BASE_HANDLE = "scgate";

/** The test shop and its owner, through the sign-up of the platform (POST /tenants), the way a person gets one.
 *  A second reset finds the shop by its owner's login and reuses it; goods and orders are added by seed(). */
export async function reset({ scenario } = {}) {
  guard();
  // a scenario that reads a list of orders gets a shop of its own each run: the list holds exactly the order the seed adds
  const HANDLE = scenario?.id === "owner-see-order" ? `scorders${crypto.randomBytes(3).toString("hex")}` : BASE_HANDLE;
  const OWNER = `owner-${HANDLE}@example.test`;
  const password = secret("SC_TEST_PASSWORD");
  let login = await call("POST", "/auth/tenant/emailpass", { body: { email: OWNER, password } });
  if (!login.ok) {
    const reg0 = await call("POST", "/auth/tenant/emailpass/register", { body: { email: OWNER, password } });
    if (!reg0.ok)
      throw new Error(
        `fixtures: the owner of «${HANDLE}» does not accept SC_TEST_PASSWORD (login ${login.status}, register ${reg0.status}); set the password the shop was made with`,
      );
    const reg = reg0.data;
    const made = await call("POST", "/tenants", {
      token: reg.token,
      body: { name: HANDLE === BASE_HANDLE ? "Тестовый магазин" : `Тестовый магазин ${HANDLE}`, handle: HANDLE, admin: { email: OWNER, first_name: "Ольга", last_name: "Владелец" } },
    });
    if (!made.ok)
      throw new Error(`fixtures: sign-up of the test shop answered ${made.status} ${JSON.stringify(made.data).slice(0, 200)}`);
    login = must(await call("POST", "/auth/tenant/emailpass", { body: { email: OWNER, password } }), "owner login");
  } else login = login.data;
  const token = login.token ?? login.data?.token;
  const me = must(await call("GET", "/tenants/me", { token }), "GET /tenants/me");
  const key = me.tenant_admin?.tenant?.api_key?.token;
  if (!key) throw new Error("fixtures: the test shop has no publishable key");
  state = { handle: HANDLE, ownerEmail: OWNER, key, ownerToken: token };
}

/** Goods for the shop, by the owner's own API; a buyer's order when the scenario is about orders. */
export async function seed(scenario = {}) {
  if (!state) await reset();
  const fx = { handle: state.handle, shop: shopUrl(), panel: PANEL, ownerEmail: state.ownerEmail };
  await ensureProduct();
  fx.buyerEmail = BUYER;
  if (/^buyer-(checkout|phone)/.test(scenario.id || "")) await ensureBuyer();
  if (scenario.id === "owner-see-order") fx.order = await placeOrder();
  if (scenario.id === "owner-add-product") await dropCreated();
  if (/^buyer-/.test(scenario.id || "")) await warm();
  return fx;
}

/** The product the scenario creates ("Пробная кружка") is removed first, so a repeat starts from the same list
 *  (the handle of a product is global, a second one with the same name would be refused). */
async function dropCreated() {
  const list = await call("GET", "/tenants/products?limit=100&fields=id,title", { token: state.ownerToken });
  for (const p of list.data.products ?? [])
    if (p.title === "Пробная кружка") await call("DELETE", `/tenants/products/${p.id}`, { token: state.ownerToken });
}

/** The storefront of a dev stand compiles a page on its first request (up to 20 s for the cart): a step that waits
 *  for the next page would run into that. One visit to each page of the buyer's path before the walk keeps it out of the scenario. */
async function warm() {
  const base = shopUrl();
  const pages = ["/ru", "/ru/store", `/ru/products/test-tshirt-${BASE_HANDLE}`, "/ru/cart", "/ru/checkout", "/ru/account", "/api/cart"];
  for (const path of pages) await fetch(base + path, { redirect: "follow", signal: AbortSignal.timeout(120000) }).catch(() => {});
}

const BUYER = `buyer-${BASE_HANDLE}@example.test`;

/** A registered buyer of the shop: the checkout of this storefront asks for a sign-in before the address. */
async function ensureBuyer() {
  const password = secret("SC_TEST_PASSWORD");
  const key = state.key;
  let auth = await call("POST", "/auth/customer/emailpass", { key, body: { email: BUYER, password } });
  if (!auth.ok) auth = await call("POST", "/auth/customer/emailpass/register", { key, body: { email: BUYER, password } });
  if (!auth.ok) throw new Error(`fixtures: the buyer does not accept SC_TEST_PASSWORD (${auth.status})`);
  const token = auth.data.token;
  // the sign-in alone is not an account: the customer record is what the checkout looks for
  const me = await call("GET", "/store/customers/me", { key, token });
  if (me.ok) return;
  const made = await call("POST", "/store/customers", { key, token, body: { email: BUYER, first_name: "Мария", last_name: "Тестова" } });
  if (!made.ok) throw new Error(`fixtures: buyer account answered ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`);
}

async function region() {
  const r = must(await call("GET", "/store/regions?limit=300&fields=id,name,currency_code,*countries", { key: state.key }), "regions");
  const found = (r.regions ?? []).find((x) => (x.countries ?? []).some((c) => c.iso_2 === "ru")) || r.regions?.[0];
  if (!found) throw new Error("fixtures: the shop has no region");
  return found;
}

async function ensureProduct() {
  const seen = must(await call("GET", "/store/products?limit=1", { key: state.key }), "GET /store/products");
  if ((seen.products ?? []).length) return;
  const created = must(
    await call("POST", "/tenants/products", {
      token: state.ownerToken,
      body: {
        title: "Тестовая футболка",
        handle: `test-tshirt-${state.handle}`,
        status: "published",
        options: [{ title: "Размер", values: ["M"] }],
        variants: [{ title: "M", options: { Размер: "M" }, manage_inventory: false, prices: [{ currency_code: "rub", amount: 1500 }] }],
      },
    }),
    "create a product",
  );
  return created.product;
}

async function placeOrder() {
  const reg = await region();
  const products = must(
    await call("GET", `/store/products?limit=5&region_id=${reg.id}&fields=id,title,*variants,*variants.calculated_price`, { key: state.key }),
    "products",
  ).products;
  const variant = products.flatMap((p) => p.variants || []).find((v) => v.calculated_price?.calculated_amount > 0);
  if (!variant) throw new Error("fixtures: no priced variant to order");
  const key = state.key;
  const email = "buyer-order@example.test"; // one name for every order the seed adds, so a scenario can find it by that name
  const cart = must(await call("POST", "/store/carts", { key, body: { region_id: reg.id } }), "cart").cart;
  await call("POST", `/store/carts/${cart.id}/line-items`, { key, body: { variant_id: variant.id, quantity: 1 } });
  const address = { first_name: "Мария", last_name: "Тестова", address_1: "ул. Баумана, 12", city: "Казань", province: "Республика Татарстан", country_code: "ru", postal_code: "420111", phone: "+79170000101" };
  await call("POST", `/store/carts/${cart.id}`, { key, body: { email, shipping_address: address, billing_address: address } });
  const options = await call("GET", `/store/shipping-options?cart_id=${cart.id}`, { key });
  const option = options.data.shipping_options?.[0];
  if (option) await call("POST", `/store/carts/${cart.id}/shipping-methods`, { key, body: { option_id: option.id } });
  const coll = must(await call("POST", "/store/payment-collections", { key, body: { cart_id: cart.id } }), "payment collection");
  await call("POST", `/store/payment-collections/${coll.payment_collection.id}/payment-sessions`, { key, body: { provider_id: "pp_system_default" } });
  const done = must(await call("POST", `/store/carts/${cart.id}/complete`, { key }), "complete cart");
  if (done.type !== "order") throw new Error(`fixtures: the cart did not become an order: ${JSON.stringify(done).slice(0, 160)}`);
  // order.placed links the order to the shop asynchronously; the panel lists it only through that link
  for (let i = 0; i < 30; i += 1) {
    const seen = await call("GET", "/tenants/orders?limit=5&fields=id", { token: state.ownerToken });
    if ((seen.data.orders ?? []).length) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { id: done.order.id, display_id: done.order.display_id, email };
}

/** owner: a session of the tenant panel through its own login form; buyer and guest: a plain context on the shop. */
export async function login(actor, { context, browser, contextOptions, fx } = {}) {
  if (!state) await reset();
  const ctx = context || (await browser.newContext(contextOptions));
  const page = await ctx.newPage();
  if (actor === "owner") {
    await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(state.ownerEmail);
    await page.locator('input[type="password"]').first().fill(secret("SC_TEST_PASSWORD"));
    await Promise.all([
      page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
    // the dev server compiles a panel route on its first visit; walk them once so a replay step stays inside its 5 s budget
    for (const path of ["/products", "/products/create", "/orders"]) {
      await page.goto(`${PANEL}${path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    }
  }
  return { context: ctx, page };
}

/** The log in for the scenario file: where the first page is, per actor. */
export const startUrl = (actor) => (actor === "owner" ? PANEL : shopUrl());
