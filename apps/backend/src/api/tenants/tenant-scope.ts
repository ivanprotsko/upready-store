import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * Shared tenant scoping for `/tenants/*`. Every route here decides what the
 * caller may see from the module links (tenant-product, tenant-order,
 * tenant-sales-channel), never from the request: a body or a query parameter
 * naming a tenant, a sales channel or an id is only ever used to NARROW the
 * set these helpers return.
 *
 * Two rules the whole namespace follows:
 *
 * - `id: undefined` in a Medusa filter is no filter at all. A tenant with zero
 *   linked rows must get an empty page, so every list route calls
 *   `scopeIdFilter` and returns `emptyPage` when the intersection is empty
 *   rather than handing an undefined `id` to the query.
 * - A foreign id is a missing id. `assertOwned…` throws `NOT_FOUND`, never
 *   `NOT_ALLOWED`, so the response never tells one tenant that another
 *   tenant's row exists.
 */

export type TenantScope = {
  id: string;
  name: string;
  /** The tenant's own URL handle — what its starter catalog is suffixed with (seed-tenant-dataset). */
  handle: string;
  sales_channel_id: string | null;
};

const tenantAdminNotFound = (actorId: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant admin ${actorId} was not found.`);

/**
 * The tenant behind the token: its id, its display name and its one sales
 * channel, read through the tenant-sales-channel link. A channel deleted
 * through the Admin comes back as `null`, never as a dead id.
 */
export const getTenantScope = async (req: AuthenticatedMedusaRequest): Promise<TenantScope> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.name", "tenant.handle", "tenant.sales_channel.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  const tenant = tenantAdmin?.tenant;

  if (!tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return {
    id: tenant.id,
    name: tenant.name as string,
    handle: tenant.handle as string,
    sales_channel_id: (tenant.sales_channel?.id as string | undefined) ?? null,
  };
};

const idsOf = (rows: ({ id?: string | null } | null | undefined)[] | undefined | null): string[] =>
  (rows ?? []).map((row) => row?.id).filter((id): id is string => Boolean(id));

/**
 * Every product id linked to the tenant, through the tenant-product link. This
 * is the ownership record: a product sitting in the same database but created
 * by another tenant is not in here, and a product in the tenant's sales
 * channel that the tenant did not create is not in here either.
 */
export const listTenantProductIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.products.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin?.tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return idsOf(tenantAdmin.tenant.products);
};

/**
 * One site of the caller's client (t-2026-09-24-n12, `tenant_group`): the
 * tenant and the sales channel its storefront sells through.
 */
export type GroupSite = { tenant_id: string; sales_channel_id: string | null };

/**
 * The sites the caller's product decisions range over. For a tenant with a
 * `group_id` that is every live tenant of its group, the caller's own first;
 * for a tenant without one it is the caller alone, which keeps every rule
 * built on this list identical to the single-shop behaviour.
 */
export const listGroupSites = async (
  req: AuthenticatedMedusaRequest,
): Promise<{ group_id: string | null; sites: GroupSite[] }> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.group.id", "tenant.sales_channel.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  const tenant = tenantAdmin?.tenant as
    | { id?: string; group?: { id?: string } | null; sales_channel?: { id?: string } | null }
    | undefined;

  if (!tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  const own: GroupSite = { tenant_id: tenant.id, sales_channel_id: tenant.sales_channel?.id ?? null };
  const groupId = tenant.group?.id ?? null;

  if (!groupId) {
    return { group_id: null, sites: [own] };
  }

  const { data: members } = await query.graph({
    entity: "tenant",
    fields: ["id", "metadata", "group.id", "sales_channel.id"],
    filters: { group_id: [groupId] } as Record<string, unknown>,
  });

  const others = (members as {
    id?: string;
    metadata?: Record<string, unknown> | null;
    group?: { id?: string } | null;
    sales_channel?: { id?: string } | null;
  }[])
    .filter(
      (member) =>
        member.id &&
        member.id !== tenant.id &&
        member.group?.id === groupId &&
        typeof member.metadata?.["archived_at"] !== "string",
    )
    .map((member) => ({ tenant_id: member.id as string, sales_channel_id: member.sales_channel?.id ?? null }));

  return { group_id: groupId, sites: [own, ...others] };
};

/**
 * Every product id the caller may READ (t-2026-09-24-n12, design §3.2): for a
 * tenant in a group, the products owned by any tenant of the group; for any
 * other tenant, exactly `listTenantProductIds`. Writes never use this set:
 * price, photos and attributes stay with the owner (`assertOwnedProduct`), and
 * another site reaches them by switching into the owner.
 */
export const listReadableProductIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const { group_id, sites } = await listGroupSites(req);

  if (!group_id) {
    return listTenantProductIds(req);
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id"],
    filters: { id: sites.map((site) => site.tenant_id) },
  });

  return [...new Set((tenants as { products?: { id?: string | null }[] | null }[]).flatMap((t) => idsOf(t.products)))];
};

/** Every order id linked to the tenant by `linkOrderToTenantWorkflow`. */
export const listTenantOrderIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.orders.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin?.tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return idsOf(tenantAdmin.tenant.orders);
};

/**
 * Every warehouse the tenant fulfils from, through the sales-channel <-> stock
 * location link `provisionTenantWarehouseWorkflow` creates for a new shop.
 *
 * That link is the same one the Admin's own `sales_channel_id` filter walks
 * (`api/admin/stock-locations/middlewares.js`, `maybeApplyLinkFilter`), so the
 * set here is exactly what `GET /tenants/stock-locations?sales_channel_id=<own>`
 * returns, without the caller having to name the channel.
 *
 * A tenant whose channel was deleted through the Admin owns no warehouse and
 * gets an empty page, never the platform's 250-odd seeded warehouses.
 */
export const listTenantStockLocationIds = async (
  req: AuthenticatedMedusaRequest,
): Promise<string[]> => {
  const tenant = await getTenantScope(req);

  if (!tenant.sales_channel_id) {
    return [];
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [salesChannel],
  } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "stock_locations.id"],
    filters: {
      id: [tenant.sales_channel_id],
    },
  });

  return idsOf(salesChannel?.stock_locations);
};

/**
 * Narrows the ids the tenant owns by whatever the caller asked for. The Admin
 * validators type an `id` filter as a string or an array of strings; anything
 * else (an operator map such as `id[$ne]`) matches nothing here rather than
 * widening the set, which is the safe direction.
 */
export const scopeIdFilter = (ownedIds: string[], requested: unknown): string[] => {
  if (requested === undefined || requested === null) {
    return ownedIds;
  }

  const asArray = Array.isArray(requested) ? requested : [requested];
  const wanted = new Set(asArray.filter((value): value is string => typeof value === "string"));

  return ownedIds.filter((id) => wanted.has(id));
};

/**
 * The `count/offset/limit` half of an empty Admin list response. `offset` and
 * `limit` still echo the request, so a paginating client keeps working.
 */
export const emptyPage = (req: AuthenticatedMedusaRequest) => ({
  count: 0,
  offset: req.queryConfig?.pagination?.skip ?? 0,
  limit: req.queryConfig?.pagination?.take ?? 0,
});

/** 404 for a product outside `listReadableProductIds`, worded like `assertOwnedProduct`. */
export const assertReadableProduct = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
): Promise<void> => {
  const readableIds = await listReadableProductIds(req);

  if (!readableIds.includes(productId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${productId}" was not found`,
    );
  }
};

/** 404 for a product the tenant does not own, worded like Medusa's own miss. */
export const assertOwnedProduct = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
): Promise<void> => {
  const ownedIds = await listTenantProductIds(req);

  if (!ownedIds.includes(productId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${productId}" was not found`,
    );
  }
};

/**
 * Every product category id linked to the tenant, through the
 * tenant-product-category link (`src/links/tenant-product-category.ts`).
 *
 * Categories are global in Medusa: there is no sales channel on them and no
 * column saying who made one, so this link is the whole ownership record. A
 * category the staff Admin created belongs to nobody and never shows up here,
 * which is deliberate — `/tenants/product-categories` is the tenant's own
 * tree, not the catalog's.
 *
 * Graph name measured on the stand DB 2026-09-11 with `medusa exec`:
 * `query.graph({ entity: "tenant", fields: ["product_categories.id"] })`
 * resolves, and the link's own entry point is `tenant_product_category`
 * (`tenant_id`, `product_category_id`).
 */
export const listTenantCategoryIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.product_categories.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin?.tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return idsOf(tenantAdmin.tenant.product_categories);
};

/**
 * 404 for a category the tenant does not own, worded like Medusa's own miss on
 * `GET /admin/product-categories/:id`. Every write verb on
 * `/tenants/product-categories/:id` calls this before its workflow, and so does
 * the `parent_category_id` check on create and update: a tenant may only nest
 * its tree inside itself.
 */
export const assertOwnedCategory = async (
  req: AuthenticatedMedusaRequest,
  categoryId: string,
): Promise<void> => {
  const ownedIds = await listTenantCategoryIds(req);

  if (!ownedIds.includes(categoryId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product category with id: ${categoryId} was not found`,
    );
  }
};

/**
 * Every promotion id linked to the tenant, through the tenant-promotion link
 * (`src/links/tenant-promotion.ts`). `POST /tenants/promotions` writes the
 * link, so a promotion the native Admin created is nobody's here and a
 * promotion another tenant created is not in this set.
 */
export const listTenantPromotionIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.promotions.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin?.tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return idsOf(tenantAdmin.tenant.promotions);
};

/** Every campaign id linked to the tenant, through the tenant-campaign link. */
export const listTenantCampaignIds = async (req: AuthenticatedMedusaRequest): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.campaigns.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin?.tenant?.id) {
    throw tenantAdminNotFound(req.auth_context.actor_id);
  }

  return idsOf(tenantAdmin.tenant.campaigns);
};

/** 404 for a promotion the tenant does not own, worded like Medusa's own miss. */
export const assertOwnedPromotion = async (
  req: AuthenticatedMedusaRequest,
  promotionId: string,
): Promise<void> => {
  const ownedIds = await listTenantPromotionIds(req);

  if (!ownedIds.includes(promotionId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion with id or code: ${promotionId} was not found`,
    );
  }
};

/**
 * 404 on the first promotion id in the list the tenant does not own. The
 * campaign-promotions batch addresses promotions by bare id, so every id in
 * `add`/`remove` is checked before the workflow runs.
 */
export const assertOwnedPromotions = async (
  req: AuthenticatedMedusaRequest,
  promotionIds: string[],
): Promise<void> => {
  if (promotionIds.length === 0) {
    return;
  }

  const ownedIds = new Set(await listTenantPromotionIds(req));
  const foreign = promotionIds.find((id) => !ownedIds.has(id));

  if (foreign) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion with id or code: ${foreign} was not found`,
    );
  }
};

/** 404 for a campaign the tenant does not own. */
export const assertOwnedCampaign = async (
  req: AuthenticatedMedusaRequest,
  campaignId: string,
): Promise<void> => {
  const ownedIds = await listTenantCampaignIds(req);

  if (!ownedIds.includes(campaignId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Campaign with id: ${campaignId} was not found`,
    );
  }
};
