// Cherkashina → upready-store tenant migration (Ivan's order 2026-09-12 08:20 WITA).
// Talks ONLY to the tenant HTTP API (/auth/tenant/*, /tenants/*) — never SQL into the target.
// Idempotent: every source entity has a registry row; a row already `migrated` is verified, not redone.
//
// `node import.mjs --help` prints every option. Exit code 1 when any registry row is `failed`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cliDie, cliHelp, originOfHost } from "./lib/cli.mjs";
import { makeClient } from "./lib/http.mjs";
import { findRow, loadRegistry, saveRegistry, upsertRow } from "./lib/mapping-registry.mjs";
import { stamp } from "./lib/psql.mjs";

// ---------- args
const USAGE = `
import.mjs — create the tenant and import the source catalog, content and home into it.
Talks ONLY to the tenant HTTP API (/auth/tenant/*, /tenants/*) of --backend; never SQL into the target.
Idempotent: a registry row already \`migrated\` is verified, not redone.

  node import.mjs --snapshot <file.json> --registry <file.json> --admin-email <e> --admin-password <p> [options]

  --backend           backend the tenant API answers on; default http://localhost:9033
                      (live: https://shipshift.dev)
  --snapshot          source snapshot from export-source.mjs (required, read)
  --registry          mapping registry JSON (required, created if absent, rewritten as it goes)
  --source-root       checkout of the SOURCE repository, where image bytes and the legal
                      markdown are read from; default /Users/ivanprotsko/upready/projects/chrxnasdmds
  --pages-out         directory the page markdown is written to (optional)
  --handle            tenant handle / subdomain; default cherkashino
  --name              tenant name; default "ОЛАВКА" (Ivan 2026-09-25)
  --admin-email       tenant owner's login (required; created on first run)
  --admin-password    tenant owner's password (required)
  --admin-first-name  default Оксана
  --admin-last-name   default Черкашина
  --storefront-origin public origin of the tenant storefront, used for the old→new URL table;
                      default derived from --tenant-host, else http://<handle>.localhost:8043
                      (live: https://<handle>.shipshift.dev)
  --tenant-host       host form of the same thing, scheme guessed (http only for *.localhost)
  --source-origin     public origin of the SOURCE store; default https://olavka.ru
  --theme-preset      catalog theme preset; default supplements
  --only              phases to run, comma separated, of
                      tenant,categories,images,products,pages,home,rest
  --dry-run           change nothing on the tenant: still logs in and lists, and still
                      writes the registry, with a "pending" row per thing a phase would do

Writes: --registry, --pages-out, and the tenant behind --backend. Reads: --snapshot, --source-root.

  node import.mjs --backend https://shipshift.dev \\
    --snapshot artifacts/…/source-snapshot.json --registry artifacts/…/02-mapping-registry.json \\
    --source-root ~/upready/projects/chrxnasdmds --pages-out artifacts/…/pages \\
    --handle cherkashino --name "ОЛАВКА" --storefront-origin https://cherkashino.shipshift.dev \\
    --admin-email owner@example.test --admin-password '…' --dry-run
`;

const argv = process.argv.slice(2);
cliHelp(argv, USAGE);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);
const BACKEND = opt("--backend", "http://localhost:9033");
const SNAPSHOT = opt("--snapshot", null);
const REGISTRY = opt("--registry", null);
const SOURCE_ROOT = opt("--source-root", "/Users/ivanprotsko/upready/projects/chrxnasdmds");
const PAGES_OUT = opt("--pages-out", null);
const HANDLE = opt("--handle", "cherkashino");
const NAME = opt("--name", "ОЛАВКА");
const ADMIN_EMAIL = opt("--admin-email", null);
const ADMIN_PASSWORD = opt("--admin-password", null);
const ADMIN_FIRST = opt("--admin-first-name", "Оксана");
const ADMIN_LAST = opt("--admin-last-name", "Черкашина");
const THEME_PRESET = opt("--theme-preset", "supplements");
const DRY = flag("--dry-run");
const ONLY = (opt("--only", "tenant,categories,images,products,pages,home,rest") ?? "").split(",").filter(Boolean);
if (!SNAPSHOT || !REGISTRY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  cliDie(USAGE, "required: --snapshot --registry --admin-email --admin-password");
}
// The source store's own public origin, and the tenant's. Both are options
// because the old→new URL table this registry produces is what the redirect
// task reads, and a run against the platform (https://<handle>.shipshift.dev)
// must not inherit the local stand's http://…:8043 (measured 2026-09-15: the
// only https tenant origin is the wildcard `*.shipshift.dev`).
const SOURCE_STORE_ORIGIN = (opt("--source-origin", "https://olavka.ru") ?? "").replace(/\/+$/, "");
const SOURCE_URL_PREFIX = `${SOURCE_STORE_ORIGIN}/ru/ru`; // routes [countryCode]/[locale]/(main)
const TENANT_HOST = opt("--tenant-host", null);
const STOREFRONT_ORIGIN = originOfHost(
  opt("--storefront-origin", TENANT_HOST ?? `${HANDLE}.localhost:8043`),
);
const TARGET_URL_PREFIX = `${STOREFRONT_ORIGIN}/ru`;
// The image and legal-page phases read bytes off --source-root; a missing root
// is a bad call, not 335 upload failures one by one.
if (!DRY && !existsSync(SOURCE_ROOT) && ONLY.some((p) => ["images", "products", "pages", "home"].includes(p))) {
  cliDie(USAGE, `--source-root does not exist: ${SOURCE_ROOT}`);
}
const MIGRATED_FROM = "chrxnasdmds";
const SKU_SUFFIX = `-${HANDLE.toUpperCase()}`;

const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const registry = loadRegistry(REGISTRY);
const api = makeClient(BACKEND);
const log = (...a) => console.log(`[${stamp().slice(11)}]`, ...a);
const save = () => saveRegistry(REGISTRY, registry);
const want = (phase) => ONLY.includes(phase);

// ---------- helpers
const nz = (v) => (v === null || v === undefined || v === "" ? undefined : v);
const targetProductHandle = (h) => `${h}-${HANDLE}`;
const targetCategoryHandle = (h) => `${h}-${HANDLE}`;
const targetSku = (sku) => `${sku}${SKU_SUFFIX}`;

function sourceFileForUrl(url) {
  const u = decodeURIComponent(url);
  if (u.startsWith("/products/") || u.startsWith("/banners/")) return path.join(SOURCE_ROOT, "apps/storefront/public", u);
  const m = u.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
  if (m) return path.join(SOURCE_ROOT, "apps/backend/static", m[1]);
  return null;
}
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml" };

async function findOne(pathWithQuery, listKey) {
  const r = await api.get(pathWithQuery);
  const list = r[listKey] ?? [];
  return list[0] ?? null;
}

// ---------- i18n of the source (precedence loc-DB > loc-file > en-DB > en-file, messages-db.ts)
function parseMessageFile(file) {
  const text = readFileSync(file, "utf8");
  const out = { en: {}, ru: {} };
  let current = null;
  for (const line of text.split("\n")) {
    const head = line.match(/^export const (en|ru): Record<string, string> = \{/);
    if (head) {
      current = head[1];
      continue;
    }
    if (/^\}/.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const m = line.match(/^\s*"((?:[^"\\]|\\.)+)":\s*("(?:[^"\\]|\\.)*"),?\s*$/);
    if (m) {
      try {
        out[current][m[1]] = JSON.parse(m[2]);
      } catch {
        /* a value the line-parser cannot read is reported by the caller as missing */
      }
    }
  }
  return out;
}
function buildMessages() {
  const files = ["m-pages.ts", "m-content.ts", "m-layout.ts", "m-routes.ts"].map((f) =>
    path.join(SOURCE_ROOT, "apps/storefront/src/lib/i18n", f),
  );
  const fileMsgs = { en: {}, ru: {} };
  for (const f of files) {
    if (!existsSync(f)) continue;
    const parsed = parseMessageFile(f);
    Object.assign(fileMsgs.en, parsed.en);
    Object.assign(fileMsgs.ru, parsed.ru);
  }
  const dbMsgs = { en: {}, ru: {} };
  for (const t of snap.ui_translations) {
    if (t.resource !== "ui" || t.field !== "value") continue;
    (dbMsgs[t.locale] ??= {})[t.resource_key] = t.value;
  }
  const merged = {
    en: { ...fileMsgs.en, ...dbMsgs.en },
    ru: { ...fileMsgs.en, ...dbMsgs.en, ...fileMsgs.ru, ...dbMsgs.ru },
  };
  const source = (locale, key) =>
    dbMsgs[locale]?.[key] !== undefined ? `${locale}-db` : fileMsgs[locale]?.[key] !== undefined ? `${locale}-file` : dbMsgs.en[key] !== undefined ? "en-db" : fileMsgs.en[key] !== undefined ? "en-file" : "missing";
  return { merged, source };
}

function extractLegalMarkdown(file) {
  const text = readFileSync(file, "utf8");
  const start = text.indexOf("_MD = `");
  if (start < 0) throw new Error(`no _MD template literal in ${file}`);
  const from = start + "_MD = `".length;
  const to = text.lastIndexOf("`");
  const body = text.slice(from, to).replace(/\\`/g, "`").replace(/\\\$/g, "$");
  if (body.includes("${")) log(`WARN ${path.basename(file)} carries a template expression; kept verbatim`);
  return body.trim() + "\n";
}

// ---------- phase: tenant
async function phaseTenant() {
  let token = null;
  try {
    const r = await api.post("/auth/tenant/emailpass", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
    token = r.token;
  } catch (e) {
    if (e.status !== 401) throw e;
  }
  if (!token) {
    if (DRY) {
      upsertRow(registry, { kind: "tenant", source_id: "store", source_handle: snap.products.length ? "olavka" : null, target_handle: HANDLE, status: "pending", reason: "dry-run: tenant would be registered via /auth/tenant/emailpass/register + POST /tenants" });
      log("dry-run: no tenant admin yet; the write phases will be skipped");
      return null;
    }
    log(`registering tenant admin ${ADMIN_EMAIL} and tenant "${HANDLE}"`);
    const reg = await api.post("/auth/tenant/emailpass/register", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
    api.setToken(reg.token);
    await api.post("/tenants", { name: NAME, handle: HANDLE, admin: { email: ADMIN_EMAIL, first_name: ADMIN_FIRST, last_name: ADMIN_LAST } });
    const login = await api.post("/auth/tenant/emailpass", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
    token = login.token;
  }
  api.setToken(token);
  const me = await api.get("/tenants/me");
  const admin = me.tenant_admin ?? me.me ?? me.admin ?? me;
  const tenant = me.tenant ?? admin.tenant;
  if (!tenant?.id) throw new Error(`GET /tenants/me answered without a tenant: ${JSON.stringify(me).slice(0, 300)}`);
  if (tenant.handle !== HANDLE) throw new Error(`logged in as tenant "${tenant.handle}", expected "${HANDLE}"`);
  registry.tenant = {
    id: tenant.id,
    handle: tenant.handle,
    name: tenant.name,
    sales_channel_id: tenant.sales_channel?.id ?? null,
    publishable_key: tenant.api_key?.token ?? null,
    admin_email: ADMIN_EMAIL,
    storefront_url: `${STOREFRONT_ORIGIN}/ru`,
    source_store_name: "Oksansa Cherkashina", // store.name in medusa_chrxn, typo included (measured 2026-09-12)
    locales_needed: { default: "ru", enabled: ["ru", "en"] }, // site_locale of the source; tenant-level locales do not exist yet
  };
  upsertRow(registry, { kind: "tenant", source_id: "store", source_handle: "olavka", target_id: tenant.id, target_handle: tenant.handle, status: "migrated", reason: "one tenant on the shared backend; name/handle per this run's arguments" });
  log(`tenant ${tenant.handle} (${tenant.id}), channel ${registry.tenant.sales_channel_id}, key ${registry.tenant.publishable_key?.slice(0, 12)}…`);
  return tenant;
}

// ---------- phase: categories
async function phaseCategories() {
  for (const cat of snap.categories) {
    const th = targetCategoryHandle(cat.handle);
    const existing = await findOne(`/tenants/product-categories?handle=${encodeURIComponent(th)}&fields=id,handle,name&limit=1`, "product_categories");
    const base = {
      kind: "category",
      source_id: cat.id,
      source_handle: cat.handle,
      target_handle: th,
      source_url: `${SOURCE_URL_PREFIX}/categories/${cat.handle}`,
      target_url: `${TARGET_URL_PREFIX}/categories/${th}`,
      name: cat.name,
    };
    if (existing) {
      upsertRow(registry, { ...base, target_id: existing.id, status: "migrated", reason: "already present on the tenant (handle match)" });
      continue;
    }
    if (DRY) {
      upsertRow(registry, { ...base, status: "pending", reason: "dry-run: would POST /tenants/product-categories" });
      continue;
    }
    try {
      const r = await api.post("/tenants/product-categories", {
        name: cat.name,
        handle: th,
        description: cat.description ?? "",
        is_active: cat.is_active,
        is_internal: cat.is_internal,
        rank: cat.rank ?? 0,
        // `source_url` here for the same reason products carry it: it is the
        // OLD address of this row, and `src/scripts/backfill-tenant-redirects.ts`
        // turns it into the 301 on every deploy. Categories imported before
        // b02-legal-and-redirects have only `source_handle`, and that script
        // rebuilds their address from the prefix its sibling products carry —
        // the same string this line writes.
        metadata: {
          ...(cat.metadata ?? {}),
          migrated_from: MIGRATED_FROM,
          source_id: cat.id,
          source_handle: cat.handle,
          source_url: `${SOURCE_URL_PREFIX}/categories/${cat.handle}`,
        },
      });
      upsertRow(registry, { ...base, target_id: r.product_category.id, status: "migrated", reason: "flat category (source has no parents); handle suffixed with the tenant" });
    } catch (e) {
      upsertRow(registry, { ...base, status: "failed", reason: e.message });
    }
  }
  save();
  log(`categories: ${snap.categories.length} processed`);
}

// ---------- phase: images (bytes → POST /tenants/uploads; one upload per unique source URL)
function collectImageUrls() {
  const urls = new Set();
  for (const img of snap.images) urls.add(img.url);
  for (const p of snap.products) if (p.thumbnail) urls.add(p.thumbnail);
  for (const b of snap.home_banners) {
    if (b.image_url) urls.add(b.image_url);
    if (b.bg_image_url) urls.add(b.bg_image_url);
  }
  return [...urls];
}
async function phaseImages() {
  const urls = collectImageUrls();
  let uploaded = 0;
  for (const url of urls) {
    const existing = findRow(registry, "file", url);
    if (existing?.status === "migrated" && existing.target_url) continue;
    const file = sourceFileForUrl(url);
    const base = { kind: "file", source_id: url, source_handle: file ? path.relative(SOURCE_ROOT, file) : null };
    if (!file || !existsSync(file)) {
      upsertRow(registry, { ...base, status: file ? "skipped" : "failed", reason: file ? `bytes missing at the source (known defect, q-2026-09-06-tovary-bez-kartinok): ${file}` : `unmapped url: ${url}` });
      continue;
    }
    if (DRY) {
      upsertRow(registry, { ...base, status: "pending", reason: "dry-run: would upload via POST /tenants/uploads" });
      continue;
    }
    try {
      const buf = readFileSync(file);
      const form = new FormData();
      const ext = path.extname(file).toLowerCase();
      form.append("files", new Blob([buf], { type: MIME[ext] ?? "application/octet-stream" }), path.basename(file));
      const r = await api.upload("/tenants/uploads", form);
      const f = r.files?.[0];
      if (!f?.url) throw new Error(`upload answered without a url: ${JSON.stringify(r).slice(0, 200)}`);
      upsertRow(registry, { ...base, target_id: f.id ?? null, target_url: f.url, bytes: buf.length, status: "migrated", reason: "uploaded under tenants/<tenant_id>/ (tenant files)" });
      uploaded += 1;
      if (uploaded % 25 === 0) {
        save();
        log(`images: ${uploaded} uploaded`);
      }
    } catch (e) {
      upsertRow(registry, { ...base, status: "failed", reason: e.message });
    }
  }
  save();
  log(`images: ${urls.length} unique urls, ${uploaded} uploaded this run`);
}
const targetUrlFor = (sourceUrl) => findRow(registry, "file", sourceUrl)?.target_url ?? null;

// ---------- phase: products
async function refData() {
  const profiles = await api.get("/tenants/shipping-profiles?limit=5");
  const profile = profiles.shipping_profiles?.[0];
  if (!profile) throw new Error("no shipping profile visible to the tenant");
  const typeCache = new Map();
  const tagCache = new Map();
  const typeIdFor = async (value) => {
    if (!value) return null;
    if (!typeCache.has(value)) typeCache.set(value, (await findOne(`/tenants/product-types?value=${encodeURIComponent(value)}&limit=1`, "product_types"))?.id ?? null);
    return typeCache.get(value);
  };
  const tagIdFor = async (value) => {
    if (!value) return null;
    if (!tagCache.has(value)) tagCache.set(value, (await findOne(`/tenants/product-tags?value=${encodeURIComponent(value)}&limit=1`, "product_tags"))?.id ?? null);
    return tagCache.get(value);
  };
  return { shippingProfileId: profile.id, typeIdFor, tagIdFor };
}

function buildProductBody(p, ref, categoryIdBySource) {
  const variants = snap.variants.filter((v) => v.product_id === p.id);
  const options = snap.options.filter((o) => o.product_id === p.id);
  const optionIds = new Set(options.map((o) => o.id));
  const valuesByVariant = new Map();
  for (const vo of snap.variant_option_values) {
    if (!optionIds.has(vo.option_id)) continue;
    if (!variants.some((v) => v.id === vo.variant_id)) continue;
    valuesByVariant.set(vo.variant_id, [...(valuesByVariant.get(vo.variant_id) ?? []), vo]);
  }
  const optionsBody = options.map((o) => ({ title: o.title, values: [...new Set((o.values ?? []).map((v) => v.value))] }));
  const notes = [];
  if (optionsBody.length === 0) {
    optionsBody.push({ title: "Вариант", values: [] });
    notes.push("source product had no option: a synthetic option «Вариант» carries the variant title");
  }
  const variantsBody = variants.map((v) => {
    const optionValues = {};
    for (const o of optionsBody) {
      const src = options.find((x) => x.title === o.title);
      const val = src ? valuesByVariant.get(v.id)?.find((vo) => vo.option_id === src.id)?.value : undefined;
      const value = val ?? v.title;
      if (!o.values.includes(value)) o.values.push(value);
      optionValues[o.title] = value;
    }
    const prices = snap.prices.filter((pr) => pr.variant_id === v.id && !(pr.rules && pr.rules.length));
    return {
      title: v.title,
      sku: targetSku(v.sku),
      barcode: nz(v.barcode),
      ean: nz(v.ean),
      upc: nz(v.upc),
      allow_backorder: v.allow_backorder ?? false,
      manage_inventory: v.manage_inventory ?? false,
      weight: nz(v.weight),
      length: nz(v.length),
      height: nz(v.height),
      width: nz(v.width),
      hs_code: nz(v.hs_code),
      origin_country: nz(v.origin_country),
      mid_code: nz(v.mid_code),
      material: nz(v.material),
      variant_rank: v.variant_rank ?? 0,
      options: optionValues,
      prices: prices.map((pr) => ({ currency_code: pr.currency_code, amount: Number(pr.amount) })),
      metadata: { ...(v.metadata ?? {}), migrated_from: MIGRATED_FROM, source_variant_id: v.id, source_sku: v.sku },
    };
  });
  const gallery = snap.images.filter((i) => i.product_id === p.id).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const images = [];
  const droppedImages = [];
  for (const img of gallery) {
    const url = targetUrlFor(img.url);
    if (url) images.push({ url });
    else droppedImages.push(img.url);
  }
  const thumbnail = p.thumbnail ? targetUrlFor(p.thumbnail) : null;
  if (p.thumbnail && !thumbnail) droppedImages.push(p.thumbnail);
  const categoryIds = snap.category_products.filter((cp) => cp.product_id === p.id).map((cp) => categoryIdBySource.get(cp.category_id)).filter(Boolean);
  const typeValue = snap.types.find((t) => t.id === p.type_id)?.value ?? null;
  const tagValues = snap.product_tags.filter((pt) => pt.product_id === p.id).map((pt) => snap.tags.find((t) => t.id === pt.tag_id)?.value).filter(Boolean);
  const collectionHandle = snap.collections.find((c) => c.id === p.collection_id)?.handle ?? null;
  const body = {
    title: p.title,
    subtitle: nz(p.subtitle),
    description: nz(p.description),
    handle: targetProductHandle(p.handle),
    status: p.status,
    discountable: p.discountable ?? true,
    is_giftcard: p.is_giftcard ?? false,
    weight: nz(p.weight),
    length: nz(p.length),
    height: nz(p.height),
    width: nz(p.width),
    hs_code: nz(p.hs_code),
    origin_country: nz(p.origin_country),
    mid_code: nz(p.mid_code),
    material: nz(p.material),
    thumbnail: thumbnail ?? undefined,
    images,
    categories: categoryIds.map((id) => ({ id })),
    shipping_profile_id: ref.shippingProfileId,
    options: optionsBody,
    variants: variantsBody,
    metadata: {
      ...(p.metadata ?? {}),
      migrated_from: MIGRATED_FROM,
      source_id: p.id,
      source_handle: p.handle,
      source_url: `${SOURCE_URL_PREFIX}/products/${p.handle}`,
      source_type: typeValue,
      source_tags: tagValues,
      source_collection: collectionHandle,
      card_image_source: p.thumbnail,
      pdp_default_image_source: gallery[0]?.url ?? null,
    },
  };
  return { body, variants, gallery, droppedImages, typeValue, tagValues, notes, prices: snap.prices.filter((pr) => variants.some((v) => v.id === pr.variant_id)) };
}

async function phaseProducts() {
  const ref = await refData();
  const categoryIdBySource = new Map(registry.rows.filter((r) => r.kind === "category" && r.target_id).map((r) => [r.source_id, r.target_id]));
  let created = 0;
  for (const p of snap.products) {
    const th = targetProductHandle(p.handle);
    const base = {
      kind: "product",
      source_id: p.id,
      source_handle: p.handle,
      target_handle: th,
      source_url: `${SOURCE_URL_PREFIX}/products/${p.handle}`,
      target_url: `${TARGET_URL_PREFIX}/products/${th}`,
      title: p.title,
      status_source: p.status,
    };
    const built = buildProductBody(p, ref, categoryIdBySource);
    const typeId = await ref.typeIdFor(built.typeValue);
    if (typeId) built.body.type_id = typeId;
    const tagIds = (await Promise.all(built.tagValues.map(ref.tagIdFor))).filter(Boolean);
    if (tagIds.length) built.body.tags = tagIds.map((id) => ({ id }));
    let existing = await findOne(`/tenants/products?handle=${encodeURIComponent(th)}&fields=id,handle,status,thumbnail,variants.id,variants.sku,images.id,images.url,images.rank&limit=1`, "products");
    let product = existing;
    if (!existing) {
      if (DRY) {
        upsertRow(registry, { ...base, status: "pending", reason: `dry-run: would POST /tenants/products (${built.variants.length} variant, ${built.body.images.length} images, ${built.body.categories.length} categories${built.droppedImages.length ? `, ${built.droppedImages.length} image(s) without bytes` : ""})` });
        continue;
      }
      try {
        const r = await api.post("/tenants/products", built.body);
        product = r.product;
        created += 1;
      } catch (e) {
        upsertRow(registry, { ...base, status: "failed", reason: e.message, body_preview: { options: built.body.options, variants: built.body.variants.map((v) => ({ sku: v.sku, options: v.options, prices: v.prices })) } });
        save();
        continue;
      }
    }
    const reasons = [`status ${p.status} kept`, "handle/SKU suffixed with the tenant (Medusa keeps them globally unique)", ...built.notes];
    if (built.droppedImages.length) reasons.push(`images without bytes on disk, not invented: ${built.droppedImages.join(", ")}`);
    if (built.typeValue && !typeId) reasons.push(`type "${built.typeValue}" has no global counterpart → kept in metadata.source_type`);
    if (built.tagValues.length && tagIds.length !== built.tagValues.length) reasons.push(`tags without a global counterpart → metadata.source_tags`);
    upsertRow(registry, { ...base, target_id: product.id, status: "migrated", reason: reasons.join("; "), card_image: p.thumbnail ?? null, pdp_default_image: built.gallery[0]?.url ?? null });
    // variants + prices
    for (const v of built.variants) {
      const tv = (product.variants ?? []).find((x) => x.sku === targetSku(v.sku));
      upsertRow(registry, { kind: "variant", source_id: v.id, source_handle: v.sku, target_id: tv?.id ?? null, target_handle: targetSku(v.sku), product_source_id: p.id, status: tv ? "migrated" : "failed", reason: tv ? "one variant per product; SKU suffixed, original in metadata.source_sku" : "variant not found on the created product" });
      for (const pr of built.prices.filter((x) => x.variant_id === v.id)) {
        const ruled = pr.rules && pr.rules.length;
        upsertRow(registry, { kind: "price", source_id: pr.price_id, source_handle: `${v.sku}:${pr.currency_code}`, target_id: tv?.id ?? null, product_source_id: p.id, currency_code: pr.currency_code, amount: Number(pr.amount), status: ruled ? "skipped" : tv ? "migrated" : "failed", reason: ruled ? `price carries rules ${JSON.stringify(pr.rules)} (region-scoped in the source); target regions differ → not migrated` : "currency price on the variant (Medusa prices are per currency, regions with that currency pick it up)" });
      }
    }
    // category links
    for (const cp of snap.category_products.filter((x) => x.product_id === p.id)) {
      const cid = categoryIdBySource.get(cp.category_id);
      upsertRow(registry, { kind: "category_link", source_id: `${cp.category_id}:${p.id}`, source_handle: `${snap.categories.find((c) => c.id === cp.category_id)?.handle}→${p.handle}`, target_id: cid ? `${cid}:${product.id}` : null, product_source_id: p.id, status: cid ? "migrated" : "failed", reason: cid ? "passed as categories[] at product creation" : "category not migrated" });
    }
    // images with the two marks
    const targetImages = product.images ?? [];
    for (const img of built.gallery) {
      const turl = targetUrlFor(img.url);
      const marks = [];
      if (img.rank === built.gallery[0]?.rank && img.id === built.gallery[0]?.id) marks.push("pdp_default_image");
      if (p.thumbnail && img.url === p.thumbnail) marks.push("card_image");
      const ti = turl ? targetImages.find((x) => x.url === turl) : null;
      upsertRow(registry, { kind: "image", source_id: img.id, source_handle: img.url, product_source_id: p.id, rank: img.rank, marks, target_id: ti?.id ?? null, target_url: turl, target_rank: ti?.rank ?? null, status: turl ? "migrated" : "skipped", reason: turl ? "gallery image, order = source rank" : "bytes missing at the source (broken link) — recorded, not invented" });
    }
    if (p.thumbnail && !built.gallery.some((i) => i.url === p.thumbnail)) {
      const turl = targetUrlFor(p.thumbnail);
      upsertRow(registry, { kind: "image", source_id: `thumbnail:${p.id}`, source_handle: p.thumbnail, product_source_id: p.id, rank: null, marks: ["card_image"], target_url: turl, target_id: null, status: turl ? "migrated" : "skipped", reason: turl ? "product.thumbnail only (not in the gallery): the list card image" : "thumbnail bytes missing at the source (broken link in the source, product shows no image there either) — recorded, not invented" });
    }
    if (!p.thumbnail && built.gallery.length === 0) {
      upsertRow(registry, { kind: "image", source_id: `none:${p.id}`, source_handle: null, product_source_id: p.id, rank: null, marks: [], status: "skipped", reason: "source product has no image at all (memory chrxnasdmds-catalog-media-facts) — none invented" });
    }
    // product translations (en rows of product_translation) → done by the medusa exec script, recorded here as pending
    for (const t of snap.product_translations.filter((x) => x.product_handle === p.handle)) {
      upsertRow(registry, { kind: "product_translation", source_id: `${p.handle}:${t.locale}`, source_handle: p.handle, locale: t.locale, product_source_id: p.id, target_id: product.id, fields: Object.entries({ title: t.title, subtitle: t.subtitle, description: t.description, short_characteristics: t.short_characteristics }).filter(([, v]) => v).map(([k]) => k), status: findRow(registry, "product_translation", `${p.handle}:${t.locale}`)?.status === "migrated" ? "migrated" : "pending", reason: "written by translate-products.ts (createTranslationsWorkflow, translation module of the target); source used product_translation rows, metadata.i18n was empty on every product" });
    }
    save();
  }
  log(`products: ${snap.products.length} processed, ${created} created this run`);
}

// ---------- phase: pages
const PAGE_KEY_MAP = {
  // source slug → tenant_page key (TENANT_PAGE_KEYS = contacts | legal | about | privacy | offer)
  contact: "contacts",
  terms: "offer",
  privacy: "privacy",
  about: "about",
  returns: null,
  consent: null,
  "consent-marketing": null,
  "return-memo": null,
  delivery: null,
  faq: null,
  wholesale: null,
};
const LEGAL_FILES = {
  contact: "contact.ts",
  terms: "offer.ts",
  privacy: "privacy.ts",
  returns: "returns.ts",
  consent: "consent-pd.ts",
  "consent-marketing": "consent-marketing.ts",
  "return-memo": "return-memo.ts",
};
const LEGAL_TITLE_KEYS = {
  contact: ["legal.contact.title", "contact.title", "page.contact.heading", "meta.contact.title"],
  terms: ["legal.terms.title"],
  privacy: ["legal.privacy.title"],
  returns: ["legal.returns.title"],
  consent: ["legal.consent.title"],
  "consent-marketing": ["legal.consentMarketing.title"],
  "return-memo": ["legal.returnMemo.title", "legal.returns.title"],
};
function uiPageDocs(messages) {
  const docs = [];
  const t = (locale, key) => messages.merged[locale][key];
  const has = (locale, key) => messages.source(locale, key) !== "missing";
  for (const locale of ["ru", "en"]) {
    // about — PlaceholderPage: eyebrow, title, body1, body2, bullets, ctas
    docs.push({
      slug: "about",
      locale,
      title: t(locale, "about.title"),
      body: [t(locale, "about.body1"), t(locale, "about.body2"), ["about.bullet1", "about.bullet2", "about.bullet3", "about.bullet4"].map((k) => `- ${t(locale, k)}`).join("\n")].join("\n\n") + "\n",
      keys: ["about.title", "about.body1", "about.body2", "about.bullet1", "about.bullet2", "about.bullet3", "about.bullet4"],
    });
    docs.push({
      slug: "delivery",
      locale,
      title: t(locale, "delivery.title"),
      body:
        [
          t(locale, "delivery.body"),
          ["delivery.bullet.cdek", "delivery.bullet.pochta", "delivery.bullet.dhl", "delivery.bullet.cost"].map((k) => `- ${t(locale, k)}`).join("\n"),
          `## ${t(locale, "delivery.payment.heading")}`,
          t(locale, "delivery.payment.lead"),
          ["delivery.payment.methodCard", "delivery.payment.methodSbp", "delivery.payment.methodTransfer"].map((k) => `- ${t(locale, k)}`).join("\n"),
          t(locale, "delivery.payment.noCrypto"),
          t(locale, "delivery.payment.receiptNote"),
          `## ${t(locale, "delivery.rights.heading")}`,
          ["delivery.rights.cancel", "delivery.rights.prepayDelay"].map((k) => `- ${t(locale, k)}`).join("\n"),
          `## ${t(locale, "delivery.contact.heading")}`,
          t(locale, "delivery.contact.body"),
        ].join("\n\n") + "\n",
      keys: ["delivery.title", "delivery.body", "delivery.bullet.cdek", "delivery.bullet.pochta", "delivery.bullet.dhl", "delivery.bullet.cost", "delivery.payment.heading", "delivery.payment.lead", "delivery.payment.methodCard", "delivery.payment.methodSbp", "delivery.payment.methodTransfer", "delivery.payment.noCrypto", "delivery.payment.receiptNote", "delivery.rights.heading", "delivery.rights.cancel", "delivery.rights.prepayDelay", "delivery.contact.heading", "delivery.contact.body"],
    });
    docs.push({
      slug: "faq",
      locale,
      title: t(locale, "page.faq.heading"),
      body: [t(locale, "page.faq.subtitle"), ...[1, 2, 3, 4, 5, 6].map((i) => `### ${t(locale, `faq.q${i}`)}\n\n${t(locale, `faq.a${i}`)}`)].join("\n\n") + "\n",
      keys: ["page.faq.heading", "page.faq.subtitle", ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`faq.q${i}`, `faq.a${i}`])],
    });
    docs.push({
      slug: "wholesale",
      locale,
      title: t(locale, "page.wholesale.heading"),
      body:
        [
          t(locale, "page.wholesale.subtitle"),
          `## ${t(locale, "page.wholesale.offerHeading")}`,
          [1, 2, 3, 4, 5].map((i) => `- ${t(locale, `wholesale.offer${i}`)}`).join("\n"),
          `## ${t(locale, "page.wholesale.stepsHeading")}`,
          [1, 2, 3].map((i) => `${i}. ${t(locale, `wholesale.step${i}`)}`).join("\n"),
          `## ${t(locale, "page.wholesale.contactHeading")}`,
          t(locale, "wholesale.formComingSoon"),
        ].join("\n\n") + "\n",
      keys: ["page.wholesale.heading", "page.wholesale.subtitle", "page.wholesale.offerHeading", ...[1, 2, 3, 4, 5].map((i) => `wholesale.offer${i}`), "page.wholesale.stepsHeading", ...[1, 2, 3].map((i) => `wholesale.step${i}`), "page.wholesale.contactHeading", "wholesale.formComingSoon"],
    });
  }
  for (const d of docs) {
    d.source_kind = "ui-strings";
    d.missing_keys = d.keys.filter((k) => !has(d.locale, k));
    d.text_sources = Object.fromEntries(d.keys.map((k) => [k, messages.source(d.locale, k)]));
    d.locale_specific = d.keys.some((k) => messages.source(d.locale, k).startsWith(d.locale));
  }
  return docs;
}
function legalPageDocs(messages) {
  const docs = [];
  for (const [slug, file] of Object.entries(LEGAL_FILES)) {
    const f = path.join(SOURCE_ROOT, "apps/storefront/src/lib/legal/content", file);
    const body = extractLegalMarkdown(f);
    const titleKey = LEGAL_TITLE_KEYS[slug].find((k) => messages.source("ru", k) !== "missing") ?? null;
    docs.push({
      slug,
      locale: "ru",
      title: titleKey ? messages.merged.ru[titleKey] : slug,
      title_key: titleKey,
      body,
      source_kind: "legal-markdown",
      source_file: path.relative(SOURCE_ROOT, f),
      placeholders: [...new Set(body.match(/\{\{[^}]+\}\}/g) ?? [])],
      locale_specific: true,
    });
  }
  return docs;
}
async function phasePages() {
  const messages = buildMessages();
  const docs = [...legalPageDocs(messages), ...uiPageDocs(messages)];
  if (PAGES_OUT) mkdirSync(PAGES_OUT, { recursive: true });
  for (const d of docs) {
    const key = PAGE_KEY_MAP[d.slug];
    const sourceUrl = `${SOURCE_STORE_ORIGIN}/ru/${d.locale}/${d.slug === "terms" ? "terms" : d.slug}`;
    if (PAGES_OUT) {
      const front = [`---`, `slug: ${d.slug}`, `locale: ${d.locale}`, `title: ${JSON.stringify(d.title)}`, `source_kind: ${d.source_kind}`, d.source_file ? `source_file: ${d.source_file}` : null, `tenant_page_key: ${key ?? "none"}`, `exported_at: ${stamp()}`, `---`, ``].filter((x) => x !== null).join("\n");
      writeFileSync(path.join(PAGES_OUT, `${d.slug}.${d.locale}.md`), front + `# ${d.title}\n\n` + d.body);
    }
    const base = {
      kind: "page",
      source_id: `${d.slug}:${d.locale}`,
      source_handle: d.slug,
      locale: d.locale,
      title: d.title,
      source_kind: d.source_kind,
      source_url: sourceUrl,
      target_handle: key,
      target_url: key ? `${STOREFRONT_ORIGIN}/${d.locale}/pages/${key}` : null,
      placeholders: d.placeholders ?? [],
      missing_keys: d.missing_keys ?? [],
    };
    if (d.source_kind === "ui-strings" && d.locale === "en" && !d.locale_specific) {
      upsertRow(registry, { ...base, status: "skipped", reason: "en text is the same fallback the ru page already carries (no en-specific strings)" });
      continue;
    }
    if (!key) {
      upsertRow(registry, { ...base, status: "pending", reason: "no tenant_page key for this page (TENANT_PAGE_KEYS = contacts|legal|about|privacy|offer); body exported to the pages folder; proposal for Ivan: extend the key list" });
      continue;
    }
    if (DRY) {
      upsertRow(registry, { ...base, status: "pending", reason: `dry-run: would PUT /tenants/pages/${key} (locale ${d.locale})` });
      continue;
    }
    try {
      const r = await api.put(`/tenants/pages/${key}`, { title: d.title, body: d.body, published: true, locale: d.locale });
      upsertRow(registry, { ...base, target_id: r.page.id, status: "migrated", reason: `${d.source_kind}${d.placeholders?.length ? `; ${d.placeholders.length} {{PLACEHOLDER}} tokens kept verbatim (requisites come from Ivan/Oksana)` : ""}` });
    } catch (e) {
      upsertRow(registry, { ...base, status: "failed", reason: e.message });
    }
  }
  // the `legal` key has no counterpart in the source (requisites live inside the contact page)
  upsertRow(registry, { kind: "page", source_id: "legal:none", source_handle: null, locale: null, target_handle: "legal", status: "skipped", reason: "target key `legal` (реквизиты) has no separate page in the source: requisites are part of the contact page (CONTACT_MD)" });
  // legacy pages.json (39 entries of the old Astro mirror; only pages/bundle-assortment has a route)
  const legacy = JSON.parse(readFileSync(path.join(SOURCE_ROOT, "apps/backend/src/data/pages.json"), "utf8"));
  const legacyList = Array.isArray(legacy) ? legacy : legacy.pages ?? Object.values(legacy);
  for (const entry of legacyList) {
    const slug = entry.slug ?? entry.path ?? entry.handle ?? entry.key ?? "?";
    upsertRow(registry, { kind: "legacy_page", source_id: `pages.json:${slug}`, source_handle: slug, title: entry.title ?? null, status: "skipped", reason: slug === "bundle-assortment" ? "the one legacy entry with a live route (pages/bundle-assortment) — recommendation: re-create by hand only if Oksana still needs it" : "legacy entry of the old Astro mirror without a storefront route — recommendation: do not migrate" });
  }
  save();
  log(`pages: ${docs.length} documents processed, ${legacyList.length} legacy entries listed`);
}

// ---------- phase: home
async function phaseHome() {
  const banners = [...snap.home_banners].sort((a, b) => a.sort - b.sort);
  const hero = banners[0];
  if (!hero) return;
  const heroImage = hero.bg_image_url ? targetUrlFor(hero.bg_image_url) : hero.image_url ? targetUrlFor(hero.image_url) : null;
  const en = hero.metadata?.i18n?.en ?? {};
  const doc = {
    schema: "upready.tenant-home/v1",
    theme: { preset: THEME_PRESET },
    settings: { defaultMode: "light", header: "h2", hero: "k", tiles: "on", listing: "p4", footer: "f4" },
    content: {
      hero: {
        title: hero.title ?? "",
        subtitle: hero.subtitle ?? "",
        cta_label: hero.cta_label ?? "",
        cta_href: hero.cta_href ?? "/store",
        image_url: heroImage,
        i18n: { en: { title: en.title ?? "", subtitle: en.subtitle ?? "", cta_label: en.cta_label ?? "" } },
      },
      products: { source: "popular" },
      order: ["hero", "categories", "products"],
    },
  };
  const base = (b) => ({ kind: "banner", source_id: b.id, source_handle: b.metadata?.seed_key ?? null, title: b.title, sort: b.sort, image_source: b.bg_image_url ?? b.image_url ?? null });
  if (DRY) {
    upsertRow(registry, { ...base(hero), status: "pending", reason: "dry-run: would PUT /tenants/home as the hero" });
  } else {
    try {
      const r = await api.put("/tenants/home", doc);
      upsertRow(registry, { ...base(hero), target_id: r.home?.updatedAt ?? "tenant_home_config", target_url: `${TARGET_URL_PREFIX}`, status: "migrated", reason: `first banner by sort → tenant home hero (title/subtitle/CTA + i18n.en); theme preset ${THEME_PRESET}; composition h2/k/tiles/p4/f4 light — hero K is the variant that renders the tenant's own title/subtitle/CTA/image (hero H draws three collection photos and ignores image_url); Ivan picks the final look at acceptance` });
    } catch (e) {
      upsertRow(registry, { ...base(hero), status: "failed", reason: e.message });
    }
  }
  for (const b of banners.slice(1)) {
    upsertRow(registry, { ...base(b), status: "pending", reason: "the tenant home document holds ONE hero; source carousel had 3 banners — text and image kept in source-snapshot.json; proposal: carousel support or a promo block" });
  }
  upsertRow(registry, { kind: "layout_configuration", source_id: snap.layout_configuration[0]?.id ?? "layout", status: "skipped", reason: "source layout_configuration (Medusa admin layout) is admin-UI state, not storefront content" });
  save();
  log(`home: hero from banner "${hero.title}"`);
}

// ---------- phase: rest (datasets not migrated, one row each with a recommendation)
function phaseRest() {
  const m = (key) => snap[key]?.length ?? null;
  const rows = [
    ["customers", 46, "pending", "customers (46) are NOT migrated by default — question to Ivan: consent/legal basis for moving personal data between operators; recommendation: do not migrate, re-registration on the new site"],
    ["orders", 88, "pending", "orders (88) are NOT migrated by default — history stays in the source ring; recommendation: export the order list as an archive for Oksana, do not re-create orders"],
    ["reviews", 332, "pending", "customer reviews live as translation rows (resource review, en+ru, 332 each); the target has no reviews feature — recommendation: keep the export, revisit when a reviews block exists"],
    ["articles", m("articles"), "pending", "journal articles (18 = 9 ru + 9 en, module blog); the target has no blog — recommendation: decide with Ivan (port the blog module or publish as static pages)"],
    ["courses", m("courses"), "pending", "courses (2) + entitlements (10) + progress (37) — the course engine is not in the target; recommendation: not part of the shop tenant"],
    ["pickup_point_records", m("pickup_point_records"), "skipped", "manual pickup datasets (3) belong to the carrier-abstraction layer — follows the ApiShip/shipping port decision"],
    ["order_tracking", 0, "skipped", "0 rows"],
    ["loyalty_gift_cards", 0, "skipped", "0 rows"],
    ["agent_conversations", 50, "skipped", "AI agent dialogues (50) — the agent chat is not in the target; not customer data of the shop"],
    ["ai_image_generations", 4, "skipped", "AI image generation log (4) — tooling state"],
    ["auth_identities", 34, "skipped", "34 emailpass identities of customers/admins — never migrated (password hashes stay with the operator); no telegram/yandex provider rows exist"],
    ["email_link_codes", 3, "skipped", "Telegram login codes (3) — transient"],
    ["ui_translations", 910, "skipped", "910 UI keys × ru/en override the SOURCE storefront's own strings; the target storefront has different keys — only the page texts were carried over (see kind page)"],
    ["product_types", m("types"), "skipped", "global reference data in Medusa (no tenant-scoped create): value kept in product metadata.source_type; matched to a global type when one with the same value exists"],
    ["product_tags", m("tags"), "skipped", "same as types: metadata.source_tags (4 product↔tag links in the source)"],
    ["collections", m("collections"), "skipped", "2 collections (bestsellers, new-arrivals) with 0 products assigned — nothing to carry"],
    ["regions", m("regions"), "skipped", "source regions (Россия и СНГ rub, US usd) are store-wide infrastructure; target already has Russia/rub, United States/usd, Germany/eur"],
    ["site_locales", m("site_locales"), "pending", "source locales ru (default) + en → tenant needs default ru; per-tenant locale/currency is the open decision of the wave-2 track (STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN not touched)"],
    ["shipping_options", m("shipping_options"), "pending", "2 abstract options (Курьером до двери / Заберу сам, provider shipping_shipping, calculated) — depend on porting the carrier-abstraction provider; the tenant warehouse comes with the platform's default options"],
    ["review_translations", 332, "skipped", "see reviews"],
  ];
  for (const [id, count, status, reason] of rows) upsertRow(registry, { kind: "dataset", source_id: id, count, status, reason });
  save();
  log(`rest: ${rows.length} datasets listed`);
}

// ---------- main
(async () => {
  log(`import ${DRY ? "(dry-run) " : ""}→ ${BACKEND}, tenant ${HANDLE}, phases ${ONLY.join(",")}`);
  const tenant = want("tenant") || ONLY.some((p) => p !== "rest") ? await phaseTenant() : null;
  const canWrite = Boolean(tenant);
  if (canWrite && want("categories")) await phaseCategories();
  if (canWrite && want("images")) await phaseImages();
  if (canWrite && want("products")) await phaseProducts();
  if (canWrite && want("pages")) await phasePages();
  if (canWrite && want("home")) await phaseHome();
  if (want("rest")) phaseRest();
  save();
  const failed = registry.rows.filter((r) => r.status === "failed");
  console.log(JSON.stringify(registry.summary, null, 1));
  if (failed.length) {
    console.error(`${failed.length} failed row(s):`);
    for (const r of failed.slice(0, 20)) console.error(`  ${r.kind} ${r.source_id}: ${r.reason}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error("import aborted:", e.message);
  save();
  process.exit(1);
});
