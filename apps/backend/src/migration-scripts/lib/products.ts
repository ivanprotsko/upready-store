import type { MedusaContainer } from "@medusajs/framework";
import { Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  batchLinkProductsToCollectionWorkflow,
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  SEED_CATEGORIES,
  SEED_COLLECTIONS,
  SEED_PRODUCTS,
  SEED_PRODUCT_OPTIONS,
} from "../data/products";
import { getShippingProfile } from "./fulfillment";
import { getVariantPrices } from "./prices";
import { getProductPrices } from "./regions";
import { getSalesChannel } from "./store";
import { getQuery } from "./utils";

const PRODUCT_STATUSES: Record<string, ProductStatus> = {
  draft: ProductStatus.DRAFT,
  proposed: ProductStatus.PROPOSED,
  published: ProductStatus.PUBLISHED,
  rejected: ProductStatus.REJECTED,
};

const productStatus = (status: string) => {
  const productStatus = PRODUCT_STATUSES[status];
  if (!productStatus) throw new Error(`Unknown product status "${status}".`);
  return productStatus;
};

export const getCategoryIdsByHandle = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });
  return new Map(data.map((category) => [category.handle, category.id]));
};

export const getProductIdsByHandle = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  return new Map(data.map((product) => [product.handle, product.id]));
};

export const getProductOptionIdsByTitle = async (
  container: MedusaContainer,
) => {
  const { data } = await getQuery(container).graph({
    entity: "product_option",
    fields: ["id", "title", "is_exclusive"],
  });
  // Only the shared library rows are addressable by title: `is_exclusive`
  // options are private to one product and their titles repeat (every
  // single-variant product carries its own "Default option"), so keying a Map
  // by title over all of them silently keeps whichever row came last.
  return new Map(
    data
      .filter((option) => option.is_exclusive === false)
      .map((option) => [option.title, option.id]),
  );
};

/**
 * Find-or-create by handle, at both levels. A handle is unique across the
 * database, so a resumed run (`resolveSeedMode`) that re-creates a category
 * its crashed predecessor already committed dies on the constraint and takes
 * the rest of the profile with it.
 */
export const seedCategories = async (container: MedusaContainer) => {
  const existingIdByHandle = await getCategoryIdsByHandle(container);

  const missingParents = SEED_CATEGORIES.filter(
    (category) => !existingIdByHandle.has(category.handle),
  );

  const parentIdByHandle = new Map(existingIdByHandle);

  if (missingParents.length) {
    const { result: created } = await createProductCategoriesWorkflow(
      container,
    ).run({
      input: {
        product_categories: missingParents.map((category) => ({
          name: category.name,
          handle: category.handle,
          is_active: true,
        })),
      },
    });

    for (const category of created) {
      parentIdByHandle.set(category.handle, category.id);
    }
  }

  const childCategories = SEED_CATEGORIES.flatMap((category) =>
    (category.children ?? [])
      .filter((child) => !parentIdByHandle.has(child.handle))
      .map((child) => ({
        name: child.name,
        handle: child.handle,
        is_active: true,
        parent_category_id: parentIdByHandle.get(category.handle),
      })),
  );

  if (!childCategories.length) return;

  await createProductCategoriesWorkflow(container).run({
    input: { product_categories: childCategories },
  });
};

/**
 * A product option is a SHARED library row in 2.19.0: `is_exclusive = false`
 * makes its title globally unique (index `IDX_product_option_global_title_unique`)
 * and many products — many tenants — hang off the same row. So a profile does
 * not own its options: the second profile that also sells a "Colour" has to
 * JOIN the existing option and contribute its own values, not create a second
 * one.
 *
 * Creating unconditionally is what the first multi-profile run actually hit:
 * `Product option with title: Colour, already exists` aborted the home-goods
 * seed after its sales channel, key and six categories were already committed
 * (measured 2026-09-11 on the shipshift.dev deployment, sneakers then
 * home-goods). The seed is not transactional, so a throw here leaves half a
 * profile behind.
 */
export const seedProductOptions = async (container: MedusaContainer) => {
  if (!SEED_PRODUCT_OPTIONS.length) return;

  const productModuleService = container.resolve(Modules.PRODUCT);

  const shared = (
    await productModuleService.listProductOptions({}, { relations: ["values"] })
  ).filter((option) => option.is_exclusive === false);
  const sharedByTitle = new Map(shared.map((option) => [option.title, option]));

  const missing = SEED_PRODUCT_OPTIONS.filter(
    (option) => !sharedByTitle.has(option.title),
  );

  if (missing.length) {
    await createProductOptionsWorkflow(container).run({
      input: {
        product_options: missing.map((option) => ({
          title: option.title,
          values: option.values.map((optionValue) => optionValue.value),
        })),
      },
    });
  }

  for (const option of SEED_PRODUCT_OPTIONS) {
    const existing = sharedByTitle.get(option.title);
    if (!existing) continue;

    const have = (existing.values ?? []).map((optionValue) => optionValue.value);
    const seen = new Set(have);
    const added = option.values
      .map((optionValue) => optionValue.value)
      .filter((value) => !seen.has(value));

    if (!added.length) continue;

    // The UNION, never this profile's own list: `updateProductOptions` replaces
    // the value set, and dropping a value another profile's variants already
    // use is either refused by the module or orphans those variants.
    await productModuleService.updateProductOptions(existing.id, {
      values: [...have, ...added],
    });
  }
};

// Medusa's own names for the option a single-variant product gets when it has
// none are "Default option"/"Default option value" — plain English, and they
// land verbatim in the product's own data (this option's title/value), not
// just a UI label, so they show up on the owner's product card forever
// (f12-owner-raw-keys). Match the tenant-panel's own values for the same
// synthetic option (`product-create/constants.ts`) rather than inventing a
// second Russian phrasing for one concept.
const DEFAULT_OPTION_TITLE = "Опция по умолчанию";
const DEFAULT_OPTION_VALUE = "Значение по умолчанию";

export const seedProducts = async (container: MedusaContainer) => {
  const shippingProfile = await getShippingProfile(container);
  const salesChannel = await getSalesChannel(container);
  const categoryIdsByHandle = await getCategoryIdsByHandle(container);
  const optionIdsByTitle = await getProductOptionIdsByTitle(container);

  // A product handle is unique across the database, so a resumed run
  // (`resolveSeedMode`) must create only what is still missing.
  const existingIdByHandle = await getProductIdsByHandle(container);
  const pending = SEED_PRODUCTS.filter(
    (product) => !existingIdByHandle.has(product.handle),
  );

  if (!pending.length) return;

  await createProductsWorkflow(container).run({
    input: {
      products: pending.map((product) => {
        const categoryId = categoryIdsByHandle.get(product.category);
        if (!categoryId) {
          throw new Error(
            `Unknown category "${product.category}" for product "${product.handle}".`,
          );
        }

        // A product with no options is a legitimate catalog shape — a care kit has
        // nothing to choose — but Medusa rejects it ("Product options are not
        // provided for: …"). Its own admin answers this with a single default
        // option, so the seed does the same rather than inventing a variation.
        const hasOptions = product.options.length > 0;

        return {
          title: product.title,
          handle: product.handle,
          // Only profiles carry a subtitle; spreading keeps the default seed's
          // workflow input byte-for-byte what it was.
          ...(product.subtitle ? { subtitle: product.subtitle } : {}),
          description: product.description,
          status: productStatus(product.status),
          weight: product.weight,
          metadata: product.metadata,
          category_ids: [categoryId],
          shipping_profile_id: shippingProfile.id,
          images: product.images.map((url) => ({ url })),
          options: hasOptions
            ? product.options.map((title) => {
                const optionId = optionIdsByTitle.get(title);
                if (!optionId) {
                  throw new Error(
                    `Unknown product option "${title}" for product "${product.handle}".`,
                  );
                }
                return { id: optionId };
              })
            : [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }],
          variants: product.variants.map((variant) => ({
            title: variant.title,
            sku: variant.sku,
            options: hasOptions
              ? variant.options
              : { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
            // A profile prices each variant once in USD and the regional
            // amounts are derived; the demo data prices a product per region.
            prices:
              variant.price_usd === undefined
                ? getProductPrices(product.handle)
                : getVariantPrices(variant.price_usd),
          })),
          sales_channels: [{ id: salesChannel.id }],
        };
      }),
    },
  });
};

/**
 * Keyed by option title AND value, because a bare value name is not unique
 * across the library: "Chalk" is a value of the sneakers profile's `Colourway`
 * (#E8E4DC) and of the electronics profile's `Colour` (#E6E7E9). Matching on
 * the value alone repainted one option's swatch with another option's hex the
 * moment a second profile was seeded.
 */
export const seedProductOptionMetadata = async (container: MedusaContainer) => {
  const productModuleService = container.resolve(Modules.PRODUCT);

  const key = (title: string, value: string) => `${title}\u0000${value}`;

  const metadataByTitleAndValue = new Map(
    SEED_PRODUCT_OPTIONS.flatMap((option) =>
      option.values
        .filter((optionValue) => optionValue.metadata)
        .map(
          (optionValue) =>
            [key(option.title, optionValue.value), optionValue.metadata!] as const,
        ),
    ),
  );

  const options = await productModuleService.listProductOptions(
    {},
    { relations: ["values"] },
  );

  const updates = options.flatMap((option) =>
    (option.values ?? []).flatMap((optionValue) => {
      const metadata = metadataByTitleAndValue.get(
        key(option.title, optionValue.value),
      );
      return metadata ? [{ optionValue, metadata }] : [];
    }),
  );

  await Promise.all(
    updates.map(({ optionValue, metadata }) =>
      productModuleService.updateProductOptionValues(optionValue.id, {
        metadata: { ...(optionValue.metadata ?? {}), ...metadata },
      }),
    ),
  );
};

export const seedCollections = async (container: MedusaContainer) => {
  // Find-or-create by handle, like the categories: a handle is unique, so a
  // resumed run that re-creates its predecessor's collection dies on the
  // constraint. The product links below are re-applied either way — the batch
  // link is a set operation and adding a product already in the collection is
  // not an error.
  const { data: existing } = await getQuery(container).graph({
    entity: "product_collection",
    fields: ["id", "handle"],
    filters: { handle: SEED_COLLECTIONS.map((collection) => collection.handle) },
  });

  const missing = SEED_COLLECTIONS.filter(
    (collection) =>
      !existing.some((candidate) => candidate.handle === collection.handle),
  );

  const created = missing.length
    ? (
        await createCollectionsWorkflow(container).run({
          input: {
            collections: missing.map((collection) => ({
              title: collection.title,
              handle: collection.handle,
            })),
          },
        })
      ).result
    : [];

  const collections = [...existing, ...created];

  const productIdsByHandle = await getProductIdsByHandle(container);

  for (const collection of collections) {
    const seedCollection = SEED_COLLECTIONS.find(
      (candidate) => candidate.handle === collection.handle,
    );
    if (!seedCollection) continue;

    await batchLinkProductsToCollectionWorkflow(container).run({
      input: {
        id: collection.id,
        add: seedCollection.products.map((handle) => {
          const productId = productIdsByHandle.get(handle);
          if (!productId) {
            throw new Error(
              `Unknown product "${handle}" in collection "${collection.handle}".`,
            );
          }
          return productId;
        }),
      },
    });
  }
};
