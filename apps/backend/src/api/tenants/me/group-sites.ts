import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isTestShop } from "../../../modules/tenant/test-shop";

/**
 * The second reason `POST /tenants/me/switch` lets a session into a shop
 * (t-2026-09-24-n12, `docs/multitenancy/sites-one-db-many-storefronts.md`
 * §3.1): the target is another site of the caller's own client, i.e. another
 * tenant with the same non-null `tenant.group_id`. The first reason, a
 * `tenant_admin` row under the caller's email (o25-platform-admin-all-shops),
 * is unchanged. There is one switcher, not two: the design's
 * `POST /tenants/switch/:tenantId` is this route with one more reason.
 */

/**
 * `same_group` is set on the sites of the caller's own client only (the
 * current one included), so the panel can tell «мои сайты» from other shops
 * the same email happens to hold a row in (the platform admin's case).
 */
export type SwitchableShop = { id: string; name: string; handle: string; same_group?: true };

type TenantRow = {
  id?: string | null;
  name?: string | null;
  handle?: string | null;
  metadata?: unknown;
  group?: { id?: string | null } | null;
};

const isArchived = (metadata: unknown): boolean =>
  Boolean(
    metadata &&
      typeof metadata === "object" &&
      typeof (metadata as Record<string, unknown>)["archived_at"] === "string",
  );

/**
 * The caller's current tenant and its group id, read off the caller's own
 * `tenant_admin` row (`req.auth_context.actor_id`), never off the request.
 */
export const readCallerTenant = async (
  scope: MedusaContainer,
  actorId: string,
): Promise<{ email: string; first_name: string | null; last_name: string | null; tenant_id: string; group_id: string | null } | null> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [caller],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email", "first_name", "last_name", "tenant.id", "tenant.group.id"],
    filters: { id: [actorId] },
  });

  if (!caller?.tenant?.id) {
    return null;
  }

  return {
    email: caller.email as string,
    first_name: (caller.first_name as string | null) ?? null,
    last_name: (caller.last_name as string | null) ?? null,
    tenant_id: caller.tenant.id as string,
    group_id: ((caller.tenant as TenantRow).group?.id as string | undefined) ?? null,
  };
};

/**
 * Every live tenant of `groupId`, archived ones left out: an archived site is
 * closed for login by `blockArchivedTenantAdmin`, so offering it would only
 * lead to a session that 403s on its first request. `null` group = no
 * siblings at all, which is what a single-site shop gets.
 */
export const listGroupTenants = async (
  scope: MedusaContainer,
  groupId: string | null,
): Promise<TenantRow[]> => {
  if (!groupId) {
    return [];
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "handle", "metadata", "group.id"],
    filters: { group_id: [groupId] } as Record<string, unknown>,
  });

  return (data as TenantRow[]).filter(
    (tenant) => Boolean(tenant.id) && tenant.group?.id === groupId && !isArchived(tenant.metadata),
  );
};

/**
 * The switcher list: shops the email holds a row in, then the sites of the
 * current group it has no row in yet, one entry per tenant. A shop marked
 * `test_shop` is hidden unless it is the current one (o25-hide-test-shops),
 * the same rule for both sources.
 */
export const mergeSwitchableShops = (
  currentTenantId: string,
  byEmail: TenantRow[],
  bySameGroup: TenantRow[],
): SwitchableShop[] => {
  const seen = new Set<string>();
  const shops: SwitchableShop[] = [];
  const groupIds = new Set(bySameGroup.map((tenant) => tenant.id).filter(Boolean));

  for (const tenant of [...byEmail, ...bySameGroup]) {
    const id = tenant.id;
    if (!id || seen.has(id)) {
      continue;
    }
    if (id !== currentTenantId && isTestShop(tenant.metadata)) {
      continue;
    }
    seen.add(id);
    shops.push({
      id,
      name: tenant.name as string,
      handle: tenant.handle as string,
      ...(groupIds.has(id) ? { same_group: true as const } : {}),
    });
  }

  return shops;
};
