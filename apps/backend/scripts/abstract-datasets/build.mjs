#!/usr/bin/env node
/**
 * Writes data/profiles/abstract/ from definitions.mjs — the ONE abstract dataset every shop
 * without a sphere of trade is seeded with (specs/catalog-taxonomy/ABSTRACT-DATASETS.md).
 *
 *   node scripts/abstract-datasets/build.mjs            # write profile.json, catalog/, i18n/, design/, theme.json
 *   node scripts/abstract-datasets/build.mjs --check    # exit 1 when the files on disk differ
 *
 * The existing store-profile format, nothing new: the output validates with
 * scripts/validate-store-profile.mjs against specs/store-profiles/*.schema.json. media/manifest.json
 * is NOT written here — render.mjs + slice.mjs produce it from real renders.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAMERA,
  DATASET,
  DATASET_ID,
  GRID_FRAME,
  MODES,
  NEGATIVE,
  OBJECTS,
  SIZES,
  STARTER_CLOSING,
  leavesOf,
  preambleFor,
  productsOf,
} from "./definitions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..", "..");
const REPO = path.resolve(BACKEND, "..", "..");
const OUT = path.join(BACKEND, "src", "migration-scripts", "data", "profiles", DATASET_ID);
const THEME_SRC = path.join(REPO, "specs", "design-system", "themes", `${DATASET.presetId}.theme.json`);

// The clock reading of the first build (2026-09-12 06:10 WITA), kept fixed on purpose: a
// rebuild that changes nothing must not churn the diff. Bump it when the CONTENT changes.
const GENERATED_AT = "2026-09-11T22:10:00.000Z";
const GENERATED_BY = "apps/backend/scripts/abstract-datasets/build.mjs from definitions.mjs";

const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const camel = (s) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : upper(w))).join("");
const priceFor = (base, index) => Math.round(base * [1, 1.25, 1.6][index]);

const DO_NOT_SHOW = [
  "real logos, brand marks or wordmarks of any kind",
  "legible text, letters or numbers anywhere in the frame",
  "any recognisable manufactured product: the object must stay a plain geometric form",
  "human faces, hands or bodies",
  "props, plinths, boxes, tissue paper, plants or foliage",
  "colour on the objects or on the backdrop",
  "wet, glossy or mirrored floor, reflections, a second shadow, a floating subject",
  "top-down flat lay, dutch angle or tilted horizon",
  "shallow depth of field, bokeh or motion blur",
];

// --- catalog ------------------------------------------------------------------------------

const leaves = leavesOf(DATASET);
const products = productsOf(DATASET);

const categories = DATASET.roots.map((root) => ({
  handle: root.handle,
  name: root.name.en,
  children: root.leaves.map((leaf) => ({ handle: leaf.handle, name: leaf.name.en })),
}));

const productOptions = [{ title: "Size", values: SIZES.map((s) => ({ value: s.value })) }];

const descriptionEn = (p) => {
  const size = p.sized
    ? `It comes in three sizes: small at about ${SIZES[0].cm} cm, medium at ${SIZES[1].cm} cm and large at ${SIZES[2].cm} cm across.`
    : `It comes in one size, about ${SIZES[1].cm} cm across.`;
  return (
    `${p.form} No. ${p.n} is ${p.subject}. ` +
    `Cast in ${DATASET.materialEn}, it is a plain form with no function beyond holding its shape and its shadow, which is what makes it a fair stand-in for a product you have not added yet. ` +
    `${size} ` +
    `Every piece in this catalog is photographed in the same light on the same neutral backdrop, so the storefront reads as one series in any theme. ` +
    STARTER_CLOSING.en
  );
};

const descriptionRu = (p) => {
  const size = p.sized
    ? `Три размера: маленький около ${SIZES[0].cm} см, средний ${SIZES[1].cm} см и большой ${SIZES[2].cm} см в поперечнике.`
    : `Один размер, около ${SIZES[1].cm} см в поперечнике.`;
  return (
    `${p.leaf.formRu} № ${p.n} — это ${p.subjectRu}. ` +
    `Отлит из материала «${DATASET.materialRu}»: простая форма без назначения, кроме как держать очертание и тень, — потому она честно замещает товар, который вы ещё не добавили. ` +
    `${size} ` +
    `Все предметы этого каталога сняты в одном свете на одном нейтральном фоне, поэтому витрина читается как одна серия в любой теме. ` +
    STARTER_CLOSING.ru
  );
};

const specsFor = (p) => ({
  Form: p.form,
  Material: upper(DATASET.materialEn),
  Finish: p.finish.en,
  Size: p.sized ? SIZES.map((s) => `${s.value} ${s.cm} cm`).join(", ") : `${SIZES[1].cm} cm`,
  Weight: p.sized ? SIZES.map((s, i) => `${s.value} ${DATASET.weights[i]} g`).join(", ") : `${DATASET.single} g`,
  Series: "Starter catalog, one light and one backdrop for every piece",
});

const catalogProducts = products.map((p) => {
  const mpnStem = `ABS-${p.handle.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
  return {
    handle: p.handle,
    title: p.title.en,
    subtitle: `${upper(DATASET.materialEn)}, starter catalog`,
    description: descriptionEn(p),
    status: "published",
    category: p.leaf.handle,
    collections: [p.n === 1 ? "new-arrivals" : "bestsellers"],
    weight: p.sized ? DATASET.weights[1] : DATASET.single,
    metadata: { brand: "Starter set", mpn: mpnStem, specs: specsFor(p) },
    images: [`media/${p.handle}-hero.webp`],
    options: p.sized ? ["Size"] : [],
    variants: p.sized
      ? SIZES.map((s, i) => ({
          title: s.value,
          sku: `${mpnStem}-${s.key.toUpperCase()}`,
          options: { Size: s.value },
          price_usd: priceFor(p.price, i),
          inventory_quantity: 25,
        }))
      : [{ title: "One size", sku: `${mpnStem}-ONE`, options: {}, price_usd: p.price, inventory_quantity: 25 }],
    imageBrief: {
      subject: `${upper(p.subject)}. ${upper(DATASET.materialEn)}, no colour, no markings.`,
      shots: [{ role: "hero", description: `Grid cell of the series: ${p.subject}, centred, three-quarter view, one soft contact shadow.` }],
      doNotShow: DO_NOT_SHOW,
    },
  };
});

const collections = [
  { handle: "new-arrivals", title: "New arrivals", products: products.filter((p) => p.n === 1).map((p) => p.handle) },
  { handle: "bestsellers", title: "Bestsellers", products: products.filter((p) => p.n === 2).map((p) => p.handle) },
];

const counts = {
  products: catalogProducts.length,
  variants: catalogProducts.reduce((n, p) => n + p.variants.length, 0),
  images: catalogProducts.reduce((n, p) => n + p.images.length, 0),
};

// --- profile ------------------------------------------------------------------------------

const profile = {
  schema: "upready.store-profile/v0",
  id: DATASET_ID,
  vertical: "starter catalog for a shop without a sphere of trade",
  audience: {
    region: "any",
    persona: "A shop owner who has just created the shop and has not added goods yet: the catalog must look finished in any theme and be obviously replaceable.",
  },
  brand: {
    name: "Starter set",
    tagline: "A neutral starter catalog that fits any theme, ready to be replaced",
    wordmark: { text: "STARTER", style: "wordmark" },
  },
  locale: { default: "en", catalogLocales: ["en", "ru"] },
  currency: { base: "usd", rounding: "round" },
  theme: {
    presetId: DATASET.presetId,
    file: "theme.json",
    defaultMode: DATASET.defaultMode,
    typography: DATASET.typography,
    radius: DATASET.radius,
  },
  layout: {
    cardVariant: "classic",
    imageTreatment: { aspect: "1:1", fit: "cover", radius: "md", hover: "none" },
  },
  home: {
    hero: {
      layout: "full-bleed",
      headline: "Your catalog starts here",
      subheadline: "A starter set of plain forms, photographed as one series. Replace it with your own goods from the panel.",
      cta: { label: "Browse the catalog", href: "/store" },
      image: "media/home-hero.webp",
    },
    categoryTiles: leaves.map((leaf) => ({
      categoryHandle: leaf.handle,
      label: leaf.name.en,
      image: `media/tile-${leaf.handle}.webp`,
    })),
    promoStrip: { enabled: false, text: "" },
  },
  catalog: {
    files: {
      categories: "catalog/categories.json",
      productOptions: "catalog/product-options.json",
      products: "catalog/products.json",
      collections: "catalog/collections.json",
    },
    counts,
  },
  media: { dir: "media", manifest: "media/manifest.json", baseUrlEnv: "STORE_MEDIA_BASE_URL" },
  design: { styleBoard: "design/style-board.md", canon: "~/upready/packages/geist-kit/AGENTS.md" },
  dataset: { kind: "abstract", themes: "any", tradeSphere: null, tradeCategories: [] },
  generatedAt: GENERATED_AT,
  generatedBy: GENERATED_BY,
};

// --- i18n ---------------------------------------------------------------------------------

const i18n = (locale) => {
  const t = (obj) => obj[locale];
  return {
    name: locale === "ru" ? "Русский" : "English",
    translations: {
      categories: Object.fromEntries([
        ...DATASET.roots.map((r) => [camel(r.handle), t(r.name)]),
        ...leaves.map((l) => [camel(l.handle), t(l.name)]),
      ]),
      collections: {
        newArrivals: locale === "ru" ? "Новинки" : "New arrivals",
        bestsellers: locale === "ru" ? "Хиты продаж" : "Bestsellers",
      },
      productOptions: {
        size: {
          title: locale === "ru" ? "Размер" : "Size",
          values: Object.fromEntries(SIZES.map((s) => [s.key, locale === "ru" ? s.ru : s.value])),
        },
      },
      products: Object.fromEntries(
        products.map((p) => [
          camel(p.handle),
          {
            title: t(p.title),
            description: locale === "ru" ? descriptionRu(p) : descriptionEn(p),
          },
        ]),
      ),
    },
  };
};

// --- style board --------------------------------------------------------------------------

const styleBoard = () => {
  const theme = JSON.parse(fs.readFileSync(THEME_SRC, "utf8"));
  const tok = (mode, key) => theme.modes?.[mode]?.[key] ?? theme.modes?.[mode]?.tokens?.[key] ?? "?";
  const cells = [
    ...products.map((p, i) => `| ${i + 1} | product \`${p.handle}\` | ${p.subject} |`),
    ...leaves.map((l, i) => `| ${products.length + i + 1} | tile \`${l.handle}\` | ${l.tile} |`),
    `| 16 | hero | ${DATASET.heroSubject} |`,
  ];
  return `# Style board — the abstract starter set \`${DATASET_ID}\`

Generated by \`${GENERATED_BY}\`; edit \`definitions.mjs\`, never this file.

## 1. What this set is

The ONE starter catalog every shop without a sphere of trade is seeded with, for ANY theme
(Ivan, 2026-09-12; \`specs/catalog-taxonomy/GLOSSARY.md\` §2). Ten products in five categories
under two roots, five category tiles and one hero, all of them ABSTRACT forms: ${DATASET.materialEn},
no colour, no markings, no recognisable product. The set argues with no palette because it has none.

Validated against preset \`${DATASET.presetId}\` (light \`${tok("light", "--background")}\` / dark \`${tok("dark", "--background")}\`)
because the schema needs one; a tenant's theme comes from its own home document.

## 2. The series — one setup for all sixteen frames

One 4x4 grid at 4K, sixteen 1024 px cells, one prediction. Same light, same backdrop, same
camera, same scale in every cell; the gate reads the backdrop tone of every cell and refuses a
spread wider than the threshold below.

- **Objects.** ${OBJECTS}
- **Camera.** ${CAMERA}
- **Light mode frame (rendered now).** Backdrop target \`${MODES.light.backdropHex}\`. ${MODES.light.light}
- **Dark mode twin (t-2026-09-12-mode-image-pairs, not rendered here).** Backdrop target \`${MODES.dark.backdropHex}\`. ${MODES.dark.light}
  Everything else in the prompt is identical, word for word: the twin differs ONLY in backdrop and light.

Aspect 1:1 for products and tiles (\`layout.imageTreatment.aspect\`), the hero is the cell-16
frame extended to 16:9 on its own backdrop tone (no second prediction).

## 3. The sixteen cells, reading order

| # | Role | Subject |
|---|---|---|
${cells.join("\n")}

## 4. Prompt — the light frame, as sent

\`\`\`text
${GRID_FRAME}

${preambleFor("light")}

The sixteen panels show sixteen different subjects, one per panel, listed row by row:
<Row r, column c: subject clause — one line per cell, from the table above>

Do not include: ${NEGATIVE}
\`\`\`

## 5. Series gate — what slice.mjs measures before a frame is accepted

1. Panel borders are FOUND by \`store-media/grid-measure.py\`, never assumed at quarters.
2. Backdrop luma of every cell (a 40 px patch at the top-left corner) lies within ±10 levels of
   the median across the sixteen cells; a cell outside is \`flagged\`, never silently shipped.
3. No cell is empty (foreground mask covers at least 8 percent of the cell) and no cell holds a
   seam residue line along its cut edge.
4. Human eyes (rule 18f): the contact sheet is looked at, and any cell showing a recognisable
   manufactured object, text or colour is flagged with the reason written in the manifest.

## 6. Copy rules

Titles are \`<Form> No. <n> · <finish>\`; descriptions are honest about being placeholders and end
with one sentence inviting the owner to replace the item. Russian is a translation of the same
facts (\`i18n/ru.json\`), never a second text.
`;
};

// --- write --------------------------------------------------------------------------------

const files = {
  "profile.json": `${JSON.stringify(profile, null, 2)}\n`,
  "catalog/categories.json": `${JSON.stringify(categories, null, 2)}\n`,
  "catalog/product-options.json": `${JSON.stringify(productOptions, null, 2)}\n`,
  "catalog/products.json": `${JSON.stringify(catalogProducts, null, 2)}\n`,
  "catalog/collections.json": `${JSON.stringify(collections, null, 2)}\n`,
  "i18n/en.json": `${JSON.stringify(i18n("en"), null, 2)}\n`,
  "i18n/ru.json": `${JSON.stringify(i18n("ru"), null, 2)}\n`,
  "design/style-board.md": styleBoard(),
  "theme.json": fs.readFileSync(THEME_SRC, "utf8"),
};

const check = process.argv.includes("--check");
let drift = 0;
for (const [rel, content] of Object.entries(files)) {
  const file = path.join(OUT, rel);
  if (check) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current !== content) {
      drift += 1;
      console.error(`DRIFT ${path.relative(REPO, file)}`);
    }
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`wrote ${path.relative(REPO, file)}`);
}
console.log(`${DATASET_ID}: ${counts.products} products, ${counts.variants} variants, ${counts.images} images, ${leaves.length} leaves, ${collections.length} collections`);
if (check && drift) process.exit(1);
