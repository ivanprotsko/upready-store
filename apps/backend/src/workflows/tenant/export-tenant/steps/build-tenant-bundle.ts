import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import medusaPackageJson from "@medusajs/medusa/package.json";
import { listTenantFiles } from "../../../../tenant-files";
import { readSiteSection, type SiteSection } from "../../../../tenant-sites/site-section";

export type BuildTenantBundleStepInput = {
  tenant_id: string;
};

export type TenantBundleManifest = {
  counts: Record<string, number>;
  bytes: number;
};

export type TenantBundle = {
  format: "upready.tenant-bundle/v1";
  exported_at: string;
  source: { backend_version: string; tenant_id: string };
  tenant: { id: string; handle: string; name: string; metadata: Record<string, unknown> | null };
  admins: Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>;
  sales_channel: { id: string; name: string; is_disabled: boolean } | null;
  api_key: { id: string; title: string; type: string; token: string } | null;
  warehouse: {
    stock_locations: unknown[];
  };
  products: unknown[];
  inventory: unknown[];
  categories: unknown[];
  collections: unknown[];
  customers: unknown[];
  orders: unknown[];
  regions: unknown[];
  files: Array<{ key: string; url: string; size: number | null }>;
  pages: null;
  /** The site's own settings (`tenant-sites/site-section.ts`), what `clone-tenant` copies. */
  site: SiteSection;
  manifest: TenantBundleManifest;
};

const dedupeById = <T extends { id?: unknown }>(rows: (T | null | undefined)[]): T[] => {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const id = row?.id as string | undefined;
    if (row && id && !seen.has(id)) {
      seen.set(id, row);
    }
  }
  return Array.from(seen.values());
};

const idsOf = (rows: ({ id?: unknown } | null | undefined)[] | undefined | null): string[] =>
  (rows ?? [])
    .map((row) => row?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

const PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "status",
  "external_id",
  "description",
  "handle",
  "is_giftcard",
  "discountable",
  "thumbnail",
  "collection_id",
  "type_id",
  "weight",
  "length",
  "height",
  "width",
  "hs_code",
  "origin_country",
  "mid_code",
  "material",
  "created_at",
  "updated_at",
  "metadata",
  "*type",
  "*collection",
  "*options",
  "*options.values",
  "*tags",
  "*images",
  "*categories",
  "*variants",
  "*variants.options",
  "*variants.images",
  "*variants.prices",
  "variants.prices.price_rules.value",
  "variants.prices.price_rules.attribute",
  "*variants.inventory_items",
  "variants.inventory_items.inventory.id",
  "variants.inventory_items.inventory.sku",
  "variants.inventory_items.inventory.title",
  "variants.inventory_items.inventory.stocked_quantity",
  "variants.inventory_items.inventory.reserved_quantity",
  "*variants.inventory_items.inventory.location_levels",
];

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "version",
  "summary",
  "total",
  "subtotal",
  "tax_total",
  "discount_total",
  "shipping_total",
  "currency_code",
  "region_id",
  "email",
  "customer_id",
  "metadata",
  "created_at",
  "updated_at",
  "*items",
  "items.tax_lines",
  "items.adjustments",
  "*items.variant",
  "*shipping_address",
  "*billing_address",
  "*shipping_methods",
  "shipping_methods.tax_lines",
  "shipping_methods.adjustments",
  "*payment_collections",
  "payment_collections.payments",
  "payment_collections.payments.refunds",
  "payment_collections.payments.captures",
  "*fulfillments",
];

const CUSTOMER_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "phone",
  "company_name",
  "has_account",
  "metadata",
  "created_at",
  "updated_at",
  "*addresses",
];

const REGION_FIELDS = ["id", "name", "currency_code", "automatic_taxes", "metadata", "*countries"];

const WAREHOUSE_FIELDS = [
  "id",
  "name",
  "stock_locations.id",
  "stock_locations.name",
  "stock_locations.metadata",
  "stock_locations.address.address_1",
  "stock_locations.address.address_2",
  "stock_locations.address.city",
  "stock_locations.address.province",
  "stock_locations.address.postal_code",
  "stock_locations.address.country_code",
  "stock_locations.fulfillment_sets.id",
  "stock_locations.fulfillment_sets.name",
  "stock_locations.fulfillment_sets.type",
  "stock_locations.fulfillment_sets.service_zones.id",
  "stock_locations.fulfillment_sets.service_zones.name",
  "stock_locations.fulfillment_sets.service_zones.geo_zones.country_code",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.id",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.name",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.price_type",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.provider_id",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.shipping_profile_id",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.type.label",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.type.description",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.type.code",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.prices.currency_code",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.prices.amount",
  // t-2026-09-24-n12: the tariff (`data`) and the «enabled in store» rule are
  // what makes a delivery method of the owner's; `clone-tenant` copies them.
  "stock_locations.fulfillment_sets.service_zones.shipping_options.data",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.rules.attribute",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.rules.operator",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.rules.value",
  "stock_locations.fulfillment_sets.service_zones.shipping_options.created_at",
];

/**
 * The stock locations of one sales channel, with fulfillment sets, zones and
 * shipping options (tariff `data` and rules included): the bundle's
 * `warehouse.stock_locations`, and what `clone-tenant` copies delivery from.
 */
export const readChannelWarehouse = async (
  container: MedusaContainer,
  salesChannelId: string | null,
): Promise<unknown[]> => {
  if (!salesChannelId) {
    return [];
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [channel],
  } = await query.graph({
    entity: "sales_channel",
    fields: WAREHOUSE_FIELDS,
    filters: { id: salesChannelId },
  });
  return (channel?.stock_locations ?? []) as unknown[];
};

/**
 * Assembles the whole `upready.tenant-bundle/v1` document for one tenant: one
 * step, several `query.graph` calls, nothing invented. Every array is `[]`
 * when the tenant genuinely has none — never omitted, never a partial guess.
 *
 * Read-only: no module service write anywhere in this step, so the workflow
 * needs no compensation (`docs/multitenancy/admin-tenants-api-contract.md` §6).
 */
const buildTenantBundleStep = createStep(
  "build-tenant-bundle",
  async ({ tenant_id }: BuildTenantBundleStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: [
        "id",
        "handle",
        "name",
        "metadata",
        "sales_channel.id",
        "sales_channel.name",
        "sales_channel.is_disabled",
        "api_key.id",
        "api_key.title",
        "api_key.type",
        "api_key.token",
        "admins.id",
        "admins.email",
        "admins.first_name",
        "admins.last_name",
        "products.id",
        "orders.id",
      ],
      filters: { id: tenant_id },
    });

    if (!tenant?.id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant ${tenant_id} was not found.`);
    }

    const salesChannelId = (tenant.sales_channel as { id?: string } | null)?.id ?? null;
    const productIds = idsOf(tenant.products as { id?: string }[] | undefined);
    const orderIds = idsOf(tenant.orders as { id?: string }[] | undefined);

    // --- products (+ the inventory/categories/collections they reference) ---
    const products = productIds.length
      ? (
          await query.graph({
            entity: "product",
            fields: PRODUCT_FIELDS,
            filters: { id: productIds },
          })
        ).data
      : [];

    const inventory = dedupeById(
      products.flatMap((product) =>
        ((product.variants ?? []) as { inventory_items?: { inventory?: unknown }[] }[]).flatMap(
          (variant) =>
            (variant.inventory_items ?? [])
              .map((item) => item?.inventory)
              .filter((inv): inv is { id?: unknown } => Boolean(inv)),
        ),
      ),
    );

    const categories = dedupeById(
      products.flatMap((product) => (product.categories ?? []) as { id?: unknown }[]),
    );

    const collections = dedupeById(
      products
        .map((product) => product.collection as { id?: unknown } | null)
        .filter((collection): collection is { id?: unknown } => Boolean(collection)),
    );

    // --- orders (+ the customers and regions they reference) ---
    const orders = orderIds.length
      ? (
          await query.graph({
            entity: "order",
            fields: ORDER_FIELDS,
            filters: { id: orderIds },
          })
        ).data
      : [];

    const customerIds = Array.from(
      new Set(
        orders
          .map((order) => order.customer_id as string | null | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const customers = customerIds.length
      ? (
          await query.graph({
            entity: "customer",
            fields: CUSTOMER_FIELDS,
            filters: { id: customerIds },
          })
        ).data
      : [];

    const regionIds = Array.from(
      new Set(
        orders
          .map((order) => order.region_id as string | null | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const regions = regionIds.length
      ? (
          await query.graph({
            entity: "region",
            fields: REGION_FIELDS,
            filters: { id: regionIds },
          })
        ).data
      : [];

    // --- warehouse, through the tenant's sales channel ---
    const stockLocations = await readChannelWarehouse(container, salesChannelId);

    // --- files, from the shared tenant-files helper (owner W2) ---
    const files = await listTenantFiles(container, tenant_id);

    // --- the site's own settings (t-2026-09-24-n12) ---
    const site = await readSiteSection(container, tenant_id);

    const admins = (tenant.admins ?? []) as TenantBundle["admins"];
    const apiKey = tenant.api_key as TenantBundle["api_key"];

    const bundle: TenantBundle = {
      format: "upready.tenant-bundle/v1",
      exported_at: new Date().toISOString(),
      source: {
        backend_version: (medusaPackageJson as { version?: string }).version ?? "unknown",
        tenant_id,
      },
      tenant: {
        id: tenant.id as string,
        handle: tenant.handle as string,
        name: tenant.name as string,
        metadata: (tenant.metadata as Record<string, unknown> | null) ?? null,
      },
      admins,
      sales_channel: tenant.sales_channel as TenantBundle["sales_channel"],
      api_key: apiKey,
      warehouse: { stock_locations: stockLocations },
      products,
      inventory,
      categories,
      collections,
      customers,
      orders,
      regions,
      files,
      pages: null,
      site,
      manifest: { counts: {}, bytes: 0 },
    };

    const counts: Record<string, number> = {
      admins: admins.length,
      products: products.length,
      inventory: inventory.length,
      categories: categories.length,
      collections: collections.length,
      customers: customers.length,
      orders: orders.length,
      regions: regions.length,
      files: files.length,
      stock_locations: stockLocations.length,
    };

    const bytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
    bundle.manifest = { counts, bytes };

    return new StepResponse({ bundle, manifest: bundle.manifest });
  },
);

export default buildTenantBundleStep;
