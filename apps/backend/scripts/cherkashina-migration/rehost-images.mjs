// Re-points every migrated image URL from one backend origin to another — the case of a file
// provider that stamped the wrong public origin (local stand: :9000 → :9033) and, later, of moving the
// tenant behind its public domain. Bytes are not copied: the script asserts the new URL answers 200
// before it rewrites anything, then updates products (thumbnail + images order), the home hero and
// the registry rows. Talks to /tenants/* only.
//
// `node rehost-images.mjs --help` prints every option.
import { cliDie, cliHelp } from "./lib/cli.mjs";
import { makeClient } from "./lib/http.mjs";
import { loadRegistry, saveRegistry, upsertRow } from "./lib/mapping-registry.mjs";

const USAGE = `
rehost-images.mjs — move every migrated image URL of a tenant from one public origin to another.
Copies no bytes: each new URL must answer 200 before anything is rewritten.

  node rehost-images.mjs --registry <file.json> --from <origin> --to <origin> \\
       --admin-email <e> --admin-password <p> [--backend <url>] [--dry-run]

  --backend         backend the tenant API answers on; default http://localhost:9033
                    (live: https://shipshift.dev)
  --registry        mapping registry JSON (required; read and rewritten)
  --from            origin the stored URLs carry now, e.g. http://localhost:9000 (required)
  --to              origin they must carry, e.g. https://shipshift.dev (required)
  --admin-email     tenant owner's login (required)
  --admin-password  tenant owner's password (required)
  --dry-run         check the new URLs and print, write nothing

Writes: products, the home hero and --registry, through /tenants/* only.

  node rehost-images.mjs --backend https://shipshift.dev --registry artifacts/…/02-mapping-registry.json \\
       --from http://localhost:9000 --to https://shipshift.dev --admin-email owner@example.test --admin-password '…' --dry-run
`;

const argv = process.argv.slice(2);
cliHelp(argv, USAGE);
const opt = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const BACKEND = opt("--backend", "http://localhost:9033");
const REGISTRY = opt("--registry", null);
const FROM = opt("--from", null);
const TO = opt("--to", null);
const EMAIL = opt("--admin-email", null);
const PASSWORD = opt("--admin-password", null);
const DRY = argv.includes("--dry-run");
if (!REGISTRY || !FROM || !TO || !EMAIL || !PASSWORD) {
  cliDie(USAGE, "required: --registry --from --to --admin-email --admin-password");
}
const registry = loadRegistry(REGISTRY);
const api = makeClient(BACKEND);
const rehost = (url) => (url && url.startsWith(FROM) ? TO + url.slice(FROM.length) : url);

const login = await api.post("/auth/tenant/emailpass", { email: EMAIL, password: PASSWORD }, { auth: false });
api.setToken(login.token);

// 1. files: the bytes must answer at the new origin before any row moves
const files = registry.rows.filter((r) => r.kind === "file" && r.status === "migrated" && r.target_url?.startsWith(FROM));
let verified = 0;
const unreachable = [];
for (const f of files) {
  const next = rehost(f.target_url);
  const res = await fetch(next, { method: "HEAD" }).catch(() => null);
  if (res?.ok) verified += 1;
  else unreachable.push(next);
}
console.log(`files to rehost: ${files.length}, reachable at the new origin: ${verified}, unreachable: ${unreachable.length}`);
if (unreachable.length) {
  console.error(unreachable.slice(0, 5).join("\n"));
  process.exit(1);
}
if (DRY) {
  console.log("dry-run: nothing rewritten");
  process.exit(0);
}
for (const f of files) upsertRow(registry, { ...f, target_url: rehost(f.target_url), reason: `${f.reason}; rehosted ${FROM} → ${TO}` });

// 2. products: thumbnail + images (order preserved) through the tenant update route
const products = registry.rows.filter((r) => r.kind === "product" && r.status === "migrated" && r.target_id);
let updated = 0;
for (const p of products) {
  const { product } = await api.get(`/tenants/products/${p.target_id}?fields=id,thumbnail,images.id,images.url,images.rank`);
  const images = [...(product.images ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const needs = (product.thumbnail ?? "").startsWith(FROM) || images.some((i) => i.url.startsWith(FROM));
  if (!needs) continue;
  const body = { images: images.map((i) => ({ url: rehost(i.url) })) };
  if (product.thumbnail) body.thumbnail = rehost(product.thumbnail);
  const r = await api.post(`/tenants/products/${p.target_id}`, body);
  updated += 1;
  const after = [...(r.product?.images ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const row of registry.rows.filter((x) => x.kind === "image" && x.product_source_id === p.source_id && x.target_url?.startsWith(FROM))) {
    const nextUrl = rehost(row.target_url);
    const hit = after.find((i) => i.url === nextUrl);
    upsertRow(registry, { ...row, target_url: nextUrl, target_id: hit?.id ?? row.target_id, target_rank: hit?.rank ?? row.target_rank });
  }
}
console.log(`products updated: ${updated} of ${products.length}`);

// 3. home hero image
const { home } = await api.get("/tenants/home");
if (home?.content?.hero?.image_url?.startsWith(FROM)) {
  const { updatedAt: _u, ...doc } = home;
  doc.content.hero.image_url = rehost(doc.content.hero.image_url);
  await api.put("/tenants/home", doc);
  console.log("home hero image rehosted");
}
saveRegistry(REGISTRY, registry);
console.log("registry saved");
