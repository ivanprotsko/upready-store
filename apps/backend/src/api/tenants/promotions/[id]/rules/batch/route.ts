import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { RuleType } from "@medusajs/framework/utils";
import { batchPromotionRulesWorkflow } from "@medusajs/medusa/core-flows";
import { refetchBatchRules } from "@medusajs/medusa/api/admin/promotions/helpers";
import { assertOwnedPromotion } from "../../../../tenant-scope";
import {
  assertChannelRuleNotTouched,
  toRuleBatchInput,
  type PromotionRuleBatchBody,
} from "../../../helpers";

/**
 * `POST /tenants/promotions/:id/rules/batch` — the promotion's own rules, the
 * ones that decide whether a cart qualifies at all.
 *
 * Two checks run before the workflow. Ownership, as everywhere in `/tenants/*`,
 * and then the forced `sales_channel_id` rule: it may not be deleted, updated or
 * duplicated, because each of those is a way for the promotion to leave the
 * tenant's sales channel (see `assertChannelRuleNotTouched`). Everything else
 * behaves exactly as `POST /admin/promotions/:id/rules/batch`.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PromotionRuleBatchBody>,
  res: MedusaResponse,
) => {
  const id = req.params.id;

  await assertOwnedPromotion(req, id);
  await assertChannelRuleNotTouched(req, id, req.validatedBody);

  const { result } = await batchPromotionRulesWorkflow(req.scope).run({
    input: toRuleBatchInput(id, RuleType.RULES, req.validatedBody),
  });

  const batchResults = await refetchBatchRules(result, req.scope, req.queryConfig.fields);

  res.status(200).json(batchResults);
};
