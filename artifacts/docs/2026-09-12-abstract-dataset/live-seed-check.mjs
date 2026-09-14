// Live check of the starter-catalog seed against a LOCAL backend (the same four calls the
// onboarding route makes, then the storefront's own reads with the tenant's key).
//   node live-seed-check.mjs http://localhost:9024 <handle>
const [base, handle] = [process.argv[2] ?? "http://localhost:9024", process.argv[3] ?? `abst${Date.now().toString(36).slice(-5)}`];
const email = `${handle}@example.test`;
const password = "supersecret1";

const call = async (path, { method = "GET", token, key, body } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers["x-publishable-api-key"] = key;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
};

const out = [];
const log = (k, v) => { out.push([k, v]); console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`); };

const reg = await call("/auth/tenant/emailpass/register", { method: "POST", body: { email, password } });
log("register", reg.status);
const created = await call("/tenants", { method: "POST", token: reg.json.token, body: { name: `Shop ${handle}`, handle, admin: { email } } });
log("create tenant", `${created.status} ${created.json.message ?? ""}`);
const tenant = created.json.tenant ?? created.json;
const key = tenant.api_key?.token ?? tenant.publishable_key ?? null;
log("tenant id / key", `${tenant.id} / ${key ? key.slice(0, 12) + "…" : "NO KEY IN RESPONSE: " + Object.keys(tenant).join(",")}`);
const session = await call("/auth/tenant/emailpass", { method: "POST", body: { email, password } });
log("login", session.status);
const t0 = Date.now();
const seed = await call("/tenants/seed", { method: "POST", token: session.json.token, body: { preset: "geist" } });
log("seed", `${seed.status} in ${Date.now() - t0} ms -> ${JSON.stringify(seed.json)}`);
const again = await call("/tenants/seed", { method: "POST", token: session.json.token, body: { preset: "geist" } });
log("seed again (idempotent?)", `${again.status} seeded=${again.json.seeded} ${again.json.reason ?? ""}`);

if (key) {
  const products = await call("/store/products?limit=50&fields=handle,title,thumbnail,*categories,*variants.calculated_price&region_id=", { key });
  log("store products", `${products.status} count=${products.json.count} handles=${(products.json.products ?? []).map((p) => p.handle).join(",")}`);
  const cats = await call("/store/product-categories?limit=50&fields=handle,name,metadata,parent_category_id", { key });
  log("store categories", `${cats.status} count=${cats.json.count} ${(cats.json.product_categories ?? []).map((c) => `${c.handle}${c.metadata?.image_url ? "[img]" : "[no img]"}`).join(",")}`);
  const first = (products.json.products ?? [])[0];
  if (first?.thumbnail) {
    const img = await fetch(first.thumbnail);
    log("thumbnail fetch", `${img.status} ${first.thumbnail} ${img.headers.get("content-type")}`);
  }
  const owned = await call("/tenants/products?limit=50", { token: session.json.token });
  log("tenant products", `${owned.status} count=${owned.json.count}`);
}
