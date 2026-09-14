import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GET as adminRuleTypeGET } from "@medusajs/medusa/api/admin/promotions/[id]/[rule_type]/route";
import { assertOwnedPromotion } from "../../../tenant-scope";

/**
 * `GET /tenants/promotions/:id/:rule_type` — the rules of one of the tenant's own
 * promotions, labelled, which is what the copied edit-rules drawers read.
 *
 * The handler is the Admin's own: it turns stored rules plus the
 * "disguised" application-method fields into one uniform list and resolves every
 * value id to a human label through `ruleQueryConfigurations`. Reimplementing
 * that here would be a second copy of ~80 lines whose only job is to stay
 * identical, so the ownership check runs first and the Admin's handler runs
 * second. A foreign `:id` is a 404 before the rule type is even validated.
 *
 * The labels the Admin resolves are global reference data (region names, channel
 * names, currency names), not another tenant's rows, and the only channel id this
 * promotion can carry is the tenant's own.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedPromotion(req, req.params.id);

  await adminRuleTypeGET(req as never, res);
};
