import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { applyToStage } from "../../../../../agent-changesets/lifecycle";
import { answerRefusal, callerOf, loadChangeset, summaryOf } from "../../changeset-http";

/**
 * `POST /tenants/agent-changesets/:id/stage` (t-2026-10-27-04): writes a draft's ops to the stage site; product ops are shown there by the Store overlay instead (`agent-changesets/overlay.ts`).
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const caller = callerOf(req);
  try {
    const row = await loadChangeset(req, req.params.id);
    const updated = await applyToStage(req.scope, caller, row);
    res.json({ agent_changeset: { ...summaryOf(updated), result: updated.result } });
  } catch (error) {
    if (!answerRefusal(res, error)) throw error;
  }
};
