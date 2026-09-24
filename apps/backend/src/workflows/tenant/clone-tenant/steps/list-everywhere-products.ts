import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * The products a new site of the group starts with (design §3.2, §3.4 p.4):
 * every product owned by a tenant of the group that sits in the channel of
 * EVERY site of the group before the new one, i.e. `site_scope` «all». A
 * product scoped to a subset stays where it is. Read-only.
 */
const listEverywhereProductsStep = createStep(
  "list-everywhere-products",
  async ({ group_id, exclude_tenant_id }: { group_id: string; exclude_tenant_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: tenants } = await query.graph({
      entity: "tenant",
      fields: ["id", "metadata", "sales_channel.id", "products.id"],
      filters: { group_id: [group_id] } as Record<string, unknown>,
    });

    type Row = {
      id: string;
      metadata?: Record<string, unknown> | null;
      sales_channel?: { id?: string } | null;
      products?: ({ id?: string } | null)[] | null;
    };
    const sites = (tenants as Row[]).filter(
      (tenant) => tenant.id !== exclude_tenant_id && typeof tenant.metadata?.["archived_at"] !== "string",
    );
    const channels = sites.map((site) => site.sales_channel?.id).filter((id): id is string => Boolean(id));
    const productIds = sites.flatMap((site) => (site.products ?? []).map((p) => p?.id)).filter((id): id is string => Boolean(id));

    if (!channels.length || !productIds.length) {
      return new StepResponse({ product_ids: [] as string[] });
    }

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "sales_channels.id"],
      filters: { id: productIds },
    });

    const everywhere = (products as { id: string; sales_channels?: ({ id?: string } | null)[] | null }[])
      .filter((product) => {
        const own = new Set((product.sales_channels ?? []).map((channel) => channel?.id));
        return channels.every((channel) => own.has(channel));
      })
      .map((product) => product.id);

    return new StepResponse({ product_ids: everywhere });
  },
);

export default listEverywhereProductsStep;
