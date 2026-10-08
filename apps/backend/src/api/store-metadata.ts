import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * Which keys of `metadata` the Store API hands out on a product, a variant, a
 * picture, a category and a collection (t-2026-10-08-13, risks 14 and 15).
 *
 * The owner's tools keep their working notes in `metadata`. A product and its
 * variants carry the price list with a price in dollars, marketplace ids and
 * links and review marks. A picture carries the address it was imported from. A
 * category carries the service number of its source (`source_id`). The
 * storefront cuts most of that before it draws a page
 * (`apps/storefront/src/lib/util/product-metadata.ts` and `migration-metadata.ts`),
 * and a page is not the only reader. The Store API answered with the whole
 * `metadata` to anybody holding the shop's publishable key, and that key stands
 * in the code of every page.
 *
 * These are allow lists, so a key somebody writes tomorrow stays on the server
 * until a line here names its reader. Each list holds the keys a consumer of the
 * Store API reads, and the storefront is the only one that reads any. The shop
 * bot reads the catalog through the query engine, not through this API.
 * `scripts/local-shop-from-live.mjs` copies whatever a product's `metadata`
 * holds in the answer, so a local copy of a shop carries these keys and no
 * others.
 *
 * The cut is on the answer and nowhere else. The database keeps every key, so
 * the redirect table and the import read them as before. `/admin` and `/tenants`
 * are not behind it, so the platform panel and the shop panel see `metadata`
 * whole.
 *
 * A key added to the storefront's own lists has to be added here too, or the
 * storefront receives nothing under it and no error says why.
 * `__tests__/store-metadata.unit.spec.ts` compares the two files.
 */
export type StoreMetadataCarrier = "product" | "variant" | "image" | "category" | "collection";

export const STORE_METADATA_KEYS: Readonly<Record<StoreMetadataCarrier, readonly string[]>> = {
  product: [
    // A course or another digital product. `lib/data/olavka-home.ts`,
    // `modules/products/components/product-actions`, `lib/util/shipping-address.ts`,
    // `lib/cart-store/draft.ts`.
    "digital",
    // The sections of a course page. `lib/util/course-page.ts`, `lib/data/olavka-home.ts`.
    "course_page",
    // The cover of a course. `lib/util/course-page.ts`, `lib/data/olavka-home.ts`.
    "cover",
    // The owner's title and description per language. `lib/util/tenant-seo.ts`.
    "seo",
    // The product's `ld+json`. `lib/util/json-ld.ts`.
    "condition",
    "brand",
    "mpn",
    // The ratio of the first picture. `modules/products/components/image-gallery/items.ts`
    // documents it and the storefront's own list keeps it.
    "aspect_ratio",
  ],
  // No reader. A variant's pictures come from its `images`.
  variant: [],
  // No reader. A picture is drawn from its `url` and ordered by its `rank`.
  image: [],
  category: [
    // The category's own picture. `lib/util/category-image.ts`.
    "image_url",
    "image_alt",
    // The owner's title and description per language. `lib/util/tenant-seo.ts`.
    "seo",
  ],
  // No reader.
  collection: [],
};

const ALLOWED: Readonly<Record<StoreMetadataCarrier, ReadonlySet<string>>> = {
  product: new Set(STORE_METADATA_KEYS.product),
  variant: new Set(STORE_METADATA_KEYS.variant),
  image: new Set(STORE_METADATA_KEYS.image),
  category: new Set(STORE_METADATA_KEYS.category),
  collection: new Set(STORE_METADATA_KEYS.collection),
};

/**
 * The id prefixes of the product module (`@medusajs/product` 2.19.0, `dist/models`).
 * The underscore is part of the prefix. An option's id starts with `prodopt_`,
 * and an option is not a product.
 */
const CARRIER_BY_ID_PREFIX: ReadonlyArray<[prefix: string, carrier: StoreMetadataCarrier]> = [
  ["prod_", "product"],
  ["variant_", "variant"],
  ["img_", "image"],
  ["pcat_", "category"],
  ["pcol_", "collection"],
];

/**
 * The keys an answer keeps one of the five under. They cover an answer whose
 * `fields` list left the id out. A product of a category and of a cart line,
 * the variant of a cart line and of an order line, the pictures of a product
 * and of a variant, a category's children and its parent all stand under one
 * of these names.
 */
const CARRIER_BY_KEY: ReadonlyMap<string, StoreMetadataCarrier> = new Map([
  ["product", "product"],
  ["products", "product"],
  ["variant", "variant"],
  ["variants", "variant"],
  ["images", "image"],
  ["product_category", "category"],
  ["product_categories", "category"],
  ["categories", "category"],
  ["category_children", "category"],
  ["parent_category", "category"],
  ["collection", "collection"],
  ["collections", "collection"],
]);

const carrierOfId = (id: unknown): StoreMetadataCarrier | null =>
  typeof id === "string" ? (CARRIER_BY_ID_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null) : null;

/**
 * One `metadata` cut to a list. `null` and an absent value stay as they are. A
 * value that is not a keyed object has no key to check, so it does not pass.
 */
const cutMetadata = (metadata: unknown, allowed: ReadonlySet<string>): unknown => {
  if (metadata === null || metadata === undefined) {
    return metadata;
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const source = metadata as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.every((key) => allowed.has(key))) {
    return metadata;
  }

  const clean: Record<string, unknown> = {};
  for (const key of keys) {
    if (allowed.has(key)) {
      clean[key] = source[key];
    }
  }
  return clean;
};

const walk = (value: unknown, under: StoreMetadataCarrier | null, ancestors: Set<object>): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  // What the serialiser will write for this value. A date and a price amount
  // answer with a string or a number and are left to it.
  const withToJson = value as { toJSON?: () => unknown };
  const written = typeof withToJson.toJSON === "function" ? withToJson.toJSON() : value;
  if (typeof written !== "object" || written === null) {
    return value;
  }

  // A cycle is the serialiser's error to raise, the way it did before this file.
  if (ancestors.has(written)) {
    return value;
  }
  ancestors.add(written);

  try {
    if (Array.isArray(written)) {
      let next: unknown[] | null = null;
      written.forEach((item, index) => {
        const cleaned = walk(item, under, ancestors);
        if (cleaned !== item) {
          next ??= [...written];
          next[index] = cleaned;
        }
      });
      return next ?? value;
    }

    const record = written as Record<string, unknown>;
    const carrier = under ?? carrierOfId(record.id);
    let next: Record<string, unknown> | null = null;

    for (const [key, child] of Object.entries(record)) {
      // `metadata` is cut on one of the five and is never walked into. What an
      // allowed key holds is the reader's own document.
      const cleaned =
        key === "metadata"
          ? carrier
            ? cutMetadata(child, ALLOWED[carrier])
            : child
          : walk(child, CARRIER_BY_KEY.get(key) ?? null, ancestors);
      if (cleaned !== child) {
        next ??= { ...record };
        next[key] = cleaned;
      }
    }
    return next ?? value;
  } finally {
    ancestors.delete(written);
  }
};

/**
 * The cut over a whole answer, at every depth. One of the five is an object
 * with an id of the product module, and whatever stands under one of the keys
 * above.
 *
 * Nothing else loses a key. A cart, an order and their lines, a buyer, a
 * delivery method, a payment and an option value keep their `metadata`, because
 * the storefront reads them for its own functions. An answer with nothing to
 * cut is returned as it came, by identity.
 */
export function allowStoreMetadata<T>(body: T): T {
  return walk(body, null, new Set()) as T;
}

/**
 * Registered on `/store/*` next to the field guard, so one line covers Medusa's
 * own Store routes and every route this repository adds under `/store`. Every
 * one of them answers through `res.json`. It wraps `res.json` the way
 * `attachOrderAccessToken` does, because the alternative is a call in each
 * route, and the route somebody adds tomorrow would not make it.
 */
export function allowStoreMetadataOnAnswer(_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const original = res.json.bind(res);

  (res as { json: (body: unknown) => MedusaResponse }).json = (body: unknown) =>
    original(allowStoreMetadata(body) as never);

  next();
}
