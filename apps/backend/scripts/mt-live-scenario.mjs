// Live acceptance scenario for the shared-multitenancy slice (rule 18f).
// Every request is logged as the equivalent curl line + status + trimmed body.
const BASE = process.env.BASE || "http://localhost:9023";
const PASSWORD = "supersecret";
const RUN = Date.now().toString(36); // unique titles → unique product handles per run
const log = [];
const out = (s) => { log.push(s); console.log(s); };
const trim = (o, n = 700) => { const s = JSON.stringify(o); return s.length > n ? s.slice(0, n) + "…" : s; };

async function call(method, path, { body, token, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["x-publishable-api-key"] = key;
  const curl = [`curl -s -X ${method} ${BASE}${path}`,
    token ? `-H 'Authorization: Bearer <${token.slice(0, 8)}…>'` : "",
    key ? `-H 'x-publishable-api-key: ${key.slice(0, 12)}…'` : "",
    body ? `-H 'content-type: application/json' -d '${JSON.stringify(body)}'` : ""].filter(Boolean).join(" \\\n    ");
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; const text = await res.text(); try { data = JSON.parse(text); } catch { data = text; }
  out(`\n$ ${curl}\n→ ${res.status} ${trim(data)}`);
  return { status: res.status, data };
}

const fail = (m) => { out(`FAIL: ${m}`); process.exitCode = 1; };
const check = (cond, m) => out(`${cond ? "OK  " : "FAIL"} ${m}`) || (cond ? 0 : (process.exitCode = 1));

const login = async (h) => (await call("POST", "/auth/tenant/emailpass", { body: { email: `admin@${h}.test`, password: PASSWORD } })).data.token;
const product = (title, cur) => ({ title, status: "published", options: [{ title: "Color", values: ["Blue"] }],
  variants: [{ title, prices: [{ currency_code: cur, amount: 10 }], manage_inventory: false, options: { Color: "Blue" } }] });

out(`# MT live scenario ${new Date().toISOString()} against ${BASE}`);
const tokA = await login("acme"), tokB = await login("globex");
check(!!tokA && !!tokB, "both tenant admins log in through /auth/tenant/emailpass");

const meA = await call("GET", "/tenants/me", { token: tokA });
const meB = await call("GET", "/tenants/me", { token: tokB });
const tenA = meA.data.tenant_admin?.tenant, tenB = meB.data.tenant_admin?.tenant;
check(tenA?.handle === "acme" && tenB?.handle === "globex", "GET /tenants/me names the tenant behind each token");
check(tenA?.sales_channel?.id?.startsWith("sc_") && tenA?.api_key?.id?.startsWith("apk_") && tenB?.sales_channel?.id?.startsWith("sc_"), "GET /tenants/me carries the sales channel and the publishable key through the links (one query.graph read)");

// Publishable keys: printed by seed-tenants (raw token only at creation). Passed via env.
const keyA = process.env.PK_ACME, keyB = process.env.PK_GLOBEX;
if (!keyA || !keyB) { fail("PK_ACME / PK_GLOBEX env missing"); process.exit(1); }
check(tenA?.api_key?.token === keyA && tenB?.api_key?.token === keyB, "the key each storefront calls with is the one linked to its tenant");

const regions = await call("GET", "/store/regions", { key: keyA });
const region = regions.data.regions?.[0];
if (!region) { fail("no regions visible with tenant A key"); process.exit(1); }
const cur = region.currency_code, country = region.countries?.[0]?.iso_2;
out(`region ${region.id} ${region.name} ${cur} ${country}`);

const pA = await call("POST", "/tenants/products", { token: tokA, body: product(`Acme shirt (live ${RUN})`, cur) });
const pB = await call("POST", "/tenants/products", { token: tokB, body: product(`Globex mug (live ${RUN})`, cur) });
check(pA.status === 201 && pB.status === 201, "POST /tenants/products → 201 for both tenants");
check(pA.data.product?.sales_channels?.map(s => s.id).join() === tenA.sales_channel?.id, "A's product sits only in A's sales channel");
check(pB.data.product?.sales_channels?.map(s => s.id).join() === tenB.sales_channel?.id, "B's product sits only in B's sales channel");

const smuggle = await call("POST", "/tenants/products", { token: tokA, body: { ...product(`Acme smuggled (live ${RUN})`, cur), sales_channels: [{ id: tenB.sales_channel?.id }] } });
check(smuggle.data.product?.sales_channels?.map(s => s.id).join() === tenA.sales_channel?.id, "foreign sales_channels in the body are ignored");

const lA = await call("GET", "/tenants/products", { token: tokA });
const lB = await call("GET", "/tenants/products", { token: tokB });
const idsA = (lA.data.products ?? []).map(p => p.id), idsB = (lB.data.products ?? []).map(p => p.id);
check(idsA.includes(pA.data.product.id) && !idsA.includes(pB.data.product.id), "GET /tenants/products for A: own product yes, B's no");
check(idsB.includes(pB.data.product.id) && !idsB.includes(pA.data.product.id), "GET /tenants/products for B: own product yes, A's no");
check(idsA.filter(id => idsB.includes(id)).length === 0, "no product id is shared between the two lists");

const sA = await call("GET", "/store/products?limit=100", { key: keyA });
const sB = await call("GET", "/store/products?limit=100", { key: keyB });
const sIdsA = (sA.data.products ?? []).map(p => p.id), sIdsB = (sB.data.products ?? []).map(p => p.id);
check(sIdsA.includes(pA.data.product.id) && !sIdsA.includes(pB.data.product.id), "/store/products with key A: A's catalog only");
check(sIdsB.includes(pB.data.product.id) && !sIdsB.includes(pA.data.product.id), "/store/products with key B: B's catalog only");
out(`store catalog sizes: A=${sIdsA.length} B=${sIdsB.length}`);

// Storefront checkout with tenant A's key.
const cart = await call("POST", "/store/carts", { key: keyA, body: { region_id: region.id } });
const cartId = cart.data.cart?.id;
const variantId = pA.data.product.variants?.[0]?.id;
await call("POST", `/store/carts/${cartId}/line-items`, { key: keyA, body: { variant_id: variantId, quantity: 1 } });
const addr = { first_name: "Test", last_name: "Shopper", address_1: "Main st 1", city: "Berlin", country_code: country, postal_code: "10115" };
await call("POST", `/store/carts/${cartId}`, { key: keyA, body: { email: "shopper@example.com", shipping_address: addr, billing_address: addr } });
const so = await call("GET", `/store/shipping-options?cart_id=${cartId}`, { key: keyA });
const option = so.data.shipping_options?.[0];
check(!!option, "shipping options are available for a cart in tenant A's sales channel");
if (option) await call("POST", `/store/carts/${cartId}/shipping-methods`, { key: keyA, body: { option_id: option.id } });
const pc = await call("POST", "/store/payment-collections", { key: keyA, body: { cart_id: cartId } });
const pcId = pc.data.payment_collection?.id;
await call("POST", `/store/payment-collections/${pcId}/payment-sessions`, { key: keyA, body: { provider_id: "pp_system_default" } });
const done = await call("POST", `/store/carts/${cartId}/complete`, { key: keyA });
const order = done.data.type === "order" ? done.data.order : null;
check(!!order, `cart completes into an order (${order?.id ?? "none"})`);
out(`store /complete response: order keys include sales_channel_id = ${order ? "sales_channel_id" in order : "n/a"} (store shape; the owner-side check follows below)`);

// order.placed subscriber links asynchronously; measure how long it takes.
let oA, tries = 0;
do { await new Promise(r => setTimeout(r, 500)); oA = await call("GET", "/tenants/orders", { token: tokA }); tries++; }
while (!(oA.data.orders ?? []).some(o => o.id === order?.id) && tries < 10);
out(`orders visible to A after ${tries} poll(s) × 500 ms`);
const oB = await call("GET", "/tenants/orders", { token: tokB });
const linked = (oA.data.orders ?? []).find(o => o.id === order?.id);
check(!!linked, "GET /tenants/orders for A contains the storefront order");
check(linked?.sales_channel_id === tenA.sales_channel?.id, "the linked order carries tenant A's sales channel id (GET /tenants/orders)");
check((oB.data.orders ?? []).length === 0, `GET /tenants/orders for B is empty (got ${(oB.data.orders ?? []).length})`);

const anon = await call("GET", "/tenants/products");
check(anon.status === 401, "GET /tenants/products without a token → 401");
const cust = await call("POST", "/auth/customer/emailpass/register", { body: { email: `shopper+${Date.now()}@example.com`, password: PASSWORD } });
const asCust = await call("GET", "/tenants/products", { token: cust.data.token });
check(asCust.status === 401, "GET /tenants/products with a customer token → 401");

out(`\n# result: ${process.exitCode ? "FAILURES present" : "all checks passed"}`);
