import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { readSiteSection, type SiteSection } from "../../../../tenant-sites/site-section";
import { readChannelWarehouse } from "../../export-tenant/steps/build-tenant-bundle";

export type SourceSite = {
  tenant_id: string;
  name: string;
  group_id: string | null;
  site: SiteSection;
  /** `warehouse.stock_locations` of the export bundle, delivery methods included. */
  stock_locations: unknown[];
};

/**
 * Reads the source site with the export bundle's own readers
 * (`readSiteSection`, `readChannelWarehouse`), so the clone copies exactly
 * what `export-tenant` would write for it, minus products and orders.
 * Read-only, nothing to compensate.
 */
const readSourceSiteStep = createStep(
  "read-source-site",
  async ({ tenant_id }: { tenant_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: ["id", "name", "group.id", "sales_channel.id"],
      filters: { id: tenant_id },
    });

    if (!tenant?.id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant ${tenant_id} was not found.`);
    }

    const source: SourceSite = {
      tenant_id,
      name: tenant.name as string,
      group_id: ((tenant as { group?: { id?: string } | null }).group?.id as string | undefined) ?? null,
      site: await readSiteSection(container, tenant_id),
      stock_locations: await readChannelWarehouse(
        container,
        ((tenant as { sales_channel?: { id?: string } | null }).sales_channel?.id as string | undefined) ?? null,
      ),
    };

    return new StepResponse(source);
  },
);

export default readSourceSiteStep;
