import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes, UpdatePromotionDTO } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { updatePromotionsWorkflow } from "@medusajs/medusa/core-flows";
import deleteTenantPromotionWorkflow from "../../../../workflows/tenant/delete-tenant-promotion";
import { assertOwnedCampaign, assertOwnedPromotion, listTenantPromotionIds } from "../../tenant-scope";

const promotionNotFound = (idOrCode: string) =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Promotion with id or code: ${idOrCode} was not found`,
  );

/**
 * `GET /tenants/promotions/:id` — one of the tenant's own promotions. The Admin
 * accepts an id or a code in this position and so does this route, which is why
 * ownership is decided after the lookup rather than before: a code the tenant
 * does not own resolves to a promotion whose id is not in the owned set, and
 * that is a 404 with the same wording as an id that does not exist.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const idOrCode = req.params.id;
  const ownedIds = await listTenantPromotionIds(req);

  if (ownedIds.length === 0) {
    throw promotionNotFound(idOrCode);
  }

  const promotion = await refetchEntity({
    entity: "promotion",
    idOrFilter: { $or: [{ id: idOrCode }, { code: idOrCode }], id: ownedIds },
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  if (!promotion) {
    throw promotionNotFound(idOrCode);
  }

  res.status(200).json({ promotion });
};

/**
 * `POST /tenants/promotions/:id` — updates one of the tenant's own promotions.
 * The Admin's `UpdatePromotion` body carries no `rules`, so this verb cannot
 * touch the forced `sales_channel_id` rule; rules are written through
 * `rules/batch`, which guards it. `campaign_id` still has to name a campaign the
 * tenant owns.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdatePromotion>,
  res: MedusaResponse,
) => {
  const id = req.params.id;

  await assertOwnedPromotion(req, id);

  const { additional_data, ...rest } = req.validatedBody as HttpTypes.AdminUpdatePromotion & {
    additional_data?: Record<string, unknown>;
  };

  if (rest.campaign_id) {
    await assertOwnedCampaign(req, rest.campaign_id);
  }

  // Same enum-versus-string-union cast the create route explains.
  const promotionsData = [{ id, ...rest }] as unknown as UpdatePromotionDTO[];

  await updatePromotionsWorkflow(req.scope).run({
    input: { promotionsData, additional_data },
  });

  const promotion = await refetchEntity({
    entity: "promotion",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ promotion });
};

/**
 * `DELETE /tenants/promotions/:id` — deletes one of the tenant's own promotions
 * and the tenant-promotion link with it (`deletePromotionsWorkflow` alone leaves
 * the link behind; see the workflow's own comment). A foreign id is a 404 and
 * deletes nothing.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const id = req.params.id;

  await assertOwnedPromotion(req, id);

  await deleteTenantPromotionWorkflow(req.scope).run({ input: { promotion_id: id } });

  res.status(200).json({
    id,
    object: "promotion",
    deleted: true,
  });
};
