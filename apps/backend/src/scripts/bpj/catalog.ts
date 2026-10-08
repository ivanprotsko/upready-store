import { MedusaError } from "@medusajs/framework/utils";
import {
  DEFAULT_OPTION_TITLE,
  DEFAULT_OPTION_VALUE,
  scopedHandle,
  scopedSku,
  type SeedPlan,
  type SeedPlanCategory,
  type SeedPlanProduct,
} from "../../migration-scripts/data/abstract-datasets";
import { firstFreeSlug, toSlug } from "../../product-csv/slugify";

/**
 * Beauty Pro Japan, stage B1 (t-2026-10-06-09): the shop's catalog file, scraped off its
 * Tilda site (291 products), turned into the `SeedPlan` that `seedTenantDatasetWorkflow`
 * writes. Pure: the same file and options give the same plan, and nothing here reads a
 * database or the network.
 *
 * What the store lead decided on 08.10.2026 (answer-f2-bpj-b1-2320-20261008.md):
 * - one root category `brands-<shop>` with a category per brand inside, and every product
 *   filed under its own brand. The Tilda sections of the Russian site are the brand pages
 *   themselves, so they make no tree of their own;
 * - a variant costs its own yen times the rate, the product's `price_jpy` is the fallback;
 *   both yen amounts stay in `metadata`;
 * - a product without `price_jpy` goes in as a draft.
 *
 * Pictures keep their Tilda addresses. Moving them to our storage is stage B2.
 */

/** One option value set of a Tilda product, plus the option columns (`Объем`, `Цвет`…). */
export type BpjEdition = {
  uid: number;
  externalid?: string;
  sku: string;
  price: string | null;
  priceold: string | null;
  quantity: string | null;
  img: string | null;
  [option: string]: unknown;
};

export type BpjSourceProduct = {
  source: string;
  uid_ru: number | null;
  uid_en: number | null;
  title_ru: string;
  title_en: string;
  text_ru: string;
  text_en: string;
  price_jpy: string | null;
  priceold_jpy: string | null;
  sku: string;
  /** A JSON string: `[{ "img": "https://static.tildacdn.one/…" }, …]`. */
  gallery: string;
  editions: BpjEdition[];
  characteristics: { title: string; value: string }[];
  storeparts_ru: string[];
  storeparts_en: string[];
  brand: string;
};

export type BpjConvertOptions = {
  tenantHandle: string;
  /** ISO 4217, lower case: `rub`, `usd`. */
  currency: string;
  /** How much of `currency` one yen buys. */
  rateFromJpy: number;
  /** The step a price is rounded to: 0.01 by default, 1 or 10 for whole roubles. */
  roundTo?: number;
};

export type BpjPlanCounts = {
  categories: number;
  brands: number;
  products: number;
  published: number;
  drafts: number;
  variants: number;
  pricedVariants: number;
  /** Editions a product could not tell apart by any option value; the first one is kept. */
  droppedEditions: number;
  images: number;
  productsWithoutImages: number;
  sharedOptions: number;
  translations: number;
};

export type BpjTranslation = { handle: string; title?: string; description?: string };

export type BpjImportPlan = {
  format: "bpj-import-plan@1";
  currency: string;
  rateFromJpy: number;
  roundTo: number;
  seed: SeedPlan;
  /** English texts, written after the products exist (`upsertTranslationFields`, locale `en`). */
  translations: { locale: "en"; products: BpjTranslation[] };
  /** Tilda uids of the products whose indistinguishable editions were cut to the first one. */
  droppedEditionsOf: number[];
  counts: BpjPlanCounts;
};

export const BPJ_DATASET = "beautypro-japan";
export const BRANDS_SOURCE_HANDLE = "brands";
const BRANDS_NAME = "Бренды";
const TRANSLATION_LOCALE = "en" as const;

/** The columns of an edition that are not a product option. */
const EDITION_FIELDS = new Set(["uid", "externalid", "sku", "price", "priceold", "quantity", "img"]);

/** `"1 936.00"`, `"3500.0000"` → 1936, 3500; empty, null, zero or garbage → null. */
export const parseYen = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const amount = Number(String(value).replace(/\s/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** Yen into the shop's currency, rounded to `roundTo` and then to cents against float noise. */
export const priceFromYen = (yen: number, rateFromJpy: number, roundTo = 0.01): number => {
  const rounded = Math.round((yen * rateFromJpy) / roundTo) * roundTo;
  return Math.round(rounded * 100) / 100;
};

const galleryOf = (product: BpjSourceProduct): string[] => {
  if (!product.gallery) return [];
  const parsed = JSON.parse(product.gallery) as { img?: string }[];
  return parsed.map((entry) => entry.img ?? "").filter(Boolean);
};

const optionColumnsOf = (edition: BpjEdition): string[] => Object.keys(edition).filter((key) => !EDITION_FIELDS.has(key));

const optionValue = (edition: BpjEdition, title: string): string => String(edition[title] ?? "").trim();

const tildaUidOf = (product: BpjSourceProduct): number => {
  const uid = product.uid_ru ?? product.uid_en;
  if (uid === null) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: product "${product.title_ru || product.title_en}" carries neither uid_ru nor uid_en.`);
  return uid;
};

const assertOptions = ({ tenantHandle, currency, rateFromJpy, roundTo }: BpjConvertOptions): void => {
  if (!/^[a-z0-9-]+$/.test(tenantHandle)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: shop handle "${tenantHandle}" is not a lower-case URL handle.`);
  if (!/^[a-z]{3}$/.test(currency)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: currency "${currency}" is not a lower-case ISO 4217 code such as rub or usd.`);
  if (!(Number.isFinite(rateFromJpy) && rateFromJpy > 0)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: the rate from yen must be a positive number, got ${rateFromJpy}.`);
  if (roundTo !== undefined && !(Number.isFinite(roundTo) && roundTo > 0)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: the rounding step must be a positive number, got ${roundTo}.`);
};

/**
 * The editions a product keeps: every edition with a set of option values of its own. Two
 * editions with the same values (empty ones included) cannot become two variants, Medusa
 * refuses a second variant with the same options, so the first one stays.
 */
const distinctEditions = (product: BpjSourceProduct, optionTitles: string[]): { kept: BpjEdition[]; dropped: number } => {
  const seen = new Set<string>();
  const kept: BpjEdition[] = [];
  for (const edition of product.editions) {
    const key = JSON.stringify(optionTitles.map((title) => optionValue(edition, title)));
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(edition);
  }
  return { kept, dropped: product.editions.length - kept.length };
};

/** Every number the reports and `dry-run` print, read off the plan itself. */
export const countBpjPlan = (plan: Pick<BpjImportPlan, "seed" | "translations">, droppedEditions = 0): BpjPlanCounts => {
  const { seed } = plan;
  const leaves = seed.categories.flatMap((root) => root.children);
  const brandsRoot = seed.categories.find((root) => root.sourceHandle === BRANDS_SOURCE_HANDLE);
  const variants = seed.products.flatMap((product) => product.variants);
  return {
    categories: seed.categories.length + leaves.length,
    brands: brandsRoot?.children.length ?? 0,
    products: seed.products.length,
    published: seed.products.filter((product) => (product.status ?? "published") === "published").length,
    drafts: seed.products.filter((product) => product.status === "draft").length,
    variants: variants.length,
    pricedVariants: variants.filter((variant) => variant.prices.length > 0).length,
    droppedEditions,
    images: new Set(seed.products.flatMap((product) => product.images)).size,
    productsWithoutImages: seed.products.filter((product) => product.images.length === 0).length,
    sharedOptions: seed.sharedOptions.length,
    translations: plan.translations.products.length,
  };
};

/** The counts as the converter and the import print them: numbers only. */
export const formatCounts = (counts: BpjPlanCounts): string[] => [
  `categories ${counts.categories} (brands ${counts.brands})`,
  `products ${counts.products}: published ${counts.published}, drafts ${counts.drafts}`,
  `variants ${counts.variants}: priced ${counts.pricedVariants}, editions dropped as indistinguishable ${counts.droppedEditions}`,
  `images ${counts.images}, products without an image ${counts.productsWithoutImages}`,
  `shared options ${counts.sharedOptions}, english translations ${counts.translations}`,
];

/** The catalog file → the plan one shop is seeded with. */
export const convertBpjCatalog = (catalog: BpjSourceProduct[], options: BpjConvertOptions): BpjImportPlan => {
  assertOptions(options);
  const { tenantHandle, currency, rateFromJpy } = options;
  const roundTo = options.roundTo ?? 0.01;

  if (!catalog.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BPJ catalog: the file lists no product.");

  // Brands, the busiest first: the order the owner sees them in until she reorders them.
  const productsByBrand = new Map<string, BpjSourceProduct[]>();
  for (const product of catalog) {
    const brand = product.brand.trim();
    if (!brand) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: product ${tildaUidOf(product)} has no brand, and every product is filed under its brand.`);
    productsByBrand.set(brand, [...(productsByBrand.get(brand) ?? []), product]);
  }
  const brands = [...productsByBrand.keys()].sort(
    (a, b) => (productsByBrand.get(b)?.length ?? 0) - (productsByBrand.get(a)?.length ?? 0) || a.localeCompare(b),
  );
  const brandSource = new Map(brands.map((brand) => [brand, toSlug(brand) || `brand-${brands.indexOf(brand) + 1}`]));

  const takenHandles = new Set<string>();
  const sharedValues = new Map<string, string[]>();
  const translations: BpjTranslation[] = [];
  const droppedEditionsOf: number[] = [];
  let droppedEditions = 0;

  const products: SeedPlanProduct[] = catalog.map((product) => {
    const uid = tildaUidOf(product);
    const title = (product.title_ru || product.title_en).trim();
    if (!title) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: product ${uid} has no title in either language.`);

    const sourceHandle = firstFreeSlug(toSlug(product.title_en || product.title_ru) || `product-${uid}`, takenHandles);
    takenHandles.add(sourceHandle);
    const handle = scopedHandle(sourceHandle, tenantHandle);

    const optionTitles = [...new Set(product.editions.flatMap(optionColumnsOf))];
    const { kept, dropped } = distinctEditions(product, optionTitles);
    if (dropped) {
      droppedEditions += dropped;
      droppedEditionsOf.push(uid);
    }
    // An option whose every kept value is empty names nothing: the variant stays the default one.
    const namedTitles = optionTitles.filter((optionTitle) => kept.some((edition) => optionValue(edition, optionTitle)));

    const productYen = parseYen(product.price_jpy);
    const images = [...new Set([...galleryOf(product), ...kept.map((edition) => edition.img ?? "").filter(Boolean)])];

    const options = namedTitles.length
      ? namedTitles.map((optionTitle) => {
          const values = [...new Set(kept.map((edition) => optionValue(edition, optionTitle)).filter(Boolean))];
          const library = sharedValues.get(optionTitle) ?? [];
          sharedValues.set(optionTitle, [...library, ...values.filter((value) => !library.includes(value))]);
          return { title: optionTitle, values };
        })
      : [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }];

    const variants = (namedTitles.length ? kept : kept.slice(0, 1)).map((edition) => {
      const variantOptions: Record<string, string> = namedTitles.length
        ? Object.fromEntries(namedTitles.map((optionTitle) => [optionTitle, optionValue(edition, optionTitle)]))
        : { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE };
      const yen = parseYen(edition.price) ?? productYen;
      return {
        title: namedTitles.length ? namedTitles.map((optionTitle) => variantOptions[optionTitle]).join(" / ") : title,
        sku: scopedSku(`BPJ-${edition.uid}`, tenantHandle),
        options: variantOptions,
        prices: yen === null ? [] : [{ currency_code: currency, amount: priceFromYen(yen, rateFromJpy, roundTo) }],
        manage_inventory: false as const,
        metadata: { price_jpy: yen, tilda_uid: edition.uid },
      };
    });

    // A value Tilda left empty on one edition while another edition of the product has one:
    // the variant would carry an empty option, which Medusa refuses. No guess, the run stops.
    for (const [index, variant] of variants.entries()) {
      for (const optionTitle of namedTitles) {
        if (variant.options[optionTitle]) continue;
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: product ${uid}, edition ${index + 1} has no value for "${optionTitle}" while another edition has one.`);
      }
    }

    const titleEn = product.title_en.trim();
    const textEn = product.text_en.trim();
    if (product.title_ru.trim() && (titleEn || textEn)) {
      translations.push({ handle, ...(titleEn ? { title: titleEn } : {}), ...(textEn ? { description: textEn } : {}) });
    }

    const characteristics = product.characteristics.filter((entry) => entry.title && entry.value);

    return {
      handle,
      sourceHandle,
      title,
      description: (product.text_ru || product.text_en).trim(),
      status: productYen === null ? ("draft" as const) : ("published" as const),
      metadata: {
        brand: product.brand.trim(),
        price_jpy: productYen,
        tilda_uid: uid,
        source_site: product.source,
        dataset: BPJ_DATASET,
        ...(characteristics.length ? { characteristics } : {}),
      },
      images,
      ...(images[0] ? { thumbnail: images[0] } : {}),
      categorySourceHandle: brandSource.get(product.brand.trim()) as string,
      collectionSourceHandle: null,
      options,
      variants,
    };
  });

  // A category's picture is the first picture of its first product that has one, never
  // invented: a brand with no picture at all stops the run.
  const imageOfBrand = (brand: string): string => {
    const image = products.find((product) => product.metadata.brand === brand && product.images[0])?.images[0];
    if (!image) throw new MedusaError(MedusaError.Types.INVALID_DATA, `BPJ catalog: no product of brand "${brand}" has a picture, so its category has none.`);
    return image;
  };

  const brandLeaves: SeedPlanCategory[] = brands.map((brand) => {
    const sourceHandle = brandSource.get(brand) as string;
    return {
      handle: scopedHandle(sourceHandle, tenantHandle),
      sourceHandle,
      name: brand,
      metadata: { image_url: imageOfBrand(brand), image_alt: brand, dataset: BPJ_DATASET },
      children: [],
    };
  });
  const brandsRoot: SeedPlanCategory = {
    handle: scopedHandle(BRANDS_SOURCE_HANDLE, tenantHandle),
    sourceHandle: BRANDS_SOURCE_HANDLE,
    name: BRANDS_NAME,
    metadata: { image_url: brandLeaves[0].metadata.image_url, image_alt: BRANDS_NAME, dataset: BPJ_DATASET },
    children: brandLeaves,
  };

  const seed: SeedPlan = {
    datasetId: BPJ_DATASET,
    tenantHandle,
    mediaBase: "",
    categories: [brandsRoot],
    collections: [],
    sharedOptions: [...sharedValues].map(([title, values]) => ({ title, values })),
    products,
    heroImageUrl: null,
  };
  const translationBlock = { locale: TRANSLATION_LOCALE, products: translations };

  return {
    format: "bpj-import-plan@1",
    currency,
    rateFromJpy,
    roundTo,
    seed,
    translations: translationBlock,
    droppedEditionsOf,
    counts: countBpjPlan({ seed, translations: translationBlock }, droppedEditions),
  };
};
