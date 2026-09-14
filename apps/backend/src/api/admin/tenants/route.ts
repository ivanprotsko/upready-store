import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import createTenantByAdminWorkflow from "../../../workflows/tenant/create-tenant-by-admin";
import { fetchTenantDetail, listTenantSummaries } from "./helpers";
import type { AdminGetTenantsParamsType, PostAdminTenantCreateBody } from "./validators";

/**
 * `GET /admin/tenants` (contract §3). Protected automatically by the
 * framework's default admin middleware (actor type `user`) the way every
 * custom route under `/admin/*` is; see `admin-tenants.spec.ts` for the
 * `401` seam test. `q`/`archived` are applied in `listTenantSummaries`
 * (in memory, see its own comment for why), so pagination here is a plain
 * slice of the already-filtered, already-sorted list.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { q, limit, offset, archived } = req.validatedQuery as AdminGetTenantsParamsType;

  const all = await listTenantSummaries(req.scope, { q, archived });

  res.status(200).json({
    tenants: all.slice(offset, offset + limit),
    count: all.length,
    offset,
    limit,
  });
};

/**
 * `POST /admin/tenants` (contract §3). Unlike `POST /tenants` (the tenant's
 * own self-registration route), the staff caller supplies a password
 * directly instead of the admin having gone through
 * `/auth/tenant/emailpass/register` first, so the workflow does that
 * registration itself (`createTenantByAdminWorkflow`).
 */
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminTenantCreateBody>, res: MedusaResponse) => {
  const { result } = await createTenantByAdminWorkflow(req.scope).run({
    input: req.validatedBody,
  });

  const tenant = await fetchTenantDetail(req.scope, result.tenant.id);

  res.status(201).json({ tenant });
};
