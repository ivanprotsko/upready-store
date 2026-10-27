import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { answerRefusal, callerOf, loadChangeset, opViewsOf, siteLinksOf, summaryOf } from "../changeset-http";

/**
 * `GET /tenants/agent-changesets/:id` (t-2026-10-27-04): one changeset with
 * each op, what it changes field by field, and where to look at it on the
 * stage and the live site. `latest` is the last one published.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await loadChangeset(req, req.params.id);
    res.json({
      agent_changeset: {
        ...summaryOf(row),
        ops: await opViewsOf(req, caller, row),
        result: row.result,
      },
      sites: await siteLinksOf(req, caller.tenant_id),
    });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
