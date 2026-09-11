import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import deleteTenantDomainWorkflow from "../../../../workflows/tenant/delete-tenant-domain";
import { getTenantWithDomains } from "../helpers";

/**
 * `DELETE /tenants/domains/:id` → `{ id, object: "domain", deleted: true }`
 * (tenant-panel wave 2, piece 9).
 *
 * Ownership is decided by the tenant's own list of rows, read through the
 * tenant relation, never by trusting the id. A row that belongs to another
 * tenant answers 404 — the same answer a missing id gets, so the response never
 * tells one tenant that another holds that host.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const tenant = await getTenantWithDomains(req);

  if (!tenant.domains.some((domain) => domain.id === id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Domain with id "${id}" was not found`);
  }

  await deleteTenantDomainWorkflow(req.scope).run({ input: { id } });

  res.json({ id, object: "domain", deleted: true });
};
