import type { MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * The tenant behind a storefront call. Every `/store/*` request already carries
 * a validated publishable key (the framework's global gate), and the framework
 * puts the key's sales channels on `req.publishable_key_context`. The tenant
 * owns exactly one channel (link tenant-sales-channel), so the channel is the
 * tenant. Shared by `/store/tenant/*` (pages, home, product-categories) — wave 2
 * of the tenant panel, `docs/tenant-panel/api-contract.md`.
 *
 * A key with no tenant behind it (the platform's own key, a single-store
 * install) is a NOT_FOUND, never a guess.
 */
export type StoreTenant = { id: string; handle: string; name: string; sales_channel_id: string };

export const resolveTenantFromPublishableKey = async (req: MedusaStoreRequest): Promise<StoreTenant> => {
  const channelIds = req.publishable_key_context?.sales_channel_ids ?? [];
  if (!channelIds.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No tenant behind this publishable key.");
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "tenant.id", "tenant.handle", "tenant.name"],
    filters: { id: channelIds },
  });
  const hit = channels.find((c) => c?.tenant?.id);
  const tenant = hit?.tenant;
  if (!hit || !tenant?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No tenant behind this publishable key.");
  }
  return {
    id: tenant.id as string,
    handle: tenant.handle as string,
    name: tenant.name as string,
    sales_channel_id: hit.id,
  };
};
