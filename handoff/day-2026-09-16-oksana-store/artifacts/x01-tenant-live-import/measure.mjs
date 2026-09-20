// Acceptance measurement of the live tenant (rule 18f): counts come from the API, not from the importer's log.
const BACKEND = "https://shipshift.dev";
const PK = "pk_8198573d694d799176db98d87e17e5d53b073cf905ce0b050f72e443331f1e31";
const [email, password] = [process.argv[2], process.argv[3]];
const j = async (url, opt) => { const r = await fetch(url, opt); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; };
const auth = await j(`${BACKEND}/auth/tenant/emailpass`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
const H = { authorization: `Bearer ${auth.body.token}` };
const own = async (p) => (await j(`${BACKEND}${p}`, { headers: H })).body;

const all = await own("/tenants/products?limit=200&fields=id,handle,status,thumbnail,images.url,categories.id,categories.handle");
const prods = all.products ?? [];
const byStatus = {};
for (const p of prods) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
console.log(`owner API /tenants/products: total=${prods.length} ${JSON.stringify(byStatus)}`);

const cats = (await own("/tenants/product-categories?limit=100&fields=id,handle,name")).product_categories ?? [];
console.log(`\nper-category product count (owner API, ${cats.length} categories):`);
const rows = [];
for (const c of cats) {
  const n = prods.filter((p) => (p.categories ?? []).some((x) => x.id === c.id)).length;
  rows.push({ handle: c.handle, name: c.name, products: n });
  console.log(`  ${String(n).padStart(3)}  ${c.handle}  (${c.name})`);
}
console.log(`empty categories: ${rows.filter((r) => !r.products).map((r) => r.handle).join(", ") || "none"}`);

// image URLs: sample and fetch
const urls = [];
for (const p of prods) { if (p.thumbnail) urls.push(p.thumbnail); for (const i of p.images ?? []) urls.push(i.url); }
const uniq = [...new Set(urls)];
console.log(`\ndistinct image URLs on the tenant's products: ${uniq.length}`);
const localhostUrls = uniq.filter((u) => /localhost|127\.0\.0\.1/.test(u));
console.log(`URLs pointing at localhost: ${localhostUrls.length}${localhostUrls.length ? " → " + localhostUrls.slice(0, 3).join(", ") : ""}`);
const sample = uniq.slice(0, 12);
let ok = 0;
for (const u of sample) { const r = await fetch(u, { method: "HEAD" }); if (r.status === 200) ok += 1; else console.log(`  NOT 200: ${r.status} ${u}`); }
console.log(`HEAD sample: ${ok}/${sample.length} answered 200`);
console.log(`sample URL: ${sample[0]}`);
