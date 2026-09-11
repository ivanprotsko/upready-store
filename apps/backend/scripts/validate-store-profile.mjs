#!/usr/bin/env node
/**
 * Validates one store profile against the schemas in specs/store-profiles/ and
 * the cross-checks those schemas cannot express.
 *
 *   node scripts/validate-store-profile.mjs <id> [--skip-media] [--dir <path>]
 *
 * --skip-media  validate the catalog before the renders exist (stage S3): the
 *               media manifest, the sha256 of the files on disk and the
 *               image -> manifest cross-check are skipped. Everything else,
 *               including "no absolute URL in an image field", still runs.
 * --dir         validate a profile directory outside data/profiles/ (fixtures).
 *
 * Exits non-zero on any failure and prints the counts it recomputed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(HERE, "..");
const REPO_ROOT = path.join(BACKEND_ROOT, "..", "..");
const SPECS = path.join(REPO_ROOT, "specs");
const PROFILES_DIR = path.join(
  BACKEND_ROOT,
  "src",
  "migration-scripts",
  "data",
  "profiles",
);

const failures = [];
const warnings = [];

const fail = (check, message) => failures.push({ check, message });
const warn = (check, message) => warnings.push({ check, message });

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const parseArgs = (argv) => {
  const args = { id: null, skipMedia: false, dir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-media") args.skipMedia = true;
    else if (arg === "--dir") args.dir = argv[++index];
    else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag "${arg}".`);
    } else if (!args.id) args.id = arg;
    else throw new Error(`Unexpected argument "${arg}".`);
  }
  if (!args.id) {
    throw new Error(
      "Usage: node scripts/validate-store-profile.mjs <id> [--skip-media] [--dir <path>]",
    );
  }
  return args;
};

/**
 * Ajv in strict mode. `multipleOfPrecision` is required because
 * catalog-products.schema.json prices with `multipleOf: 0.01`, and in binary
 * floating point 129.99 / 0.01 is 12998.999999999998 — without a tolerance every
 * legitimate .99 price would be rejected.
 */
const ajvOptions = { strict: true, allErrors: true, multipleOfPrecision: 2 };

const draft07 = addFormats(new Ajv(ajvOptions));
const draft2020 = addFormats(new Ajv2020(ajvOptions));

const compile = (ajv, schemaFile) => {
  const schema = readJson(schemaFile);
  return { validate: ajv.compile(schema), name: path.basename(schemaFile) };
};

const validateDocument = (compiled, data, label) => {
  if (compiled.validate(data)) return true;
  for (const error of compiled.validate.errors ?? []) {
    fail(
      `schema:${compiled.name}`,
      `${label}${error.instancePath || ""} ${error.message}${
        error.params && Object.keys(error.params).length
          ? ` (${JSON.stringify(error.params)})`
          : ""
      }`,
    );
  }
  return false;
};

const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const IMAGE_KEYS = new Set(["image", "imageDark", "images", "file", "thumbnail"]);
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** Walks a document and reports any absolute URL sitting in an image field. */
const scanForAbsoluteImageUrls = (value, label, keyPath = "", key = "") => {
  if (typeof value === "string") {
    if (IMAGE_KEYS.has(key) && ABSOLUTE.test(value)) {
      fail(
        "no-http-in-image-fields",
        `${label}${keyPath} is "${value}". Profile media is re-hosted by us; image fields carry "media/<file>" only.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForAbsoluteImageUrls(item, label, `${keyPath}[${index}]`, key),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      scanForAbsoluteImageUrls(
        childValue,
        label,
        `${keyPath}.${childKey}`,
        childKey,
      );
    }
  }
};

const leafHandles = (categories) => {
  const leaves = new Set();
  const all = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      all.add(node.handle);
      if (node.children?.length) walk(node.children);
      else leaves.add(node.handle);
    }
  };
  walk(categories);
  return { leaves, all };
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const profileDir = args.dir
    ? path.resolve(args.dir)
    : path.join(PROFILES_DIR, args.id);

  if (!fs.existsSync(profileDir)) {
    console.error(`Store profile "${args.id}" not found at ${profileDir}`);
    process.exit(2);
  }

  const profileSchema = compile(
    draft07,
    path.join(SPECS, "store-profiles", "store-profile.schema.json"),
  );
  const productsSchema = compile(
    draft07,
    path.join(SPECS, "store-profiles", "catalog-products.schema.json"),
  );
  const manifestSchema = compile(
    draft07,
    path.join(SPECS, "store-profiles", "media-manifest.schema.json"),
  );
  const themeSchema = compile(
    draft2020,
    path.join(SPECS, "design-system", "theme-preset.schema.json"),
  );

  const required = ["profile.json"];
  for (const file of required) {
    if (!fs.existsSync(path.join(profileDir, file))) {
      console.error(`Store profile "${args.id}" is missing ${file}`);
      process.exit(2);
    }
  }

  const profile = readJson(path.join(profileDir, "profile.json"));
  validateDocument(profileSchema, profile, "profile.json");

  if (profile.id !== args.id) {
    fail(
      "id-matches-directory",
      `profile.json declares id "${profile.id}" but the profile is validated as "${args.id}".`,
    );
  }

  const catalogFiles = profile.catalog?.files ?? {
    categories: "catalog/categories.json",
    productOptions: "catalog/product-options.json",
    products: "catalog/products.json",
    collections: "catalog/collections.json",
  };

  const readCatalog = (key) => {
    const file = path.join(profileDir, catalogFiles[key]);
    if (!fs.existsSync(file)) {
      fail("catalog-files-exist", `${catalogFiles[key]} does not exist.`);
      return null;
    }
    return readJson(file);
  };

  const categories = readCatalog("categories");
  const productOptions = readCatalog("productOptions");
  const products = readCatalog("products");
  const collections = readCatalog("collections");

  if (products) {
    validateDocument(productsSchema, products, catalogFiles.products);
    scanForAbsoluteImageUrls(products, catalogFiles.products);
  }
  scanForAbsoluteImageUrls(profile, "profile.json");

  const themeFile = path.join(profileDir, profile.theme?.file ?? "theme.json");
  if (fs.existsSync(themeFile)) {
    const theme = readJson(themeFile);
    validateDocument(themeSchema, theme, path.basename(themeFile));
    if (profile.theme?.presetId && theme.id !== profile.theme.presetId) {
      fail(
        "theme-preset-id",
        `theme.json id "${theme.id}" does not equal profile.theme.presetId "${profile.theme.presetId}".`,
      );
    }
  } else {
    fail("theme-file-exists", `${path.relative(profileDir, themeFile)} does not exist.`);
  }

  // --- cross-checks over the catalog ------------------------------------
  const counts = { products: 0, variants: 0, images: 0, uniqueImages: 0 };
  const referencedImages = new Set();

  if (categories && products) {
    const { leaves, all } = leafHandles(categories);
    for (const product of products) {
      if (!all.has(product.category)) {
        fail(
          "category-exists",
          `product "${product.handle}" references category "${product.category}", which is not in ${catalogFiles.categories}.`,
        );
      } else if (!leaves.has(product.category)) {
        fail(
          "category-is-leaf",
          `product "${product.handle}" is filed under "${product.category}", which has children. Products must sit on a leaf category.`,
        );
      }
    }
  }

  if (productOptions && products) {
    const valuesByTitle = new Map(
      productOptions.map((option) => [
        option.title,
        new Set(option.values.map((value) => value.value)),
      ]),
    );

    for (const product of products) {
      for (const title of product.options ?? []) {
        if (!valuesByTitle.has(title)) {
          fail(
            "option-title-exists",
            `product "${product.handle}" uses option "${title}", which is not in ${catalogFiles.productOptions}.`,
          );
        }
      }

      for (const variant of product.variants ?? []) {
        const used = Object.keys(variant.options ?? {});
        for (const title of used) {
          if (!(product.options ?? []).includes(title)) {
            fail(
              "variant-option-declared",
              `variant "${variant.sku}" of "${product.handle}" sets option "${title}", which the product does not declare.`,
            );
            continue;
          }
          const value = variant.options[title];
          if (!valuesByTitle.get(title)?.has(value)) {
            fail(
              "variant-option-value-exists",
              `variant "${variant.sku}" of "${product.handle}" sets ${title}="${value}", which is not a value of that option.`,
            );
          }
        }
        for (const title of product.options ?? []) {
          if (!used.includes(title)) {
            fail(
              "variant-option-complete",
              `variant "${variant.sku}" of "${product.handle}" does not set option "${title}".`,
            );
          }
        }
      }
    }
  }

  if (collections && products) {
    const collectionHandles = new Set(
      collections.map((collection) => collection.handle),
    );
    const productHandles = new Set(products.map((product) => product.handle));

    for (const collection of collections) {
      for (const handle of collection.products ?? []) {
        if (!productHandles.has(handle)) {
          fail(
            "collection-product-exists",
            `collection "${collection.handle}" lists product "${handle}", which is not in ${catalogFiles.products}.`,
          );
        }
      }
    }

    for (const product of products) {
      for (const handle of product.collections ?? []) {
        if (!collectionHandles.has(handle)) {
          fail(
            "product-collection-exists",
            `product "${product.handle}" references collection "${handle}", which is not in ${catalogFiles.collections}.`,
          );
        } else {
          const members =
            collections.find((collection) => collection.handle === handle)
              ?.products ?? [];
          if (!members.includes(product.handle)) {
            // Not one of the README's cross-checks: the seed reads membership
            // from collections.json, so an asymmetry is a data smell, not a
            // broken seed.
            warn(
              "collection-membership-symmetric",
              `product "${product.handle}" claims collection "${handle}" but ${catalogFiles.collections} does not list it.`,
            );
          }
        }
      }
    }
  }

  if (products) {
    counts.products = products.length;
    for (const product of products) {
      counts.variants += product.variants?.length ?? 0;
      counts.images += product.images?.length ?? 0;
      for (const image of product.images ?? []) referencedImages.add(image);
      // The dark twin of the main frame is checked by the same rules as the light one:
      // a pair half of which points at nothing is worse than no pair
      // (`specs/store-profiles/MODE-IMAGE-PAIRS.md`).
      if (product.imageDark) referencedImages.add(product.imageDark);

      const skus = new Set();
      for (const variant of product.variants ?? []) {
        if (skus.has(variant.sku)) {
          fail("unique-sku", `duplicate SKU "${variant.sku}" in "${product.handle}".`);
        }
        skus.add(variant.sku);
      }
    }
    counts.uniqueImages = referencedImages.size;

    const declared = profile.catalog?.counts;
    if (declared) {
      for (const key of ["products", "variants", "images"]) {
        if (declared[key] !== counts[key]) {
          fail(
            "catalog-counts",
            `profile.json catalog.counts.${key} = ${declared[key]}, recount = ${counts[key]}${
              key === "images"
                ? ` (unique files: ${counts.uniqueImages})`
                : ""
            }.`,
          );
        }
      }
    }
  }

  if (profile.home?.hero?.image) referencedImages.add(profile.home.hero.image);
  if (profile.home?.hero?.imageDark) referencedImages.add(profile.home.hero.imageDark);
  for (const tile of profile.home?.categoryTiles ?? []) {
    if (tile.image) referencedImages.add(tile.image);
    if (tile.imageDark) referencedImages.add(tile.imageDark);
  }

  // --- media ------------------------------------------------------------
  const manifestPath = path.join(
    profileDir,
    profile.media?.manifest ?? "media/manifest.json",
  );
  const media = {
    entries: 0,
    accepted: 0,
    flagged: 0,
    rejected: 0,
    filesChecked: 0,
    skipped: args.skipMedia,
  };

  if (!args.skipMedia) {
    if (!fs.existsSync(manifestPath)) {
      fail(
        "manifest-exists",
        `${path.relative(profileDir, manifestPath)} does not exist. Use --skip-media to validate the catalog before the renders exist.`,
      );
    } else {
      const manifest = readJson(manifestPath);
      validateDocument(manifestSchema, manifest, path.basename(manifestPath));

      if (manifest.profileId !== profile.id) {
        fail(
          "manifest-profile-id",
          `manifest profileId "${manifest.profileId}" does not equal profile id "${profile.id}".`,
        );
      }

      const byFile = new Map();
      for (const entry of manifest.entries ?? []) {
        media.entries += 1;
        media[entry.status] = (media[entry.status] ?? 0) + 1;
        if (byFile.has(entry.file)) {
          fail("manifest-unique-file", `manifest lists "${entry.file}" twice.`);
        }
        byFile.set(entry.file, entry);

        const onDisk = path.join(profileDir, entry.file);
        if (!fs.existsSync(onDisk)) {
          fail("manifest-file-on-disk", `manifest entry "${entry.file}" has no file on disk.`);
          continue;
        }
        media.filesChecked += 1;
        const digest = sha256(onDisk);
        if (digest !== entry.sha256) {
          fail(
            "manifest-sha256",
            `"${entry.file}" hashes to ${digest}, manifest records ${entry.sha256}.`,
          );
        }
        const bytes = fs.statSync(onDisk).size;
        if (entry.bytes !== bytes) {
          warn(
            "manifest-bytes",
            `"${entry.file}" is ${bytes} bytes, manifest records ${entry.bytes}.`,
          );
        }
      }

      for (const image of referencedImages) {
        const entry = byFile.get(image);
        if (!entry) {
          fail(
            "image-in-manifest",
            `"${image}" is referenced by the catalog but has no manifest entry.`,
          );
        } else if (entry.status !== "accepted" && entry.status !== "flagged") {
          fail(
            "image-accepted",
            `"${image}" is referenced by the catalog but its manifest status is "${entry.status}".`,
          );
        }
      }

      const totals = manifest.totals ?? {};
      if (totals.renders !== undefined && totals.renders !== media.entries) {
        warn(
          "manifest-totals",
          `totals.renders = ${totals.renders}, entries = ${media.entries}.`,
        );
      }
    }
  }

  // --- report -----------------------------------------------------------
  console.log(`store profile: ${profile.id ?? args.id}`);
  console.log(`directory:     ${profileDir}`);
  console.log("recounted from the catalog files:");
  console.log(`  products      ${counts.products}`);
  console.log(`  variants      ${counts.variants}`);
  console.log(`  image refs    ${counts.images} (unique files: ${counts.uniqueImages})`);
  console.log(
    `  declared      products ${profile.catalog?.counts?.products ?? "-"}, variants ${
      profile.catalog?.counts?.variants ?? "-"
    }, images ${profile.catalog?.counts?.images ?? "-"}`,
  );
  console.log(
    args.skipMedia
      ? "media:         skipped (--skip-media)"
      : `media:         ${media.entries} manifest entries (${media.accepted} accepted, ${media.flagged} flagged, ${media.rejected} rejected), ${media.filesChecked} files hashed`,
  );
  console.log(
    `images referenced by catalog and home: ${referencedImages.size}`,
  );

  for (const { check, message } of warnings) {
    console.log(`WARN  [${check}] ${message}`);
  }
  for (const { check, message } of failures) {
    console.error(`FAIL  [${check}] ${message}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\nOK — every check passed${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`,
  );
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
