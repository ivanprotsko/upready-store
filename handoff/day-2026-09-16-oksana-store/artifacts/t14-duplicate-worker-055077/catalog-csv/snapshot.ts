/**
 * The catalogue as both directions of the spreadsheet see it: one flat object
 * read once from the graph, then used by the export to write the file and by
 * the planner to decide what a row would change.
 *
 * Reading it once is not an optimisation, it is the reason a dry run and the
 * confirm that follows can disagree out loud: both re-read this snapshot, so a
 * product somebody edited in the panel between the two shows up as a changed
 * plan instead of an overwrite nobody asked for.
 */

import { amountToNumber } from "./values";

export type SnapshotPrice = {
  id: string;
  currency_code: string;
  amount: number | null;
  /** > 0 means the price is scoped by a rule (a region, a customer group). */
  rules_count: number;
  /** Non-null means the price belongs to a price list, not to the product itself. */
  price_list_id: string | null;
};

export type SnapshotVariant = {
  id: string;
  title: string | null;
  sku: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  manage_inventory: boolean;
  prices: SnapshotPrice[];
  inventory_item_ids: string[];
  /** Stocked quantity summed over the variant's inventory levels, or null when inventory is not managed. */
  stock: number | null;
};

export type SnapshotProduct = {
  id: string;
  handle: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  status: string;
  thumbnail: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  image_urls: string[];
  category_ids: string[];
  variants: SnapshotVariant[];
};

export type SnapshotCategory = {
  id: string;
  name: string;
  parent_category_id: string | null;
};

export type CatalogSnapshot = {
  products: SnapshotProduct[];
  /** Every category the TENANT owns; a staff-made category is nobody's and is not in here. */
  categories: SnapshotCategory[];
  /** Currency codes the store has a region for. A price column naming anything else is refused. */
  store_currencies: string[];
  /** The shop's own currency: what a bare `price` column binds to and what the export defaults to. */
  default_currency: string | null;
  /** Where imported stock is stocked. Null when the tenant's channel has no warehouse. */
  stock_location_id: string | null;
};

/** The graph fields `snapshot.ts` needs. Kept next to the types it fills in. */
export const PRODUCT_SNAPSHOT_FIELDS = [
  "id",
  "handle",
  "title",
  "subtitle",
  "description",
  "status",
  "thumbnail",
  "weight",
  "length",
  "width",
  "height",
  "metadata",
  "images.url",
  "images.rank",
  "categories.id",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.weight",
  "variants.length",
  "variants.width",
  "variants.height",
  "variants.manage_inventory",
  "variants.price_set.prices.id",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.rules_count",
  "variants.price_set.prices.price_list_id",
  "variants.inventory_items.inventory_item_id",
];

type RawRow = Record<string, any>;

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Turns graph rows into the snapshot. `stockByItemId` comes from the inventory
 * module in a second read (levels are not reachable from the product graph in
 * one hop), and a variant with no entry there has `stock: null`, which the file
 * writes as an empty cell — "this shop does not count this item", not "zero
 * left" (rule 20a: a substituted value is worse than an absent one).
 */
export const buildSnapshotProducts = (
  rows: RawRow[],
  stockByItemId: Map<string, number>,
): SnapshotProduct[] =>
  rows
    .map((row): SnapshotProduct => {
      const images = [...(row.images ?? [])]
        .filter((image: RawRow | null) => Boolean(image?.url))
        .sort((a: RawRow, b: RawRow) => (a.rank ?? 0) - (b.rank ?? 0))
        .map((image: RawRow) => String(image.url));

      const variants = (row.variants ?? [])
        .filter((variant: RawRow | null) => Boolean(variant?.id))
        .map((variant: RawRow): SnapshotVariant => {
          const inventoryItemIds: string[] = (variant.inventory_items ?? [])
            .map((link: RawRow | null) => link?.inventory_item_id)
            .filter((id: unknown): id is string => typeof id === "string");

          const managed = variant.manage_inventory === true;
          const levels = inventoryItemIds
            .map((id) => stockByItemId.get(id))
            .filter((quantity): quantity is number => typeof quantity === "number");

          return {
            id: String(variant.id),
            title: variant.title ?? null,
            sku: variant.sku ?? null,
            weight: numberOrNull(variant.weight),
            length: numberOrNull(variant.length),
            width: numberOrNull(variant.width),
            height: numberOrNull(variant.height),
            manage_inventory: managed,
            inventory_item_ids: inventoryItemIds,
            stock: managed && levels.length > 0 ? levels.reduce((sum, value) => sum + value, 0) : null,
            prices: (variant.price_set?.prices ?? [])
              .filter((price: RawRow | null) => Boolean(price?.id && price?.currency_code))
              .map((price: RawRow): SnapshotPrice => ({
                id: String(price.id),
                currency_code: String(price.currency_code).toLowerCase(),
                amount: amountToNumber(price.amount),
                rules_count: Number(price.rules_count ?? 0),
                price_list_id: price.price_list_id ?? null,
              })),
          };
        })
        .sort((a: SnapshotVariant, b: SnapshotVariant) =>
          `${a.title ?? ""}${a.sku ?? ""}`.localeCompare(`${b.title ?? ""}${b.sku ?? ""}`, "ru"),
        );

      return {
        id: String(row.id),
        handle: row.handle ?? null,
        title: row.title ?? null,
        subtitle: row.subtitle ?? null,
        description: row.description ?? null,
        status: String(row.status ?? "draft"),
        thumbnail: row.thumbnail ?? null,
        weight: numberOrNull(row.weight),
        length: numberOrNull(row.length),
        width: numberOrNull(row.width),
        height: numberOrNull(row.height),
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        image_urls: images,
        category_ids: (row.categories ?? [])
          .map((category: RawRow | null) => category?.id)
          .filter((id: unknown): id is string => typeof id === "string"),
        variants,
      };
    })
    .sort((a, b) => (a.handle ?? "").localeCompare(b.handle ?? "", "ru"));

/**
 * The category path the file writes, root first («Добавки / АСД»). A cycle in
 * the parent chain (which the data model allows and nothing forbids) stops the
 * walk instead of hanging the export.
 */
export const categoryPath = (categories: SnapshotCategory[], categoryId: string): string[] => {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: string[] = [];
  const seen = new Set<string>();

  let current = byId.get(categoryId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parent_category_id ? byId.get(current.parent_category_id) : undefined;
  }

  return path;
};

/** The id of the category a path names, or null when one of its levels is missing. */
export const findCategoryByPath = (
  categories: SnapshotCategory[],
  path: string[],
): string | null => {
  const equal = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  let parentId: string | null = null;
  let found: SnapshotCategory | undefined;

  for (const level of path) {
    found = categories.find(
      (category) => equal(category.name, level) && (category.parent_category_id ?? null) === parentId,
    );

    if (!found) {
      return null;
    }

    parentId = found.id;
  }

  return found?.id ?? null;
};
