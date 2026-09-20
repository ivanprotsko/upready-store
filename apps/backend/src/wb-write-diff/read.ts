import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACE_LINK_MODULE } from "../modules/marketplace-link";
import type MarketplaceLinkModuleService from "../modules/marketplace-link/service";
import { WB_MODULE } from "../modules/wb";
import type WbModuleService from "../modules/wb/service";
import type {
  LinkRow,
  MirrorCard,
  MirrorPrice,
  MirrorStock,
  StoreVariant,
  WarehouseMapping,
} from "./types";

/**
 * Everything the diff reads, and nothing it writes (w21-wb-write-stocks-prices).
 *
 * Kept apart from `diff.ts` so the rules can be tested on fixtures without a
 * database, and apart from the route so the `wb:push` script and the panel
 * read exactly the same rows.
 *
 * Every read is scoped by `tenant_id` or by the tenant's own product ids. A
 * run must not be able to see a neighbour's catalog even when it is handed an
 * id that names one (rule 5k).
 */

/** The key the WB seller warehouse id is kept under on a stock location. */
export const WB_WAREHOUSE_METADATA_KEY = "wb_warehouse_id";

const PRODUCT_FIELDS = [
  "id",
  "title",
  "variants.id",
  "variants.sku",
  "variants.created_at",
  "variants.manage_inventory",
  "variants.inventory_items.inventory_item_id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_list_id",
  "variants.price_set.prices.price_rules.attribute",
];

const asNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The product ids the tenant link names. */
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

/**
 * The shop's own stock locations and the WB warehouse each was mapped to.
 *
 * The locations come from the tenant's sales channel, the same way
 * `reprovision-tenant-warehouses` gives each tenant its own: a location no
 * channel of this tenant reaches is not this shop's stock and never enters the
 * diff.
 */
export const readWarehouseMappings = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<WarehouseMapping[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "sales_channel.id",
      "sales_channel.stock_locations.id",
      "sales_channel.stock_locations.name",
      "sales_channel.stock_locations.metadata",
    ],
    filters: { id: tenantId },
  });

  const locations = ((tenants[0]?.sales_channel?.stock_locations ?? []) as Record<
    string,
    unknown
  >[]).filter((location) => Boolean(location?.id));

  return locations.map((location) => {
    const metadata = (location.metadata as Record<string, unknown> | null) ?? null;
    const mapped = metadata?.[WB_WAREHOUSE_METADATA_KEY];
    return {
      stock_location_id: String(location.id),
      stock_location_name: String(location.name ?? ""),
      wb_warehouse_id:
        mapped === null || mapped === undefined || String(mapped).trim() === ""
          ? null
          : String(mapped).trim(),
    };
  });
};

/**
 * The shop's variants with the two numbers this task compares.
 *
 * `stock` stays `null` for a variant the shop does not count
 * (`manage_inventory: false`), because `0` would say "none left" and the diff
 * would then offer to zero that size on WB (rule 20a). `price` is the variant's
 * own unscoped price in the currency asked for, never a price-list or
 * rule-bound row: those belong to a campaign and not to the shelf.
 */
export const readStoreVariants = async (
  container: MedusaContainer,
  options: { tenantId: string; currency: string; stockLocationIds: string[] },
): Promise<StoreVariant[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productIds = await tenantProductIds(container, options.tenantId);

  if (!productIds.length) {
    return [];
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    filters: { id: productIds },
    pagination: { take: null } as never,
  });

  const currency = options.currency.toLowerCase();
  const variants: (StoreVariant & { inventory_item_id: string | null; counted: boolean })[] = [];

  for (const product of products) {
    const rows = ((product.variants ?? []) as Record<string, unknown>[])
      .slice()
      .sort((left, right) =>
        String(left?.created_at ?? "").localeCompare(String(right?.created_at ?? "")),
      );

    for (const variant of rows) {
      const prices = ((variant.price_set as { prices?: Record<string, unknown>[] } | null)?.prices ??
        []) as Record<string, unknown>[];

      const own = prices.find(
        (price) =>
          String(price?.currency_code ?? "").toLowerCase() === currency &&
          !price?.price_list_id &&
          ((price?.price_rules ?? []) as unknown[]).length === 0,
      );

      variants.push({
        product_id: String(product.id),
        product_title: String(product.title ?? ""),
        variant_id: String(variant.id),
        variant_sku: ((variant.sku as string | null) ?? null) || null,
        stock: null,
        price: own ? asNumber(own.amount) : null,
        currency,
        inventory_item_id:
          ((variant.inventory_items ?? []) as { inventory_item_id?: string | null }[])
            .map((link) => link?.inventory_item_id)
            .find((id): id is string => Boolean(id)) ?? null,
        counted: Boolean(variant.manage_inventory),
      });
    }
  }

  const itemIds = [
    ...new Set(
      variants
        .filter((variant) => variant.counted)
        .map((variant) => variant.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (itemIds.length && options.stockLocationIds.length) {
    const { data: levels } = await query.graph({
      entity: "inventory_level",
      fields: ["inventory_item_id", "location_id", "stocked_quantity"],
      filters: { inventory_item_id: itemIds, location_id: options.stockLocationIds },
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

    for (const variant of variants) {
      if (variant.counted && variant.inventory_item_id) {
        variant.stock = byItem.get(variant.inventory_item_id) ?? 0;
      }
    }
  }

  return variants.map(({ inventory_item_id: _item, counted: _counted, ...rest }) => rest);
};

/** The pairings w07 recorded, for Wildberries only. */
export const readLinks = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<LinkRow[]> => {
  const service = container.resolve<MarketplaceLinkModuleService>(MARKETPLACE_LINK_MODULE);
  const rows = (await service.listProductMarketplaceLinks({
    tenant_id: tenantId,
    marketplace: "wb",
  })) as Array<{ product_id: string; variant_id: string | null; external_id: string }>;

  return rows.map((row) => ({
    product_id: row.product_id,
    variant_id: row.variant_id ?? null,
    external_id: String(row.external_id),
  }));
};

export type MirrorBundle = {
  cards: MirrorCard[];
  stocks: MirrorStock[];
  prices: MirrorPrice[];
  fetched_at: string | null;
};

/** The three WB mirrors, read whole for this tenant. Never written here. */
export const readMirrors = async (
  container: MedusaContainer,
  tenantId: string,
  kind: "stocks" | "prices",
): Promise<MirrorBundle> => {
  const wb = container.resolve<WbModuleService>(WB_MODULE);

  const cards =
    kind === "stocks"
      ? ((await wb.listWbProducts({ tenant_id: tenantId })) as unknown as Array<{
          nm_id: string;
          vendor_code: string | null;
          sizes: unknown;
        }>)
      : [];

  const stocks =
    kind === "stocks"
      ? ((await wb.listWbStocks({ tenant_id: tenantId })) as unknown as Array<{
          warehouse_id: string;
          warehouse_name: string | null;
          sku: string;
          chrt_id: string | null;
          nm_id: string | null;
          amount: number;
          fetched_at: Date | string;
        }>)
      : [];

  const prices =
    kind === "prices"
      ? ((await wb.listWbPrices({ tenant_id: tenantId })) as unknown as Array<{
          nm_id: string;
          discount: number | null;
          currency_iso: string | null;
          sizes: unknown;
          fetched_at: Date | string;
        }>)
      : [];

  const stamps = [...stocks, ...prices]
    .map((row) => {
      const value = row.fetched_at;
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    })
    .filter((value): value is string => Boolean(value));

  return {
    cards: cards.map((card) => ({
      nm_id: String(card.nm_id),
      vendor_code: card.vendor_code ?? null,
      sizes: card.sizes,
    })),
    stocks: stocks.map((stock) => ({
      warehouse_id: String(stock.warehouse_id),
      warehouse_name: stock.warehouse_name ?? null,
      sku: String(stock.sku),
      chrt_id: stock.chrt_id === null ? null : String(stock.chrt_id),
      nm_id: stock.nm_id === null ? null : String(stock.nm_id),
      amount: Number(stock.amount ?? 0),
    })),
    prices: prices.map((price) => ({
      nm_id: String(price.nm_id),
      discount: price.discount === null || price.discount === undefined ? null : Number(price.discount),
      currency_iso: price.currency_iso ?? null,
      sizes: price.sizes,
    })),
    // The OLDEST stamp, not the newest: it is the one that says how stale the
    // worst row in this comparison is (rule 18e, a number with a meaning).
    fetched_at: stamps.length ? stamps.sort()[0] : null,
  };
};
