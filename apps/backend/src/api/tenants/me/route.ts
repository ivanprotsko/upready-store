import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

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
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "tenant.*",
      "tenant.sales_channel.id",
      "tenant.sales_channel.name",
      "tenant.sales_channel.is_disabled",
      "tenant.api_key.id",
      "tenant.api_key.token",
      "tenant.api_key.redacted",
      "tenant.api_key.title",
      "tenant.api_key.type",
    ],
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
    tenant_admin: tenantAdmin,
  });
};
