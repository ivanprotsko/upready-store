import { gzipSync } from "node:zlib";
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import exportTenantWorkflow from "../../../../../workflows/tenant/export-tenant";

/**
 * `POST /admin/tenants/:id/export` — runs `exportTenantWorkflow` and streams
 * the bundle back as gzip JSON (`docs/multitenancy/admin-tenants-api-contract.md`
 * §3/§6). Protected by the framework's default admin middleware like every
 * other `/admin/*` route, no entry needed in `src/api/middlewares.ts`.
 *
 * A missing tenant surfaces as the workflow's own `NOT_FOUND`, the same `404`
 * shape `GET /admin/tenants/:id` uses.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  const { result } = await exportTenantWorkflow(req.scope).run({
    input: { tenant_id: id },
  });

  const json = JSON.stringify(result.bundle);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `tenant-${result.bundle.tenant.handle}-${dateStamp}.json.gz`;

  res.status(200);
  res.setHeader("content-type", "application/gzip");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  res.send(gz);
};
