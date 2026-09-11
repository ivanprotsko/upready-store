#!/usr/bin/env node
/**
 * Builds the two reference books of specs/catalog-taxonomy/ — trade spheres and trade
 * categories — from ONE primary source, Google Product Taxonomy, and files the 67 products
 * of the five branded datasets under them.
 *
 *   node scripts/catalog-taxonomy/build.mjs            # writes the three JSON + one TSV
 *   node scripts/catalog-taxonomy/build.mjs --check    # exits 1 when the files on disk differ
 *
 * Source (rule 43, downloaded 2026-09-12, kept under research/raw, never edited):
 *   ~/upready/research/raw/2026-09-12-google-product-taxonomy/taxonomy-with-ids.en-US.txt
 *   ~/upready/research/raw/2026-09-12-google-product-taxonomy/taxonomy-with-ids.ru-RU.txt
 *
 * Why Google Product Taxonomy and not GS1 GPC or ОКПД2: see specs/catalog-taxonomy/TAXONOMY.md.
 * The trimming is a RULE written below, not a hand-edited list, so the books can be rebuilt
 * from a newer taxonomy release and the diff explains itself.
 *
 * Both books are OPTIONAL for a shop (GLOSSARY.md rule 1–2): nothing here is required by the
 * seed, the storefront or the panel. A shop with no sphere gets an abstract dataset.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..");
const SPECS = path.join(REPO, "specs", "catalog-taxonomy");
const RAW_DIR = path.join(os.homedir(), "upready", "research", "raw", "2026-09-12-google-product-taxonomy");
const INVENTORY_TSV = path.join(
  REPO,
  "artifacts",
  "docs",
  "2026-09-12-catalog-taxonomy-inventory-products.tsv",
);

const SOURCE = {
  name: "Google Product Taxonomy",
  version: "2021-09-21",
  locales: ["en-US", "ru-RU"],
  urls: [
    "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt",
    "https://www.google.com/basepages/producttype/taxonomy-with-ids.ru-RU.txt",
  ],
  fetchedAt: "2026-09-12",
  rawDir: "~/upready/research/raw/2026-09-12-google-product-taxonomy/",
};

// --- the trimming rule -------------------------------------------------------------------
//
// A sphere is kept when a small direct-to-consumer shop of physical goods can run it on this
// storefront as it is today. Dropped spheres each name the feature the storefront lacks.
const DROPPED_SPHERES = {
  111: "Business & Industrial — B2B trade (quotes, volume pricing); B2B is a separate axis (сфера деятельности), not a sphere of trade",
  632: "Hardware — professional supply and building materials, freight logistics the storefront does not model",
  772: "Mature — age-gated goods, no age gate on the storefront",
  783: "Media — books, music and video need ISBN/ISRC data and digital delivery",
  5605: "Religious & Ceremonial — no realistic starter catalog for a portfolio shop",
  2092: "Software — licence keys and digital delivery, not physical goods",
  888: "Vehicles & Parts — fitment data (make/model/year) the catalog has no field for",
};

// A trade category is kept when it is consumer retail of physical goods and not regulated.
const EXCLUDED_TRADE_CATEGORIES = {
  3237: "Live Animals — not goods",
  499969: "Event Tickets — not physical goods",
  435: "Tobacco Products — regulated, age-gated",
  3356: "Arcade Equipment — commercial equipment",
  3702: "Circuit Boards & Components — industrial supply",
  1801: "Components — industrial supply",
  6544: "GPS Tracking Devices — regulated telematics",
  340: "Marine Electronics — specialist trade",
  912: "Radar Detectors — regulated",
  500091: "Speed Radars — regulated",
  4488: "Toll Collection Devices — operator-issued",
  359: "Business & Home Security — installation trade",
  5835: "Emergency Preparedness — regulated supplies",
  1679: "Flood, Fire & Gas Safety — certified safety equipment",
  600: "Smoking Accessories — age-gated",
  2639: "Wood Stoves — installation trade, heavy freight",
  6792: "Fireplaces — installation trade, heavy freight",
  2862: "Fireplace & Wood Stove Accessories — installation trade",
  729: "Pool & Spa — installation trade",
};

// --- the 67 products: profile category (or handle) -> Google leaf id ----------------------
//
// The leaf is the EVIDENCE; the sphere and the trade category are read off its path. A rule
// keyed by handle beats one keyed by category, because a shop's own category is not a
// taxonomy node: "kitchen-textiles" holds an apron (Kitchen & Dining) and a towel (Linens).
const LEAF_BY_CATEGORY = {
  "electronics:headphones": 505771,
  "electronics:earbuds": 505771,
  "electronics:speakers": 249,
  "electronics:power-banks": 276,
  "home-goods:cookware": 654,
  "sneakers:low-tops": 187,
  "sneakers:high-tops": 187,
  "sneakers:runners": 187,
  "sneakers:trail": 187,
  "supplements:multivitamins": 525,
  "supplements:vitamins-and-minerals": 525,
  "supplements:sleep-and-calm": 525,
  "supplements:joints-and-mobility": 525,
  "supplements:gut-health": 525,
  "womens-fashion:dresses": 2271,
  "womens-fashion:trousers-and-skirts": 204,
  "womens-fashion:coats-and-jackets": 203,
};

const LEAF_BY_HANDLE = {
  "electronics:stack-charger": 505295,
  "electronics:braid-cable": 259,
  "electronics:hub-dock": 300,
  "home-goods:dinner-plates": 673,
  "home-goods:mug": 674,
  "home-goods:serving-board": 4026,
  "home-goods:waffle-towels": 4257,
  "home-goods:cross-back-apron": 639,
  "home-goods:table-runner": 6325,
  "home-goods:canister": 2626,
  "home-goods:candle-holder": 2784,
  "home-goods:hook-rail": 5708,
  "sneakers:care-kit": 628,
  "sneakers:flat-waxed-laces": 1856,
  "sneakers:round-waxed-laces": 1856,
  "womens-fashion:aubin-merino-crew": 212,
  "womens-fashion:vaux-longline-cardigan": 212,
  "womens-fashion:orne-wool-scarf": 177,
  "womens-fashion:mazan-silk-shirt": 212,
  "womens-fashion:carre-silk-square": 177,
  "womens-fashion:noyer-bias-skirt": 1581,
};

// --- parsing ------------------------------------------------------------------------------

const parseTaxonomy = (file) => {
  const byId = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = /^(\d+) - (.+)$/.exec(line);
    if (!m) throw new Error(`${path.basename(file)}: unparsable line "${line}"`);
    byId.set(Number(m[1]), m[2].split(" > "));
  }
  return byId;
};

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const en = parseTaxonomy(path.join(RAW_DIR, "taxonomy-with-ids.en-US.txt"));
const ru = parseTaxonomy(path.join(RAW_DIR, "taxonomy-with-ids.ru-RU.txt"));

if (en.size !== ru.size) {
  throw new Error(`en-US has ${en.size} nodes, ru-RU has ${ru.size} — the two files are not the same release.`);
}

const nameRu = (id) => {
  const segments = ru.get(id);
  if (!segments) throw new Error(`ru-RU has no node ${id}`);
  return segments[segments.length - 1];
};

// --- spheres (level 1) --------------------------------------------------------------------

const allSpheres = [...en].filter(([, segments]) => segments.length === 1);
const spheres = [];
const dropped = [];
for (const [gptId, segments] of allSpheres) {
  const name = segments[0];
  if (DROPPED_SPHERES[gptId]) {
    dropped.push({ gptId, name, reason: DROPPED_SPHERES[gptId] });
    continue;
  }
  spheres.push({ slug: slugify(name), gptId, name: { en: name, ru: nameRu(gptId) } });
}
spheres.sort((a, b) => a.slug.localeCompare(b.slug));

const sphereSlugByName = new Map(spheres.map((s) => [s.name.en, s.slug]));
const unknownDrop = Object.keys(DROPPED_SPHERES).filter((id) => !allSpheres.some(([g]) => g === Number(id)));
if (unknownDrop.length) throw new Error(`DROPPED_SPHERES names ids that are not level-1 nodes: ${unknownDrop}`);

// --- trade categories (level 2 under kept spheres) ----------------------------------------

const categories = [];
const excluded = [];
for (const [gptId, segments] of en) {
  if (segments.length !== 2) continue;
  const sphere = sphereSlugByName.get(segments[0]);
  if (!sphere) continue; // under a dropped sphere
  const name = segments[1];
  if (EXCLUDED_TRADE_CATEGORIES[gptId]) {
    excluded.push({ gptId, sphere, name, reason: EXCLUDED_TRADE_CATEGORIES[gptId] });
    continue;
  }
  categories.push({ slug: slugify(name), gptId, sphere, name: { en: name, ru: nameRu(gptId) } });
}
categories.sort((a, b) => a.sphere.localeCompare(b.sphere) || a.slug.localeCompare(b.slug));

const dupSlug = categories.filter((c, i, all) => all.findIndex((o) => o.slug === c.slug) !== i);
if (dupSlug.length) throw new Error(`trade category slugs collide: ${dupSlug.map((c) => c.slug)}`);

const unknownExcl = Object.keys(EXCLUDED_TRADE_CATEGORIES).filter((id) => {
  const segments = en.get(Number(id));
  return !segments || segments.length !== 2;
});
if (unknownExcl.length) throw new Error(`EXCLUDED_TRADE_CATEGORIES names ids that are not level-2 nodes: ${unknownExcl}`);

const categoryByGpt = new Map(categories.map((c) => [c.gptId, c]));
const categorySlugByPath = new Map(categories.map((c) => [`${c.sphere}>${c.name.en}`, c.slug]));

// --- the 67 products ----------------------------------------------------------------------

const rows = fs
  .readFileSync(INVENTORY_TSV, "utf8")
  .split("\n")
  .filter(Boolean)
  .slice(1)
  .map((line) => {
    const [profile, category, handle, title] = line.split("\t");
    return { profile, category, handle, title };
  });

if (rows.length !== 67) throw new Error(`inventory TSV lists ${rows.length} products, expected 67`);

const mapping = [];
const uncovered = [];
const crossSphere = [];
for (const row of rows) {
  const leafId = LEAF_BY_HANDLE[`${row.profile}:${row.handle}`] ?? LEAF_BY_CATEGORY[`${row.profile}:${row.category}`];
  if (!leafId) {
    uncovered.push({ ...row, reason: "no rule names a Google leaf for this product" });
    continue;
  }
  const leaf = en.get(leafId);
  if (!leaf) throw new Error(`rule for ${row.profile}/${row.handle} names leaf ${leafId}, which is not in the taxonomy`);

  const sphereSlug = sphereSlugByName.get(leaf[0]);
  if (!sphereSlug) {
    uncovered.push({ ...row, gptLeafId: leafId, gptLeafPath: leaf.join(" > "), reason: `its sphere "${leaf[0]}" is dropped` });
    continue;
  }
  const tradeSlug = leaf.length >= 2 ? categorySlugByPath.get(`${sphereSlug}>${leaf[1]}`) ?? null : null;
  if (leaf.length >= 2 && !tradeSlug) {
    uncovered.push({ ...row, gptLeafId: leafId, gptLeafPath: leaf.join(" > "), reason: `its trade category "${leaf[1]}" is excluded` });
    continue;
  }

  const entry = {
    profile: row.profile,
    handle: row.handle,
    title: row.title,
    category: row.category,
    sphere: sphereSlug,
    tradeCategory: tradeSlug,
    gptLeafId: leafId,
    gptLeafPath: leaf.join(" > "),
  };
  mapping.push(entry);

  // The dataset's own sphere is the one most of its products sit in; a product filed under
  // another sphere is a cross-sphere item and is NAMED, not silently absorbed.
  row.sphere = sphereSlug;
}

const datasetSphere = new Map();
for (const profile of new Set(rows.map((r) => r.profile))) {
  const counts = new Map();
  for (const m of mapping.filter((x) => x.profile === profile)) counts.set(m.sphere, (counts.get(m.sphere) ?? 0) + 1);
  const [winner] = [...counts].sort((a, b) => b[1] - a[1])[0];
  datasetSphere.set(profile, winner);
}
for (const m of mapping) {
  if (m.sphere !== datasetSphere.get(m.profile)) {
    m.crossSphere = true;
    crossSphere.push({ profile: m.profile, handle: m.handle, title: m.title, sphere: m.sphere, datasetSphere: datasetSphere.get(m.profile), gptLeafPath: m.gptLeafPath });
  }
}

const datasets = [...datasetSphere].map(([profile, sphere]) => {
  const own = mapping.filter((m) => m.profile === profile);
  // Only the categories under the dataset's OWN sphere: a cross-sphere item is named in
  // `crossSphere`, it does not widen the dataset's trade categories.
  const tradeCategories = [...new Set(own.filter((m) => m.sphere === sphere).map((m) => m.tradeCategory).filter(Boolean))].sort();
  return { profile, sphere, tradeCategories, products: own.length, crossSphere: own.filter((m) => m.crossSphere).length };
});

// --- output -------------------------------------------------------------------------------

const generated = {
  generatedBy: "apps/backend/scripts/catalog-taxonomy/build.mjs",
  source: SOURCE,
};

const files = {
  "trade-spheres.json": {
    schema: "upready.trade-spheres/v0",
    ...generated,
    rule: "Kept when a small direct-to-consumer shop of physical goods can run it on this storefront today; every dropped sphere names the missing feature.",
    optional: true,
    counts: { source: allSpheres.length, kept: spheres.length, dropped: dropped.length },
    spheres,
    dropped,
  },
  "trade-categories.json": {
    schema: "upready.trade-categories/v0",
    ...generated,
    rule: "Level 2 of the source under every kept sphere, minus the nodes that are not consumer retail of physical goods or are regulated; kept verbatim otherwise.",
    optional: true,
    counts: {
      sourceUnderKeptSpheres: categories.length + excluded.length,
      kept: categories.length,
      excluded: excluded.length,
    },
    categories,
    excluded,
  },
  "products-mapping.json": {
    schema: "upready.products-taxonomy-mapping/v0",
    ...generated,
    inventory: path.relative(REPO, INVENTORY_TSV),
    counts: { products: rows.length, covered: mapping.length, uncovered: uncovered.length, crossSphere: crossSphere.length },
    datasets,
    uncovered,
    crossSphere,
    products: mapping,
  },
};

const tsv = [
  ["profile", "handle", "category", "sphere", "tradeCategory", "gptLeafId", "gptLeafPath", "crossSphere"].join("\t"),
  ...mapping.map((m) => [m.profile, m.handle, m.category, m.sphere, m.tradeCategory ?? "", m.gptLeafId, m.gptLeafPath, m.crossSphere ? "yes" : ""].join("\t")),
].join("\n");

const check = process.argv.includes("--check");
let drift = 0;
const emit = (name, content) => {
  const file = path.join(SPECS, name);
  if (check) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current !== content) {
      drift += 1;
      console.error(`DRIFT ${path.relative(REPO, file)}`);
    }
    return;
  }
  fs.mkdirSync(SPECS, { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`wrote ${path.relative(REPO, file)}`);
};

for (const [name, doc] of Object.entries(files)) emit(name, `${JSON.stringify(doc, null, 2)}\n`);
emit("products-mapping.tsv", `${tsv}\n`);

console.log(
  `spheres ${spheres.length} kept / ${dropped.length} dropped; trade categories ${categories.length} kept / ${excluded.length} excluded; ` +
    `products ${mapping.length}/${rows.length} covered, ${uncovered.length} uncovered, ${crossSphere.length} cross-sphere`,
);
for (const u of uncovered) console.log(`  UNCOVERED ${u.profile}/${u.handle}: ${u.reason}`);
for (const c of crossSphere) console.log(`  cross-sphere ${c.profile}/${c.handle} -> ${c.gptLeafPath}`);
if (check && drift) process.exit(1);
