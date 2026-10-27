import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { rollback } from "../../../../../agent-changesets/lifecycle";
import { answerRefusal, callerOf, loadChangeset, summaryOf } from "../../changeset-http";

/**
 * `POST /tenants/agent-changesets/:id/rollback` (t-2026-10-27-04): checks the live site still holds what publishing left (sha256); on a difference it answers 409 `drift` with both values and changes nothing, else it writes the snapshot back. `latest` rolls back the last one published.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await loadChangeset(req, req.params.id);
    const updated = await rollback(req.scope, caller, row);
    res.json({ agent_changeset: { ...summaryOf(updated), result: updated.result } });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
