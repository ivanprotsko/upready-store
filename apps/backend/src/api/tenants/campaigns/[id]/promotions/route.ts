import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { addOrRemoveCampaignPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedCampaign, assertOwnedPromotions } from "../../../tenant-scope";

/**
 * `POST /tenants/campaigns/:id/promotions` — adds promotions to, or removes them
 * from, one of the tenant's own campaigns. Body is the Admin's
 * `createLinkBody()`: `{ add?: string[], remove?: string[] }`.
 *
 * Both workflows address a promotion by bare id, so every id in `add` and
 * `remove` is proven to be the tenant's own before the workflow runs: adding a
 * foreign promotion would move another tenant's discount under this tenant's
 * budget, and removing one would cancel it. A foreign id answers 404, the same as
 * an id that does not exist.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ add?: string[]; remove?: string[] }>,
  res: MedusaResponse,
) => {
  const id = req.params.id;
  const { add, remove } = req.validatedBody;

  await assertOwnedCampaign(req, id);
  await assertOwnedPromotions(req, [...(add ?? []), ...(remove ?? [])]);

  await addOrRemoveCampaignPromotionsWorkflow(req.scope).run({
    input: { id, add, remove },
  });

  const campaign = await refetchEntity({
    entity: "campaign",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ campaign });
};
