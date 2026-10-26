// Cherkashina → upready-store: the journal (t10-blog).
//
// Carries the PUBLISHED articles of the source store (`medusa_chrxn`, table
// `article`) into a tenant's journal on this platform. Talks ONLY to the tenant
// HTTP API (`/auth/tenant/*`, `/tenants/*`) — never SQL into the target — the
// same rule `import.mjs` next to it follows.
//
//   node import-articles.mjs --backend http://localhost:9250 \
//     --admin-email admin@cherkashino.test --admin-password supersecret \
//     --registry <path to the mapping registry json> \
//     [--source-db postgres://ivanprotsko@localhost:5433/medusa_chrxn] \
//     [--source-root /Users/ivanprotsko/upready/projects/chrxnasdmds] \
//     [--snapshot <export-source.mjs snapshot.json>] \
//     [--dry-run] [--only-slug <slug>] [--psql-bin <path>]
//
// What it promises:
//  - slugs and publication dates are carried unchanged;
//  - `ru` and `en` stay TWO LOCALE ROWS OF ONE ARTICLE (same slug), which is
//    what the model is built for;
//  - DRAFTS OF THE SOURCE ARE NOT CARRIED. The 18 published articles are the
//    ones Oksana reviewed; the 45 MDX drafts and the 39 outlines are not
//    articles and this script never reads them;
//  - every cover is RE-HOSTED to the tenant's own uploads, so no article on the
//    new shop points at the old store's host. A cover whose file is missing
//    locally is REPORTED, never silently dropped, and the article is still
//    carried without it;
//  - an image or a link inside the body pointing at a foreign host is reported
//    the same way (it cannot be re-hosted without its bytes);
//  - idempotent: a second run writes nothing. A row already identical on the
//    target is `unchanged`, and its cover is reused rather than uploaded again
//    (an upload always mints a new name, so re-uploading would be a silent leak
//    of duplicate files).
//
// Exit code 1 when any registry row ends `failed`.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { makeClient } from "./lib/http.mjs";
import { loadRegistry, saveRegistry, upsertRow } from "./lib/mapping-registry.mjs";
import { makePsql, PSQL_DEFAULT, stamp } from "./lib/psql.mjs";

// ---------- args
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const BACKEND = opt("--backend", "http://localhost:9250");
const SOURCE_DB = opt("--source-db", "postgres://ivanprotsko@localhost:5433/medusa_chrxn");
const SOURCE_ROOT = opt("--source-root", "/Users/ivanprotsko/upready/projects/chrxnasdmds");
const SNAPSHOT = opt("--snapshot", null);
const REGISTRY = opt("--registry", null);
const ADMIN_EMAIL = opt("--admin-email", null);
const ADMIN_PASSWORD = opt("--admin-password", null);
const ONLY_SLUG = opt("--only-slug", null);
const PSQL_BIN = opt("--psql-bin", PSQL_DEFAULT);
const DRY = flag("--dry-run");

if (!REGISTRY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("required: --registry --admin-email --admin-password");
  process.exit(2);
}

const registry = loadRegistry(REGISTRY);
const api = makeClient(BACKEND);
const log = (...a) => console.log(`[${stamp().slice(11)}]`, ...a);
const save = () => saveRegistry(REGISTRY, registry);

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

// ---------- source
/**
 * The 18 published articles. Read from an `export-source.mjs` snapshot when one
 * is given, otherwise straight out of the source database. Either way only
 * `status = 'published'` and `deleted_at is null` are taken: a draft of the old
 * store was never reviewed by its owner.
 */
function readSource() {
  if (SNAPSHOT) {
    const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    const rows = snap.articles ?? snap.data?.articles ?? [];
    return rows.filter((row) => row.status === "published" && !row.deleted_at);
  }

  const query = makePsql({ command: PSQL_BIN, args: [SOURCE_DB] });
  return query(`
    select slug, locale, title, excerpt, body, cover_url, category, tags,
           published_at, seo_title, seo_description
      from article
     where deleted_at is null and status = 'published'
     order by slug, locale
  `);
}

/**
 * Where the bytes of a source asset live on this machine. The old storefront
 * served `/advices/<slug>.png` straight out of its `public/` directory; a
 * `/static/...` URL of the old backend is its own on-disk tree. Anything else
 * (an absolute URL on a host we have no copy of) has no local file, and the
 * caller reports it rather than pretending.
 */
function sourceFileForUrl(url) {
  if (!url) return null;
  const u = decodeURIComponent(url.trim());
  if (u.startsWith("/")) {
    return path.join(SOURCE_ROOT, "apps/storefront/public", u);
  }
  const m = u.match(/^https?:\/\/[^/]+\/static\/(.+)$/);
  if (m) return path.join(SOURCE_ROOT, "apps/backend/static", m[1]);
  return null;
}

/** Every image and link the body points at, so nothing travels unreported. */
function foreignRefs(body) {
  const refs = [];
  const text = body ?? "";
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    refs.push({ kind: "image", url: m[1] });
  }
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^(mailto:|tel:|#)/i.test(m[1])) continue;
    if (!refs.some((r) => r.url === m[1] && r.kind === "image")) {
      refs.push({ kind: "link", url: m[1] });
    }
  }
  for (const m of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    refs.push({ kind: "image", url: m[1] });
  }
  return refs;
}

const parseTags = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((t) => t.trim()).filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).map((t) => t.trim()).filter(Boolean);
    } catch {
      /* fall through to the comma split */
    }
  }
  return text.split(",").map((t) => t.trim()).filter(Boolean);
};

const isoOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const nz = (v) => {
  if (v === null || v === undefined) return null;
  const text = String(v).trim();
  return text.length ? text : null;
};

/**
 * The source keeps a category SLUG (`peptides`), the shop shows a word. These are the
 * words the old storefront printed above each card and article (chrxnasdmds
 * `articles-generated.ts` and `articles-en-part*.json`, field `eyebrow`). A slug with no
 * entry goes over as written, a locale with no entry falls back to English.
 */
const CATEGORY_LABELS = {
  peptides: { ru: "Пептиды", en: "Peptides" },
  detox: { ru: "Детокс", en: "Detox" },
  cleansing: { ru: "Очищение", en: "Cleansing" },
};

const categoryLabel = (slug, locale) => {
  const key = nz(slug);
  if (!key) return null;
  const labels = CATEGORY_LABELS[key.toLowerCase()];
  return labels ? (labels[locale] ?? labels.en) : key;
};

// ---------- target
async function login() {
  const res = await api.post(
    "/auth/tenant/emailpass",
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { auth: false },
  );
  if (!res?.token) throw new Error("login answered without a token");
  api.setToken(res.token);
  // `/tenants/me` answers the ADMIN with its tenant nested, not the tenant.
  const me = await api.get("/tenants/me");
  const tenant = me?.tenant_admin?.tenant ?? me?.tenant;
  if (!tenant?.id) throw new Error("/tenants/me answered without a tenant");
  return tenant;
}

/** Every language row of one slug, or `[]` when the tenant has no such article. */
async function targetRows(slug) {
  try {
    const res = await api.get(`/tenants/articles/${encodeURIComponent(slug)}`);
    return res.articles ?? [];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

/** One upload per unique source file per run; the url is cached by file path. */
const uploadCache = new Map();

async function rehost(file) {
  // A cache HIT is not an upload. The two locale rows of one article share one
  // cover file, so counting calls here would report 18 uploads for 9 files —
  // a number that reads as a measurement and is not one (rule 20a).
  if (uploadCache.has(file)) return uploadCache.get(file);

  const buf = readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const form = new FormData();
  form.append(
    "files",
    new Blob([buf], { type: MIME[ext] ?? "application/octet-stream" }),
    path.basename(file),
  );
  const res = await api.upload("/tenants/uploads", form);
  const url = res?.files?.[0]?.url;
  if (!url) throw new Error(`upload answered without a url: ${JSON.stringify(res).slice(0, 200)}`);
  uploadCache.set(file, url);
  return url;
}

/**
 * What the target row must hold for this source row. Comparing THIS against the
 * row already on file is what makes a second run write nothing.
 */
const desired = (src, coverUrl) => ({
  title: src.title ?? "",
  excerpt: nz(src.excerpt),
  cover_url: coverUrl,
  body: src.body ?? "",
  published: true,
  published_at: isoOrNull(src.published_at),
  category: categoryLabel(src.category, src.locale),
  tags: parseTags(src.tags ?? src.category),
  seo_title: nz(src.seo_title),
  seo_description: nz(src.seo_description),
});

const sameAsTarget = (want, have) =>
  have &&
  have.title === want.title &&
  (have.excerpt ?? null) === want.excerpt &&
  (have.cover_url ?? null) === want.cover_url &&
  (have.body ?? "") === want.body &&
  have.published === want.published &&
  isoOrNull(have.published_at) === want.published_at &&
  (have.category ?? null) === want.category &&
  JSON.stringify(have.tags ?? []) === JSON.stringify(want.tags) &&
  (have.seo_title ?? null) === want.seo_title &&
  (have.seo_description ?? null) === want.seo_description;

// ---------- run
const counters = {
  read: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  failed: 0,
  /** Files actually uploaded to the tenant. Two locales of one article share one. */
  covers_rehosted: 0,
  /** Article rows that ended up with a cover, re-hosted or already on file. */
  covers_attached: 0,
  covers_missing: 0,
  body_refs_reported: 0,
};
const notCarried = [];

async function main() {
  const source = readSource().filter((row) => !ONLY_SLUG || row.slug === ONLY_SLUG);
  counters.read = source.length;
  log(`source: ${source.length} published rows${ONLY_SLUG ? ` (--only-slug ${ONLY_SLUG})` : ""}`);

  const tenant = await login();
  registry.tenant ??= { id: tenant.id, handle: tenant.handle };
  log(`target tenant: ${tenant.handle} (${tenant.id})`);

  // One read per slug rather than per row: an article's language rows come back
  // together, and the source is ordered by slug.
  const rowsBySlug = new Map();
  for (const src of source) {
    if (!rowsBySlug.has(src.slug)) {
      rowsBySlug.set(src.slug, await targetRows(src.slug));
    }

    const base = { kind: "article", source_id: `${src.slug}:${src.locale}` };
    const existing = rowsBySlug.get(src.slug).find((row) => row.locale === src.locale) ?? null;

    try {
      // ---- cover
      let coverUrl = existing?.cover_url ?? null;
      const sourceCover = nz(src.cover_url);

      if (sourceCover && !coverUrl) {
        const file = sourceFileForUrl(sourceCover);
        if (file && existsSync(file) && statSync(file).isFile()) {
          if (DRY) {
            coverUrl = `(dry-run: would upload ${path.relative(SOURCE_ROOT, file)})`;
          } else {
            const before = uploadCache.size;
            coverUrl = await rehost(file);
            if (uploadCache.size > before) counters.covers_rehosted += 1;
            counters.covers_attached += 1;
          }
        } else {
          counters.covers_missing += 1;
          notCarried.push({
            slug: src.slug,
            locale: src.locale,
            what: "cover",
            url: sourceCover,
            reason: file
              ? `no local file at ${file}`
              : "cover is on a host we hold no copy of; its bytes cannot be re-hosted",
          });
          coverUrl = null;
        }
      }

      // ---- foreign references inside the body
      for (const ref of foreignRefs(src.body)) {
        counters.body_refs_reported += 1;
        notCarried.push({
          slug: src.slug,
          locale: src.locale,
          what: `body ${ref.kind}`,
          url: ref.url,
          reason:
            ref.kind === "image"
              ? "image inside the body still points at the source; re-host it and edit the article"
              : "link inside the body points outside this shop; check it still resolves",
        });
      }

      const want = desired(src, coverUrl);

      if (sameAsTarget(want, existing)) {
        counters.unchanged += 1;
        upsertRow(registry, {
          ...base,
          target_id: existing.id,
          status: "migrated",
          reason: "already identical on the target; nothing written",
        });
        continue;
      }

      if (DRY) {
        counters.skipped += 1;
        upsertRow(registry, {
          ...base,
          status: "pending",
          reason: existing
            ? "dry-run: would PUT /tenants/articles/<slug>"
            : "dry-run: would POST /tenants/articles then PUT",
        });
        continue;
      }

      if (!existing) {
        await api.post("/tenants/articles", {
          slug: src.slug,
          locale: src.locale,
          title: want.title || src.slug,
        });
        counters.created += 1;
      } else {
        counters.updated += 1;
      }

      const saved = await api.put(`/tenants/articles/${encodeURIComponent(src.slug)}`, {
        locale: src.locale,
        ...want,
      });

      // Keep the per-slug cache honest for the second language of this article.
      const group = rowsBySlug.get(src.slug).filter((row) => row.locale !== src.locale);
      group.push(saved.article);
      rowsBySlug.set(src.slug, group);

      upsertRow(registry, {
        ...base,
        target_id: saved.article.id,
        target_url: `/journal/${src.slug}`,
        status: "migrated",
        reason: existing ? "updated in place" : "created and published",
      });
      log(`${existing ? "updated" : "created"} ${src.slug} [${src.locale}]`);
    } catch (error) {
      counters.failed += 1;
      upsertRow(registry, { ...base, status: "failed", reason: String(error.message ?? error) });
      console.error(`FAILED ${src.slug} [${src.locale}]: ${error.message ?? error}`);
    }

    if ((counters.created + counters.updated) % 10 === 0) save();
  }

  save();

  console.log("");
  console.log(`=== import-articles ${DRY ? "(dry run) " : ""}${stamp()} ===`);
  for (const [key, value] of Object.entries(counters)) {
    console.log(`${key.padEnd(20)} ${value}`);
  }

  if (notCarried.length) {
    console.log("");
    console.log(`not carried as-is (${notCarried.length}):`);
    for (const item of notCarried) {
      console.log(`  ${item.slug} [${item.locale}] ${item.what}: ${item.url} — ${item.reason}`);
    }
  } else {
    console.log("");
    console.log(
      DRY
        ? "not carried as-is: nothing found — every cover has a local file, no foreign reference in any body"
        : "not carried as-is: nothing — every cover re-hosted, no foreign reference in any body",
    );
  }

  console.log("");
  console.log(`registry: ${REGISTRY}`);

  if (counters.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
