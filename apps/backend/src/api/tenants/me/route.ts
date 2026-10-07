import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import updateTenantAdminWorkflow from "../../../workflows/tenant/update-tenant-admin";
import { getTenantAdminAccess } from "../tenant-admin-gate";
import type { PostTenantUpdateMeBody } from "../validators";

const TENANT_ADMIN_ME_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "role",
  "metadata",
  "tenant.*",
  "tenant.sales_channel.id",
  "tenant.sales_channel.name",
  "tenant.sales_channel.is_disabled",
  "tenant.api_key.id",
  "tenant.api_key.token",
  "tenant.api_key.redacted",
  "tenant.api_key.title",
  "tenant.api_key.type",
];

/**
 * `role` and `permissions` are what the panel builds its menu and its routes
 * from (t-2026-10-07-11); it has no table of its own. Both are the ones the
 * gate decided THIS request by, so the answer cannot disagree with what the
 * next request will be allowed.
 */
const withAccess = <Row extends Record<string, unknown>>(
  tenantAdmin: Row,
  req: AuthenticatedMedusaRequest<unknown>,
) => {
  const { role, permissions } = getTenantAdminAccess(req);

  return { ...tenantAdmin, role, permissions };
};

/**
 * `GET /tenants/me` — the tenant behind the token, with its sales channel and
 * publishable key. Not in the recipe; added so a client (and the acceptance
 * scenario) can see which tenant it is acting as. Channel and key come through
 * the tenant-sales-channel and tenant-api-key links in the same `query.graph`
 * read as the tenant itself; a channel deleted through the Admin shows up here
 * as a missing `sales_channel`, never as a dead id.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: TENANT_ADMIN_ME_FIELDS,
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  res.json({
    tenant_admin: withAccess(tenantAdmin, req),
  });
};

/**
 * `POST /tenants/me` — tenant-panel wave 2, piece 4. Updates the caller's own
 * `first_name`/`last_name`/`metadata` (the copied profile-edit form writes the
 * language choice to `metadata.language`, the panel's equivalent of the
 * Admin's `user.metadata.language`) and answers in the same shape `GET
 * /tenants/me` reads, so the panel's `useMe()` cache can be replaced from
 * either response.
 *
 * The id updated is always `req.auth_context.actor_id`, from the token, never
 * a body field: there is no tenant-admin id in this route, by design, the
 * same way `POST /tenants/me/password` has none.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantUpdateMeBody>,
  res: MedusaResponse,
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const actorId = req.auth_context.actor_id;

  await updateTenantAdminWorkflow(req.scope).run({
    input: {
      id: actorId,
      ...req.validatedBody,
    },
  });

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: TENANT_ADMIN_ME_FIELDS,
    filters: {
      id: [actorId],
    },
  });

  res.json({
    tenant_admin: withAccess(tenantAdmin, req),
  });
};
