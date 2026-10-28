import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { discard } from "../../../../../agent-changesets/lifecycle";
import { answerRefusal, callerOf, loadChangeset, summaryOf } from "../../changeset-http";

/**
 * `POST /tenants/agent-changesets/:id/discard` (t-2026-10-27-04): drops a draft or a staged changeset; a staged one's stage writes are put back.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await loadChangeset(req, req.params.id);
    const updated = await discard(req.scope, caller, row);
    res.json({ agent_changeset: { ...summaryOf(updated), result: updated.result } });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
