import categories from "./json/categories.json";
import collections from "./json/collections.json";
import productOptions from "./json/product-options.json";
import products from "./json/products.json";
import {
  getStoreProfile,
  readProfileJson,
  toMediaUrl,
  type StoreProfileContext,
} from "../store-profile";

export type SeedCategory = {
  handle: string;
  name: string;
  children?: SeedCategory[];
};

export type SeedProductOptionValue = {
  value: string;
  metadata?: Record<string, unknown>;
};

export type SeedProductOption = {
  title: string;
  values: SeedProductOptionValue[];
};

export type SeedProductVariant = {
  title: string;
  sku: string;
  options: Record<string, string>;
  /**
   * Profiles price a variant once, in USD; the regional amounts are derived at
   * seed time from the demo ratio table (see `lib/prices.ts`). The default seed
   * data has no such field and keeps its per-product regional prices.
   */
  price_usd?: number;
};

export type SeedProduct = {
  handle: string;
  title: string;
  subtitle?: string;
  description: string;
  status: string;
  category: string;
  weight: number;
  metadata?: Record<string, unknown>;
  images: string[];
  options: string[];
  variants: SeedProductVariant[];
};

export type SeedCollection = {
  handle: string;
  title: string;
  products: string[];
};

/** `catalog/products.json` of a profile: the seed shape plus the fields the
 * pilot adds (see `specs/store-profiles/catalog-products.schema.json`). */
type ProfileProduct = SeedProduct & {
  collections?: string[];
  imageBrief?: unknown;
  /** The dark version of the product's MAIN frame, `images[0]`
   *  (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). One pair per product. */
  imageDark?: string;
};

const toSeedProduct = (
  product: ProfileProduct,
  profile: StoreProfileContext,
): SeedProduct => {
  // `collections` and `imageBrief` are authoring data: collection membership is
  // seeded from catalog/collections.json, the brief is for the image producer.
  // `imageDark` is neither — it is the mode-image-pair axis, and it reaches the database
  // as `metadata.image_url_dark`, the key the storefront reads
  // (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). It is NOT appended to `images[]`: the
  // storefront draws every entry of that list as its own gallery slide, so the dark twin
  // would show up as an extra slide in light mode.
  const {
    collections: _collections,
    imageBrief: _imageBrief,
    imageDark,
    ...rest
  } = product;

  return {
    ...rest,
    images: product.images.map((ref) => toMediaUrl(ref, profile.mediaBaseUrl)),
    ...(imageDark
      ? {
          metadata: {
            ...(product.metadata ?? {}),
            image_url_dark: toMediaUrl(imageDark, profile.mediaBaseUrl),
          },
        }
      : {}),
  };
};

const loadProfileCatalog = (profile: StoreProfileContext) => {
  const files = profile.profile.catalog.files;

  return {
    categories: readProfileJson<SeedCategory[]>(profile.dir, files.categories),
    productOptions: readProfileJson<SeedProductOption[]>(
      profile.dir,
      files.productOptions,
    ),
    products: readProfileJson<ProfileProduct[]>(profile.dir, files.products).map(
      (product) => toSeedProduct(product, profile),
    ),
    collections: readProfileJson<SeedCollection[]>(profile.dir, files.collections),
  };
};

const profile = getStoreProfile();
const catalog = profile
  ? loadProfileCatalog(profile)
  : { categories, productOptions, products, collections };

export const SEED_CATEGORIES: SeedCategory[] = catalog.categories;
export const SEED_PRODUCT_OPTIONS: SeedProductOption[] = catalog.productOptions;
export const SEED_PRODUCTS: SeedProduct[] = catalog.products;
export const SEED_COLLECTIONS: SeedCollection[] = catalog.collections;
