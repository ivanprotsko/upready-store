import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * o24-courses part (c): Medusa v2 has no `requires_shipping` concept
 * (`o24-seed-courses.ts`'s own comment), so a cart holding only digital
 * products still needs a REAL shipping option attached before
 * `completeCartWorkflow` will place the order — the storefront checkout
 * cannot simply omit a shipping method. This seeds exactly one such option
 * for tenant `cherkashino`, ₽0/$0, in the warehouse's own base service zone
 * (the same zone `provisionTenantWarehouseWorkflow` put "Самовывоз" and
 * "Курьером" in), so it resolves for a cart the same way those two already
 * do — no new zone, no new fulfillment set.
 *
 * `metadata.digital_delivery = "true"` (not `data`, which
 * `apps/backend/src/api/tenants/shipping-methods` reads/writes as the
 * owner-editable tariff shape — `TenantMethodData`, `isTenantMethodData`) is
 * how the storefront checkout (`apps/storefront/src/lib/data/checkout-
 * digital.ts`) finds this ONE option among the tenant's methods without
 * matching on its name, which the owner can rename from /shipping at any
 * time. It shows up in that panel screen like any other method (`toMethod`'s
 * own fallback for a `data` that is not tenant-schema-tagged renders it as a
 * plain flat ₽0 method) — the owner can rename or reprice it, but deleting it
 * would break checkout for a digital cart, which is why this seed re-creates
 * it if missing rather than only running once forever.
 *
 * Idempotent: re-running finds the option by its `metadata` marker in the
 * warehouse's base zone and does nothing if one already exists.
 */
const TENANT_HANDLE = "cherkashino";
const OPTION_NAME = "Цифровая доставка";
export const DIGITAL_DELIVERY_METADATA_KEY = "digital_delivery";

export default async function seedO24DigitalShippingOption({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: tenantAdmins } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.handle", "tenant.sales_channel.id"],
    filters: {},
  });
  const tenantAdmin = tenantAdmins.find((row) => row.tenant?.handle === TENANT_HANDLE);
  const salesChannelId = tenantAdmin?.tenant?.sales_channel?.id as string | undefined;

  if (!tenantAdmin?.tenant?.id || !salesChannelId) {
    throw new Error(
      `o24-seed-digital-shipping-option: tenant "${TENANT_HANDLE}" (or its sales channel) was not found.`,
    );
  }

  const {
    data: [channel],
  } = await query.graph({
    entity: "sales_channels",
    fields: [
      "id",
      "stock_locations.id",
      "stock_locations.fulfillment_sets.id",
      "stock_locations.fulfillment_sets.name",
      "stock_locations.fulfillment_sets.type",
      "stock_locations.fulfillment_sets.service_zones.id",
      "stock_locations.fulfillment_sets.service_zones.name",
      "stock_locations.fulfillment_sets.service_zones.created_at",
    ],
    filters: { id: salesChannelId },
  });

  type Zone = { id: string; name: string; created_at: string | Date };
  type Set = { id: string; name: string; type: string; service_zones?: Zone[] };
  type Location = { id: string; fulfillment_sets?: Set[] };

  const locations = ((channel?.stock_locations ?? []) as unknown as (Location | null)[]).filter(
    (location): location is Location => location !== null,
  );
  let shippingSet: Set | null = null;
  for (const location of locations) {
    const set = (location.fulfillment_sets ?? []).find((candidate) => candidate.type === "shipping");
    if (set) {
      shippingSet = set;
      break;
    }
  }

  if (!shippingSet) {
    throw new Error(
      `o24-seed-digital-shipping-option: tenant "${TENANT_HANDLE}" has no warehouse with a shipping fulfillment set; run its warehouse provisioning first.`,
    );
  }

  const zones = [...(shippingSet.service_zones ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const baseZone = zones.find((zone) => zone.name === shippingSet!.name) ?? zones[0];

  if (!baseZone) {
    throw new Error(`o24-seed-digital-shipping-option: tenant "${TENANT_HANDLE}" warehouse has no service zone.`);
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "metadata"],
    filters: { service_zone_id: [baseZone.id] },
  });
  const already = existingOptions.find(
    (option) => (option.metadata as Record<string, unknown> | null)?.[DIGITAL_DELIVERY_METADATA_KEY] === "true",
  );

  if (already) {
    logger.info(`o24-seed-digital-shipping-option: already exists (${already.id}), skipping`);
    return;
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
    pagination: { take: 1 },
  });
  const shippingProfileId = profiles[0]?.id;

  if (!shippingProfileId) {
    throw new Error("o24-seed-digital-shipping-option: the backend has no shipping profile.");
  }

  const { data: regions } = await query.graph({ entity: "region", fields: ["currency_code"] });
  const currencyCodes = [...new Set(regions.map((region) => region.currency_code as string).filter(Boolean))];

  // Built as a variable, not inline: `createShippingOptionsWorkflow`'s input type has
  // no `metadata` field (only `data`), but the fulfillment module's `shipping_option`
  // model has both (`node_modules/@medusajs/fulfillment/dist/models/shipping-option.js`)
  // and the workflow forwards it same as `migration-scripts/lib/fulfillment.ts` already
  // does. A literal passed straight into `.run()` fails tsc's excess-property check on
  // that unlisted field; a plain variable does not.
  const optionInput = {
    name: OPTION_NAME,
    price_type: "flat" as const,
    provider_id: "manual_manual",
    service_zone_id: baseZone.id,
    shipping_profile_id: shippingProfileId,
    type: {
      label: OPTION_NAME,
      description: "Курс выдаётся в личном кабинете, без физической доставки.",
      code: "digital-delivery",
    },
    metadata: { [DIGITAL_DELIVERY_METADATA_KEY]: "true" },
    prices: currencyCodes.map((currency_code) => ({ currency_code, amount: 0 })),
    rules: [
      { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
      { attribute: "is_return", value: "false", operator: "eq" as const },
    ],
  };

  const { result } = await createShippingOptionsWorkflow(container).run({ input: [optionInput] });

  logger.info(`o24-seed-digital-shipping-option: created ${result[0].id} in zone ${baseZone.id}`);
}
