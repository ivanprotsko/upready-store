import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readPrices, type CatalogPrice, type GraphPrice } from "../../product-csv/catalog";

/**
 * The sections, their options and counters, and the live catalog every section
 * reads before it writes.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

export const SECTIONS = ["titles", "prices", "characteristics", "reviews", "images"] as const;
export type Section = (typeof SECTIONS)[number];

export type ApplyOptions = {
  dryRun: boolean;
  sections: Set<Section>;
  logger: Pick<Logger, "info" | "warn" | "error">;
};

export type SectionCounters = {
  titles_updated: number;
  titles_unchanged: number;
  titles_absent: number;
  prices_updated: number;
  prices_unchanged: number;
  prices_absent: number;
  characteristics_written: number;
  characteristics_unchanged: number;
  attributes_created: number;
  characteristics_dropped: number;
  reviews_imported: number;
  reviews_unchanged: number;
  images_added: number;
  images_already_there: number;
  images_failed: number;
};

export const emptyCounters = (): SectionCounters => ({
  titles_updated: 0,
  titles_unchanged: 0,
  titles_absent: 0,
  prices_updated: 0,
  prices_unchanged: 0,
  prices_absent: 0,
  characteristics_written: 0,
  characteristics_unchanged: 0,
  attributes_created: 0,
  characteristics_dropped: 0,
  reviews_imported: 0,
  reviews_unchanged: 0,
  images_added: 0,
  images_already_there: 0,
  images_failed: 0,
});

/** One product of the shop as every section below needs it. */
export type LiveProduct = {
  id: string;
  handle: string;
  title: string;
  thumbnail: string | null;
  metadata: Record<string, unknown> | null;
  images: { id: string; url: string; rank: number | null; metadata: Record<string, unknown> | null }[];
  variants: {
    id: string;
    sku: string | null;
    price_rows: CatalogPrice[];
  }[];
};

const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "thumbnail",
  "metadata",
  "images.id",
  "images.url",
  "images.rank",
  "images.metadata",
  "variants.id",
  "variants.sku",
  "variants.created_at",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_list_id",
  "variants.price_set.prices.price_rules.attribute",
];

/**
 * The shop's products, keyed by handle.
 *
 * Reads the products the tenant link names and nothing else: a run must not be
 * able to touch a neighbour's catalog even when the dataset it was given
 * mentions one (rule 5k, and the same isolation `backfill-product-attributes`
 * keeps).
 */
export const loadLiveProducts = async (
  container: MedusaContainer,
  productIds: string[],
): Promise<Map<string, LiveProduct>> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  if (!productIds.length) {
    return new Map();
  }

  const { data: rows } = await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    filters: { id: productIds },
    pagination: { take: null } as never,
  });

  const out = new Map<string, LiveProduct>();

  for (const row of rows) {
    const images = ((row.images ?? []) as Record<string, unknown>[])
      .map((image) => ({
        id: String(image.id),
        url: String(image.url ?? ""),
        rank: typeof image.rank === "number" ? image.rank : null,
        metadata: (image.metadata as Record<string, unknown> | null) ?? null,
      }))
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));

    const variants = ((row.variants ?? []) as Record<string, unknown>[])
      .slice()
      .sort((left, right) =>
        String(left?.created_at ?? "").localeCompare(String(right?.created_at ?? "")),
      )
      .map((variant) => ({
        id: String(variant.id),
        sku: ((variant.sku as string | null) ?? null) || null,
        price_rows: readPrices(
          (variant.price_set as { prices?: GraphPrice[] } | null | undefined)?.prices ?? [],
        ).rows,
      }));

    out.set(String(row.handle), {
      id: String(row.id),
      handle: String(row.handle),
      title: String(row.title ?? ""),
      thumbnail: (row.thumbnail as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      images,
      variants,
    });
  }

  return out;
};

/** The ids of the products the tenant link ties to this shop, and no others. */
export const tenantProductIds = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<string[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id"],
    filters: { id: tenantId },
  });

  return ((data[0]?.products ?? []) as ({ id?: string | null } | null)[])
    .map((product) => product?.id ?? null)
    .filter((id): id is string => Boolean(id));
};
