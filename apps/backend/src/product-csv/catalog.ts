/**
 * The tenant's catalogue as a flat snapshot (t14-product-import): what the
 * export writes out and what the dry run compares an uploaded file against.
 *
 * One read, shared by both sides on purpose. An export whose numbers come from
 * one query and a dry run whose "unchanged" verdict comes from another is two
 * definitions of the same catalogue, and the round trip would be measuring the
 * difference between them rather than the file.
 */

import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * One row of a variant's price set, as the pricing module stores it.
 *
 * Every one of them has to be carried, not just the currency the file edits,
 * because `updatePriceSets` DELETES every unscoped price of the set whose id is
 * absent from an update (measured in `@medusajs/pricing`
 * `dist/services/pricing-module.js`, `updatePriceSets_`: `pricesToDelete` is
 * exactly `existingPrices` minus the incoming ids). A seeded stand prices a
 * variant in over a hundred currencies, so sending only the column the owner
 * edited would silently wipe the rest.
 *
 * `in_price_list` rows are the exception and are NOT carried: that same listing
 * filters on `price_list_id: null`, so a price belonging to a price list is
 * never a candidate for deletion.
 */
export type CatalogPrice = {
  id: string;
  currency_code: string;
  amount: number;
  /** A price narrowed by a rule (a region, a customer group). Never the export's number. */
  has_rules: boolean;
  in_price_list: boolean;
};

export type CatalogVariant = {
  id: string;
  sku: string | null;
  title: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  /** Currency code (lowercase) to amount, the unconditional price only. */
  prices: Record<string, number>;
  /** Every price row of the set, for an update that must not delete the others. */
  price_rows: CatalogPrice[];
  inventory_item_id: string | null;
  /** Stocked quantity at the shop's own location, `null` when not stock-managed. */
  stock: number | null;
  manage_inventory: boolean;
};

export type CatalogOption = {
  id: string;
  title: string;
  values: string[];
};

export type CatalogProduct = {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: string;
  category_id: string | null;
  category_path: string[] | null;
  image_urls: string[];
  metadata: Record<string, unknown>;
  options: CatalogOption[];
  variants: CatalogVariant[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  /** Names from the root down, e.g. `["Добавки", "АСД"]`. */
  path: string[];
};

export type CatalogSnapshot = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  /** Currency codes the export writes a column for, the shop's default first. */
  currencies: string[];
  /** Product metadata keys in use across the catalogue, sorted. */
  metadata_keys: string[];
  /** The shop's own warehouse, where a stock number is written. */
  stock_location_id: string | null;
};

const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "subtitle",
  "description",
  "status",
  "metadata",
  "images.url",
  "images.rank",
  "categories.id",
  "options.id",
  "options.title",
  "options.values.value",
  "variants.id",
  "variants.sku",
  "variants.title",
  "variants.weight",
  "variants.length",
  "variants.width",
  "variants.height",
  "variants.manage_inventory",
  "variants.created_at",
  "variants.inventory_items.inventory_item_id",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_list_id",
  "variants.price_set.prices.price_rules.attribute",
];

type GraphPrice = {
  id?: string | null;
  amount?: number | string | null;
  currency_code?: string | null;
  price_list_id?: string | null;
  price_rules?: { attribute?: string | null }[] | null;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The price a shopper sees with no region or customer group in play: the one
 * with no price rules on it. A variant priced per region carries several rows
 * for one currency, and picking any of them would make the export a guess.
 */
const readPrices = (
  prices: GraphPrice[] | null | undefined,
): { rows: CatalogPrice[]; byCurrency: Record<string, number> } => {
  const rows: CatalogPrice[] = [];
  const byCurrency: Record<string, number> = {};

  for (const price of prices ?? []) {
    const currency = price?.currency_code?.toLowerCase();
    const amount = asNumber(price?.amount);

    if (!price?.id || !currency || amount === null) {
      continue;
    }

    const row: CatalogPrice = {
      id: String(price.id),
      currency_code: currency,
      amount,
      has_rules: (price?.price_rules ?? []).length > 0,
      in_price_list: Boolean(price?.price_list_id),
    };

    rows.push(row);

    if (!row.has_rules && !row.in_price_list && byCurrency[currency] === undefined) {
      byCurrency[currency] = amount;
    }
  }

  return { rows, byCurrency };
};

/** Names from the root down for every category, resolved through `parent_id`. */
export const buildCategoryPaths = (
  rows: { id: string; name: string; parent_category_id: string | null }[],
): CatalogCategory[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return rows.map((row) => {
    const path: string[] = [];
    let current: (typeof rows)[number] | undefined = row;
    const guard = new Set<string>();

    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      path.unshift(current.name);
      current = current.parent_category_id ? byId.get(current.parent_category_id) : undefined;
    }

    return {
      id: row.id,
      name: row.name,
      parent_id: row.parent_category_id,
      path,
    };
  });
};

/**
 * The stock location the shop's own numbers belong to: the one linked to its
 * sales channel by `provisionTenantWarehouseWorkflow`. A shop whose warehouse
 * was never provisioned gets `null`, and a stock number in its file is then
 * reported as un-appliable rather than written to whichever location happens
 * to come first.
 */
const resolveStockLocation = async (
  container: MedusaContainer,
  salesChannelId: string | null,
): Promise<string | null> => {
  if (!salesChannelId) {
    return null;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "stock_locations.id"],
      filters: { id: [salesChannelId] },
    });

    const locations = (data[0]?.stock_locations ?? []) as { id?: string | null }[];

    return locations.find((location) => Boolean(location?.id))?.id ?? null;
  } catch {
    return null;
  }
};

export type LoadSnapshotInput = {
  container: MedusaContainer;
  /** The tenant's own product ids, from the tenant-product link. */
  productIds: string[];
  /** The tenant's own category ids, from the tenant-product-category link. */
  categoryIds: string[];
  salesChannelId: string | null;
  /** Currency the shop prices in by default, first column of the export. */
  defaultCurrency: string | null;
};

export const loadCatalogSnapshot = async ({
  container,
  productIds,
  categoryIds,
  salesChannelId,
  defaultCurrency,
}: LoadSnapshotInput): Promise<CatalogSnapshot> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const stockLocationId = await resolveStockLocation(container, salesChannelId);

  const categoryRows =
    categoryIds.length === 0
      ? []
      : (
          await query.graph({
            entity: "product_category",
            fields: ["id", "name", "parent_category_id"],
            filters: { id: categoryIds },
          })
        ).data.map((row) => ({
          id: row.id as string,
          name: (row.name as string) ?? "",
          parent_category_id: (row.parent_category_id as string | null) ?? null,
        }));

  const categories = buildCategoryPaths(categoryRows);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  if (productIds.length === 0) {
    return {
      products: [],
      categories,
      currencies: defaultCurrency ? [defaultCurrency] : [],
      metadata_keys: [],
      stock_location_id: stockLocationId,
    };
  }

  const { data: rows } = await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    filters: { id: productIds },
    pagination: { take: null } as never,
  });

  const products: CatalogProduct[] = rows.map((row) => {
    const images = ((row.images ?? []) as { url?: string | null; rank?: number | null }[])
      .slice()
      .sort((left, right) => (left?.rank ?? 0) - (right?.rank ?? 0))
      .map((image) => image?.url)
      .filter((url): url is string => Boolean(url));

    const ownCategory = ((row.categories ?? []) as { id?: string | null }[])
      .map((category) => category?.id)
      .find((id): id is string => Boolean(id) && categoryById.has(id as string));

    const variants: CatalogVariant[] = ((row.variants ?? []) as Record<string, unknown>[])
      .slice()
      .sort((left, right) =>
        String(left?.created_at ?? "").localeCompare(String(right?.created_at ?? "")),
      )
      .map((variant) => {
        const prices = readPrices(
          (variant.price_set as { prices?: GraphPrice[] } | null | undefined)?.prices ?? [],
        );

        return {
        id: variant.id as string,
        sku: ((variant.sku as string | null) ?? null) || null,
        title: ((variant.title as string | null) ?? null) || null,
        weight: asNumber(variant.weight),
        length: asNumber(variant.length),
        width: asNumber(variant.width),
        height: asNumber(variant.height),
        prices: prices.byCurrency,
        price_rows: prices.rows,
        inventory_item_id:
          ((variant.inventory_items ?? []) as { inventory_item_id?: string | null }[])
            .map((link) => link?.inventory_item_id)
            .find((id): id is string => Boolean(id)) ?? null,
        stock: null,
        manage_inventory: Boolean(variant.manage_inventory),
        };
      });

    return {
      id: row.id as string,
      handle: (row.handle as string) ?? "",
      title: (row.title as string) ?? "",
      subtitle: ((row.subtitle as string | null) ?? null) || null,
      description: ((row.description as string | null) ?? null) || null,
      status: (row.status as string) ?? "draft",
      category_id: ownCategory ?? null,
      category_path: ownCategory ? (categoryById.get(ownCategory)?.path ?? null) : null,
      image_urls: images,
      metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) || {},
      options: ((row.options ?? []) as Record<string, unknown>[]).map((option) => ({
        id: option.id as string,
        title: (option.title as string) ?? "",
        values: ((option.values ?? []) as { value?: string | null }[])
          .map((value) => value?.value)
          .filter((value): value is string => Boolean(value)),
      })),
      variants,
    };
  });

  await attachStock(container, products, stockLocationId);

  const currencies = collectCurrencies(products, defaultCurrency);
  const metadataKeys = collectMetadataKeys(products);

  return {
    products,
    categories,
    currencies,
    metadata_keys: metadataKeys,
    stock_location_id: stockLocationId,
  };
};

/**
 * Stocked quantity per variant, read from the inventory levels of the shop's
 * own location. A variant with `manage_inventory: false` keeps `null`, which
 * the export writes as an empty cell: the shop does not count that item, and
 * writing `0` would say the opposite (rule 20a).
 */
const attachStock = async (
  container: MedusaContainer,
  products: CatalogProduct[],
  stockLocationId: string | null,
): Promise<void> => {
  const itemIds = [
    ...new Set(
      products
        .flatMap((product) => product.variants)
        .map((variant) => variant.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (itemIds.length === 0) {
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id", "stocked_quantity"],
    filters: stockLocationId
      ? { inventory_item_id: itemIds, location_id: [stockLocationId] }
      : { inventory_item_id: itemIds },
    pagination: { take: null } as never,
  });

  const byItem = new Map<string, number>();

  for (const level of levels) {
    const itemId = level?.inventory_item_id as string | undefined;
    const quantity = asNumber(level?.stocked_quantity);

    if (!itemId || quantity === null) {
      continue;
    }

    byItem.set(itemId, (byItem.get(itemId) ?? 0) + quantity);
  }

  for (const product of products) {
    for (const variant of product.variants) {
      if (!variant.manage_inventory || !variant.inventory_item_id) {
        continue;
      }
      variant.stock = byItem.get(variant.inventory_item_id) ?? 0;
    }
  }
};

/**
 * The currency the export writes a price column for: the shop's OWN, and only
 * that one.
 *
 * Every currency the catalogue happens to hold would be the obvious
 * alternative and is the wrong answer: the seeded stands price a variant in 118
 * currencies (`select count(distinct currency_code) from price`), and a
 * spreadsheet with 118 price columns is not a spreadsheet a shop owner can
 * edit. The import still accepts a column for any currency the STORE prices in,
 * so an owner who sells in two can add the second column by hand, and the
 * currencies with no column are left exactly as they are.
 */
const collectCurrencies = (
  products: CatalogProduct[],
  defaultCurrency: string | null,
): string[] => {
  if (defaultCurrency) {
    return [defaultCurrency.toLowerCase()];
  }

  for (const product of products) {
    for (const variant of product.variants) {
      const [first] = Object.keys(variant.prices);
      if (first) {
        return [first];
      }
    }
  }

  return [];
};

const collectMetadataKeys = (products: CatalogProduct[]): string[] => {
  const seen = new Set<string>();

  for (const product of products) {
    for (const key of Object.keys(product.metadata ?? {})) {
      seen.add(key);
    }
  }

  return [...seen].sort();
};
