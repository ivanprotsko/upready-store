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

/**
 * The tenants whose shared catalogue this storefront reads (t-2026-09-24-n12,
 * `tenant_group`): the tenant itself first, then every other live site of its
 * group. A site made by «Создать сайт» sells the group's products through its
 * own sales channel, but the record that says whose a category is stays with
 * the site that created it, so a storefront read scoped to one tenant alone
 * gave such a site no category at all (pass 3b N13: cherkashino.com had no
 * category menu and answered 404 on every category page its own breadcrumbs
 * led to).
 *
 * A tenant without a group is alone in the list, which keeps every read built
 * on it unchanged for a single shop. The membership rule is `listGroupSites`'s
 * own (`tenants/tenant-scope.ts`): same group, not archived.
 */
export const listGroupTenantIds = async (req: MedusaStoreRequest, tenantId: string): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [row],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "group.id"],
    filters: { id: [tenantId] },
  });

  const groupId = (row as { group?: { id?: string } | null } | undefined)?.group?.id ?? null;

  if (!groupId) {
    return [tenantId];
  }

  const { data: members } = await query.graph({
    entity: "tenant",
    fields: ["id", "metadata", "group.id"],
    filters: { group_id: [groupId] } as Record<string, unknown>,
  });

  const others = (members as {
    id?: string;
    metadata?: Record<string, unknown> | null;
    group?: { id?: string } | null;
  }[])
    .filter(
      (member) =>
        member.id &&
        member.id !== tenantId &&
        member.group?.id === groupId &&
        typeof member.metadata?.["archived_at"] !== "string",
    )
    .map((member) => member.id as string);

  return [tenantId, ...others];
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
