import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { RuleType } from "@medusajs/framework/utils";
import { batchPromotionRulesWorkflow } from "@medusajs/medusa/core-flows";
import { refetchBatchRules } from "@medusajs/medusa/api/admin/promotions/helpers";
import { assertOwnedPromotion } from "../../../../tenant-scope";
import { toRuleBatchInput, type PromotionRuleBatchBody } from "../../../helpers";

/**
 * `POST /tenants/promotions/:id/buy-rules/batch` — mirrors
 * `POST /admin/promotions/:id/buy-rules/batch` behind the ownership check.
 *
 * The forced `sales_channel_id` rule is not guarded here, and does not need to
 * be: buy rules select which line items inside an already qualifying cart the
 * discount lands on, so nothing written through this route can move the
 * promotion into another tenant's sales channel.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PromotionRuleBatchBody>,
  res: MedusaResponse,
) => {
  const id = req.params.id;

  await assertOwnedPromotion(req, id);

  const { result } = await batchPromotionRulesWorkflow(req.scope).run({
    input: toRuleBatchInput(id, RuleType.BUY_RULES, req.validatedBody),
  });

  const batchResults = await refetchBatchRules(result, req.scope, req.queryConfig.fields);

  res.status(200).json(batchResults);
};
