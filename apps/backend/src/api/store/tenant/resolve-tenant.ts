import type { MedusaRequest, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, PUBLISHABLE_KEY_HEADER } from "@medusajs/framework/utils";

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

export type TenantFromPublishableKey = { id: string; metadata: Record<string, unknown> | null };

/**
 * Same answer as {@link resolveTenantFromPublishableKey}, for a route the
 * framework's own `/store` publishable-key gate never reaches: `/auth/customer/*`
 * is not under `/store`, so `req.publishable_key_context` is never populated
 * there (o25-login-methods, `login-method-gate.ts`). The raw header is read
 * and resolved by hand instead. `null` when the key is missing, unknown, or
 * owns no tenant (a single-store install's own key) — never a throw, because
 * every caller of this one treats "no shop" as a fallback, not an error.
 */
export const resolveTenantFromPublishableKeyHeader = async (
  req: MedusaRequest,
): Promise<TenantFromPublishableKey | null> => {
  const token = req.get(PUBLISHABLE_KEY_HEADER);
  if (!token) {
    return null;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "sales_channels_link.sales_channel_id"],
    filters: { token: [token] },
  });

  const channelIds = ((keys[0]?.sales_channels_link ?? []) as { sales_channel_id?: string }[])
    .map((link) => link.sales_channel_id)
    .filter((id): id is string => Boolean(id));

  if (!channelIds.length) {
    return null;
  }

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "tenant.id", "tenant.metadata"],
    filters: { id: channelIds },
  });

  const hit = channels.find((channel) => channel?.tenant?.id);
  const tenant = hit?.tenant;

  if (!tenant?.id) {
    return null;
  }

  return {
    id: tenant.id as string,
    metadata: (tenant.metadata as Record<string, unknown> | null) ?? null,
  };
};
