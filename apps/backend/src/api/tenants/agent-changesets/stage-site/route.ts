import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import ensureStageTenantWorkflow from "../../../../workflows/tenant/ensure-stage-tenant";
import { callerOf, siteLinksOf } from "../changeset-http";

/**
 * `GET`/`POST /tenants/agent-changesets/stage-site` (t-2026-10-27-04).
 *
 * `GET` answers where the live site and its stage copy are. `POST` makes the
 * stage copy if there is none (`ensure-stage-tenant`), and is a no-op after:
 * the owner's settings permission, because it creates a site.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  res.json({ sites: await siteLinksOf(req, caller.tenant_id) });
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  const { result } = await ensureStageTenantWorkflow(req.scope).run({ input: { tenant_id: caller.tenant_id } });
  res.json({ stage: result, sites: await siteLinksOf(req, caller.tenant_id) });
};
