// Seeds a fresh wizard-style tenant on a LOCAL backend and measures the product options the
// way the storefront filter groups them (by option.id, placeholder left out), then the rows in
// the database. node seed-option-check.mjs http://localhost:9031 <handle> <path to .env>
import fs from "node:fs";
import { createRequire } from "node:module";
const [base, handle, envPath] = [process.argv[2], process.argv[3], process.argv[4]];
const email = `${handle}@example.test`, password = "supersecret1";
const call = async (path, { method = "GET", token, key, body } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers["x-publishable-api-key"] = key;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = {}; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const reg = await call("/auth/tenant/emailpass/register", { method: "POST", body: { email, password } });
const created = await call("/tenants", { method: "POST", token: reg.json.token, body: { name: `Shop ${handle}`, handle, admin: { email } } });
const tenant = created.json.tenant ?? created.json;
const key = tenant.api_key?.token ?? tenant.publishable_key ?? null;
console.log(`register ${reg.status}, tenant ${created.status} ${tenant.id ?? created.json.message ?? ""}, key ${key ? "yes" : "NO"}`);
const session = await call("/auth/tenant/emailpass", { method: "POST", body: { email, password } });
const t0 = Date.now();
const seed = await call("/tenants/seed", { method: "POST", token: session.json.token, body: { preset: "geist" } });
console.log(`seed ${seed.status} in ${Date.now() - t0} ms -> ${JSON.stringify(seed.json)}`);
const products = await call("/store/products?limit=50&fields=id,handle,*options,*options.values,variants.options.id,variants.options.option_id", { key });
const list = products.json.products ?? [];
const groups = new Map();
for (const p of list) for (const o of p.options ?? []) {
  if (o.title === "Default option") continue;
  if (!groups.has(o.id)) groups.set(o.id, { title: o.title, products: [] });
  groups.get(o.id).products.push(p.handle);
}
console.log(`store products ${products.status} count=${list.length}; filter groups (by option.id, placeholder excluded) = ${groups.size}`);
for (const [id, g] of groups) console.log(`  ${g.title} ${id}: ${g.products.length} products -> ${g.products.join(",")}`);
const env = fs.readFileSync(envPath, "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1];
const require = createRequire(import.meta.url);
const { Client } = require(fs.readdirSync(`${process.env.WS_ROOT}/node_modules/.pnpm`).filter((d) => d.startsWith("pg@")).map((d) => `${process.env.WS_ROOT}/node_modules/.pnpm/${d}/node_modules/pg`)[0]);
const c = new Client({ connectionString: dbUrl }); await c.connect();
const rows = await c.query(`select o.id, o.title, o.is_exclusive, (select count(*) from product_option_value v where v.option_id=o.id and v.deleted_at is null) as n_values, (select count(distinct pv.product_id) from product_variant_option pvo join product_variant pv on pv.id=pvo.variant_id join product_option_value v on v.id=pvo.option_value_id where v.option_id=o.id) as n_products from product_option o where o.title='Size' and o.deleted_at is null order by o.is_exclusive, o.created_at`);
console.log(`db product_option title=Size rows=${rows.rowCount}`);
for (const r of rows.rows) console.log(`  ${r.id} is_exclusive=${r.is_exclusive} values=${r.n_values} products=${r.n_products}`);
await c.end();
