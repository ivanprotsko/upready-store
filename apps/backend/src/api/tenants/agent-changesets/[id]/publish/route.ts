import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { publish } from "../../../../../agent-changesets/lifecycle";
import { answerRefusal, callerOf, loadChangeset, summaryOf } from "../../changeset-http";

/**
 * `POST /tenants/agent-changesets/:id/publish` (t-2026-10-27-04): snapshots what the ops will change on the live site, applies them, and records a sha256 of each result.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await loadChangeset(req, req.params.id);
    const updated = await publish(req.scope, caller, row);
    res.json({ agent_changeset: { ...summaryOf(updated), result: updated.result } });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
