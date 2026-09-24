import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * `GET /tenants/me/shops` (o25-platform-admin-all-shops): every tenant the
 * caller's own email has a `tenant_admin` row in, id/name/handle only — the
 * panel's shop switcher hides itself when this comes back with one shop or
 * fewer. Most tenant admins have exactly one row and see a list of one; the
 * platform admin (`PLATFORM_ADMIN_EMAIL`) has a row in every shop and sees
 * all of them.
 *
 * The email is read off the caller's OWN row (`req.auth_context.actor_id`),
 * never off the request, so this can never be turned into a lookup for
 * someone else's shops.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [caller],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email"],
    filters: { id: [req.auth_context.actor_id] },
  });

  if (!caller) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  const { data: rows } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.name", "tenant.handle"],
    filters: { email: [caller.email as string] },
  });

  const shops = rows
    .filter((row) => Boolean(row.tenant?.id))
    .map((row) => ({
      id: row.tenant!.id as string,
      name: row.tenant!.name as string,
      handle: row.tenant!.handle as string,
    }));

  res.json({ shops });
};
