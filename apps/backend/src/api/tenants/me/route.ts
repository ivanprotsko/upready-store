import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * `GET /tenants/me` — the tenant behind the token, with its sales channel and
 * publishable key ids. Not in the recipe; added so a client (and the
 * acceptance scenario) can see which tenant it is acting as.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email", "first_name", "last_name", "tenant.*"],
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
