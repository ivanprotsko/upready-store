import fs from "node:fs";
import path from "node:path";
import { SEED_REGIONS } from "./regions";
import { PROFILES_DIR, readProfileJson, type StoreProfile, type StoreProfileRounding } from "./store-profile";
import { buildRatioTable, pricesFromUsd } from "../lib/prices";

/**
 * Abstract datasets — the starter catalog a shop WITHOUT a sphere of trade is seeded with
 * (specs/catalog-taxonomy/ABSTRACT-DATASETS.md, GLOSSARY.md §2). A dataset is an ordinary
 * store profile directory whose profile.json carries `dataset.kind = "abstract"`; today there
 * is exactly one, `profiles/abstract/`, with `themes = "any"`. A theme-specific set (backlog
 * t-2026-09-12-abstract-sets-per-theme) would list its themes and win the lookup for them.
 *
 * Everything here is pure: reading JSON off disk, deriving a per-tenant copy of the catalog
 * (handles and SKUs are unique across the whole database, so a tenant gets its own suffixed
 * copy) and pricing it in every seeded currency. The database work lives in
 * workflows/tenant/seed-tenant-dataset.
 */

export type DatasetBlock = {
  kind: "branded" | "abstract";
  themes: "any" | string[];
  tradeSphere: string | null;
  tradeCategories: string[];
};

export type AbstractDataset = {
  id: string;
  dir: string;
  profile: StoreProfile & { dataset: DatasetBlock };
};

type CategoryJson = { handle: string; name: string; children?: CategoryJson[] };
type CollectionJson = { handle: string; title: string; products: string[] };
type ProductJson = {
  handle: string;
  title: string;
  subtitle?: string;
  description: string;
  status: string;
  category: string;
  collections: string[];
  weight: number;
  metadata: Record<string, unknown>;
  images: string[];
  options: string[];
  variants: { title: string; sku: string; options: Record<string, string>; price_usd: number; inventory_quantity?: number }[];
};
type ProductOptionJson = { title: string; values: { value: string }[] };
type ProfileTile = { categoryHandle: string; label: string; image: string };

const isDatasetBlock = (value: unknown): value is DatasetBlock =>
  typeof value === "object" && value !== null && (value as DatasetBlock).kind === "abstract";

/** Every abstract dataset on disk, in directory order. */
export const listAbstractDatasets = (profilesDir: string = PROFILES_DIR): AbstractDataset[] => {
  if (!fs.existsSync(profilesDir)) return [];

  return fs
    .readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(profilesDir, entry.name, "profile.json")))
    .map((entry) => {
      const dir = path.join(profilesDir, entry.name);
      const profile = readProfileJson<StoreProfile>(dir, "profile.json");
      return { id: entry.name, dir, profile };
    })
    .filter((candidate): candidate is AbstractDataset => isDatasetBlock(candidate.profile.dataset));
};

/**
 * The dataset a tenant that picked `preset` is seeded with: a set that lists the preset wins,
 * otherwise the universal one. No dataset at all is a developer error carrying the directory
 * that was scanned (rule 20a: an empty shop must never come out of a silent miss).
 */
export const resolveAbstractDataset = (preset: string, profilesDir: string = PROFILES_DIR): AbstractDataset => {
  const datasets = listAbstractDatasets(profilesDir);
  const specific = datasets.find((d) => Array.isArray(d.profile.dataset.themes) && d.profile.dataset.themes.includes(preset));
  const universal = datasets.find((d) => d.profile.dataset.themes === "any");
  const chosen = specific ?? universal;

  if (!chosen) {
    throw new Error(
      `No abstract dataset serves preset "${preset}": ${datasets.length} abstract dataset(s) under ${profilesDir}` +
        (datasets.length ? ` (${datasets.map((d) => d.id).join(", ")}), none lists the preset and none is universal.` : ". Build one with scripts/abstract-datasets/build.mjs."),
    );
  }

  return chosen;
};

/**
 * Where `/static/store-profiles/<dataset>/<file>` is served from. `STORE_PROFILES_MEDIA_BASE_URL`
 * is what seed-mt-demo already reads; without it the parent of `STORE_MEDIA_BASE_URL` (which the
 * single-store seed points at ONE profile's directory) is the same tree one level up. Neither
 * set is a loud error, never a relative URL that 404s quietly on the storefront.
 */
export const resolveMediaBaseUrl = (env: NodeJS.ProcessEnv = process.env): string => {
  const explicit = (env.STORE_PROFILES_MEDIA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  const single = (env.STORE_MEDIA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (single && single.includes("/")) return single.slice(0, single.lastIndexOf("/"));

  throw new Error(
    "Neither STORE_PROFILES_MEDIA_BASE_URL nor STORE_MEDIA_BASE_URL is set, so the starter catalog's images have no URL. " +
      "Set STORE_PROFILES_MEDIA_BASE_URL to where /static/store-profiles is served, e.g. https://shipshift.dev/static/store-profiles.",
  );
};

export const mediaUrl = (base: string, datasetId: string, ref: string): string =>
  `${base}/${datasetId}/${ref.startsWith("media/") ? ref.slice("media/".length) : ref}`;

/** A tenant's copy of a handle: unique across the database, still readable in a URL. */
export const scopedHandle = (handle: string, tenantHandle: string): string => `${handle}-${tenantHandle}`;

const scopedSku = (sku: string, tenantHandle: string): string =>
  `${sku}-${tenantHandle.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;

export type SeedPlanCategory = {
  handle: string;
  sourceHandle: string;
  name: string;
  metadata: { image_url: string; image_alt: string; starter: true; dataset: string };
  children: SeedPlanCategory[];
};

export type SeedPlanProduct = {
  handle: string;
  sourceHandle: string;
  title: string;
  subtitle?: string;
  description: string;
  weight: number;
  metadata: Record<string, unknown>;
  images: string[];
  thumbnail: string;
  categorySourceHandle: string;
  collectionSourceHandle: string | null;
  options: { title: string; values: string[] }[];
  variants: {
    title: string;
    sku: string;
    options: Record<string, string>;
    prices: { currency_code: string; amount: number }[];
    manage_inventory: false;
  }[];
};

export type SeedPlan = {
  datasetId: string;
  tenantHandle: string;
  mediaBase: string;
  categories: SeedPlanCategory[];
  collections: { handle: string; sourceHandle: string; title: string }[];
  /**
   * The options the products choose from, in the dataset's own order. A product option is a
   * SHARED library row in Medusa 2.19 (`is_exclusive = false`, title unique across the
   * database): the seed joins the existing row and contributes its values, exactly as the
   * profile seed does (`lib/products.ts` `seedProductOptions`). Options created inline with a
   * product are exclusive to it, and the storefront groups its filters by option id — six
   * sized products then showed six "Size" selects on `/store` (measured 2026-09-12 on the
   * wizard's shop, task t-2026-09-12-seed-option-filter-duplicates).
   */
  sharedOptions: { title: string; values: string[] }[];
  products: SeedPlanProduct[];
  heroImageUrl: string | null;
};

// Medusa's own names for the option a single-variant product gets when it has
// none are "Default option"/"Default option value" — plain English, landing
// verbatim in the product's own data (this option's title/value), which is
// what a shop owner saw on her product card (f12-owner-raw-keys). This is the
// plan builder every tenant onboarding actually runs through, so it, and the
// storefront's placeholder-hiding filter it must stay in sync with
// (`storefront/lib/util/option-filter-groups.ts`), both use these values now.
const DEFAULT_OPTION_TITLE = "Опция по умолчанию";
const DEFAULT_OPTION_VALUE = "Значение по умолчанию";

/**
 * Turns a dataset into the exact rows one tenant receives. Pure and deterministic: the same
 * dataset and tenant handle give the same plan, which is what makes the seed idempotent by
 * inspection and testable without a database.
 */
export const buildSeedPlan = (dataset: AbstractDataset, { tenantHandle, mediaBase }: { tenantHandle: string; mediaBase: string }): SeedPlan => {
  const { dir, id, profile } = dataset;
  const categories = readProfileJson<CategoryJson[]>(dir, profile.catalog.files.categories);
  const products = readProfileJson<ProductJson[]>(dir, profile.catalog.files.products);
  const collections = readProfileJson<CollectionJson[]>(dir, profile.catalog.files.collections);
  const options = readProfileJson<ProductOptionJson[]>(dir, profile.catalog.files.productOptions);
  const tiles = ((profile.home as { categoryTiles?: ProfileTile[] } | undefined)?.categoryTiles ?? []) as ProfileTile[];
  const heroRef = (profile.home as { hero?: { image?: string } } | undefined)?.hero?.image ?? null;

  if (products.length === 0) {
    throw new Error(`Abstract dataset "${id}" lists no product (${path.join(dir, profile.catalog.files.products)}).`);
  }

  const optionValues = new Map(options.map((o) => [o.title, o.values.map((v) => v.value)]));
  const ratios = buildRatioTable(SEED_REGIONS);
  const rounding: StoreProfileRounding = profile.currency.rounding;
  const url = (ref: string) => mediaUrl(mediaBase, id, ref);

  // One image per category: the profile's own tile for a leaf, the first child's tile for a
  // root — never invented, always a file the manifest lists.
  const tileByLeaf = new Map(tiles.map((t) => [t.categoryHandle, t.image]));
  const productImageByLeaf = new Map<string, string>();
  for (const product of products) {
    if (product.images[0] && !productImageByLeaf.has(product.category)) productImageByLeaf.set(product.category, product.images[0]);
  }
  const imageFor = (handle: string, fallback?: string): string => {
    const ref = tileByLeaf.get(handle) ?? productImageByLeaf.get(handle) ?? fallback;
    if (!ref) throw new Error(`Abstract dataset "${id}": no image maps to category "${handle}".`);
    return url(ref);
  };

  const planCategory = (category: CategoryJson): SeedPlanCategory => {
    const children = (category.children ?? []).map(planCategory);
    const image = imageFor(category.handle, children[0]?.metadata.image_url);
    return {
      handle: scopedHandle(category.handle, tenantHandle),
      sourceHandle: category.handle,
      name: category.name,
      metadata: { image_url: image, image_alt: category.name, starter: true, dataset: id },
      children,
    };
  };

  const planCollections = collections.map((c) => ({ handle: scopedHandle(c.handle, tenantHandle), sourceHandle: c.handle, title: c.title }));

  const planProducts: SeedPlanProduct[] = products.map((product) => {
    const hasOptions = product.options.length > 0;
    return {
      handle: scopedHandle(product.handle, tenantHandle),
      sourceHandle: product.handle,
      title: product.title,
      ...(product.subtitle ? { subtitle: product.subtitle } : {}),
      description: product.description,
      weight: product.weight,
      metadata: { ...product.metadata, starter: true, dataset: id },
      images: product.images.map(url),
      thumbnail: url(product.images[0]),
      categorySourceHandle: product.category,
      collectionSourceHandle: product.collections[0] ?? null,
      options: hasOptions
        ? product.options.map((title) => {
            const values = optionValues.get(title);
            if (!values) throw new Error(`Abstract dataset "${id}": product "${product.handle}" uses option "${title}", which ${profile.catalog.files.productOptions} does not declare.`);
            return { title, values };
          })
        : [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }],
      variants: product.variants.map((variant) => ({
        title: variant.title,
        sku: scopedSku(variant.sku, tenantHandle),
        options: hasOptions ? variant.options : { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
        prices: pricesFromUsd(variant.price_usd, { regions: SEED_REGIONS, ratios, rounding }),
        manage_inventory: false as const,
      })),
    };
  });

  // Only options some product actually uses, so a declared-but-unused option never lands in
  // the shared library on a tenant's behalf.
  const usedOptionTitles = new Set(products.flatMap((product) => product.options));
  const sharedOptions = options
    .filter((option) => usedOptionTitles.has(option.title))
    .map((option) => ({ title: option.title, values: option.values.map((v) => v.value) }));

  return {
    datasetId: id,
    tenantHandle,
    mediaBase,
    categories: categories.map(planCategory),
    collections: planCollections,
    sharedOptions,
    products: planProducts,
    heroImageUrl: heroRef ? url(heroRef) : null,
  };
};
