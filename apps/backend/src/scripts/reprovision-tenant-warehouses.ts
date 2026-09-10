import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import provisionTenantWarehouseWorkflow from "../workflows/tenant/provision-tenant-warehouse";

/**
 * Moves the stand's existing tenants off the shared stock locations.
 *
 *   npx medusa exec ./src/scripts/reprovision-tenant-warehouses.ts
 *
 * Tenants created before the per-tenant-warehouse change had their sales
 * channel linked to every one of the backend's 241 seeded stock locations
 * (the old `link-sales-channel-to-stock-locations` step). This dismisses those
 * links for each tenant and gives the tenant its own warehouse through the same
 * `provisionTenantWarehouseWorkflow` that `POST /tenants` now runs.
 *
 * Idempotent: a tenant whose channel already resolves to exactly its own
 * `"<name> warehouse"` is left alone. Safe to re-run.
 */
export default async function reprovisionTenantWarehouses({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "name", "sales_channel.id"],
  });
  if (tenants.length === 0) {
    logger.info("reprovision-tenant-warehouses: no tenants — nothing to do.");
    return;
  }

  for (const tenant of tenants) {
    const ownWarehouseName = `${tenant.name} warehouse`;
    const salesChannelId = tenant.sales_channel?.id as string | undefined;

    if (!salesChannelId) {
      logger.warn(
        `reprovision-tenant-warehouses: ${tenant.handle} has no sales channel linked — skipped.`,
      );
      continue;
    }

    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "stock_locations.id", "stock_locations.name"],
      filters: { id: salesChannelId },
    });

    const linkedLocations = (channels[0]?.stock_locations ?? [])
      .map((location) => ({ id: location?.id as string, name: location?.name as string }))
      .filter((location) => Boolean(location.id));

    const alreadyOwn =
      linkedLocations.length === 1 && linkedLocations[0].name === ownWarehouseName;
    if (alreadyOwn) {
      logger.info(
        `reprovision-tenant-warehouses: ${tenant.handle} already on its own warehouse (${linkedLocations[0].id}) — skipped.`,
      );
      continue;
    }

    for (const location of linkedLocations) {
      await link.dismiss({
        [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      });
    }

    const { result } = await provisionTenantWarehouseWorkflow(container).run({
      input: {
        sales_channel_id: salesChannelId,
        tenant_name: tenant.name,
      },
    });

    logger.info(
      `reprovision-tenant-warehouses: ${tenant.handle} unlinked from ${linkedLocations.length} shared location(s); own warehouse ${result.stock_location_id}, service zone ${result.service_zone_id}, ${result.shipping_option_ids.length} shipping options.`,
    );
  }
}
