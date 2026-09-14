import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { defaultMethodNames, isMachineMadeDefaultName, storeDefaultLocale } from "../shipping-tariffs/default-method-names";
import { isTenantMethodData, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../shipping-tariffs/tariff";

/**
 * Renames the machine-made defaults of EXISTING tenants («<Shop> pickup» /
 * «<Shop> courier», written by the first cut of `provisionTenantWarehouseWorkflow`)
 * to the human names new tenants now get («Самовывоз» / «Курьером» for ru) and
 * stamps the tenant-method `data` on them so /shipping lists them. Nothing is
 * deleted or repriced; an option the owner already renamed is left alone
 * (its name no longer matches the machine pattern). Idempotent.
 *
 *   npx medusa exec ./src/scripts/rename-default-shipping-methods.ts
 *   LOCALE=en npx medusa exec ./src/scripts/rename-default-shipping-methods.ts
 */
export default async function renameDefaultShippingMethods({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const names = defaultMethodNames(process.env.LOCALE ?? storeDefaultLocale());

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "sales_channel.id", "sales_channel.stock_locations.fulfillment_sets.service_zones.id"],
  });

  let renamed = 0;
  for (const tenant of tenants) {
    type Loc = { fulfillment_sets?: { service_zones?: { id: string }[] }[] };
    const zoneIds = ((tenant.sales_channel?.stock_locations ?? []) as Loc[]).flatMap((location) =>
      (location.fulfillment_sets ?? []).flatMap((set) => (set.service_zones ?? []).map((zone) => zone.id)),
    );
    if (!zoneIds.length) {
      continue;
    }
    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "prices.currency_code", "prices.amount"],
      filters: { service_zone_id: zoneIds },
    });

    const updates = options
      .map((option) => {
        const kind = isMachineMadeDefaultName(option.name as string, tenant.name as string);
        if (!kind) {
          return null;
        }
        const human = names[kind];
        const sortOrder = kind === "pickup" ? 0 : 1;
        const existing = isTenantMethodData(option.data) ? option.data : null;
        // `prices` is a pricing-module link the generated ShippingOption type does not carry.
        const prices = (option as unknown as { prices?: { amount?: number | null }[] | null }).prices;
        const amount = Number(prices?.[0]?.amount ?? 0);
        const data: TenantMethodData = existing ?? {
          schema: TENANT_METHOD_SCHEMA,
          tariff: { kind: "flat", amount },
          description: human.description,
          delivery_hint: null,
          sort_order: sortOrder,
          default_weight_g: 500,
          own_zone: false,
          zone: null,
        };
        return {
          id: option.id as string,
          name: human.name,
          type: { label: human.name, description: human.description, code: kind },
          data,
        };
      })
      .filter((update): update is NonNullable<typeof update> => update !== null);

    if (updates.length) {
      await updateShippingOptionsWorkflow(container).run({ input: updates });
      renamed += updates.length;
      logger.info(`[rename-default-shipping-methods] ${tenant.name}: ${updates.map((u) => u.name).join(", ")}`);
    }
  }

  logger.info(`[rename-default-shipping-methods] renamed ${renamed} options across ${tenants.length} tenants`);
}
