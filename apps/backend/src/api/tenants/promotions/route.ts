import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities, refetchEntity } from "@medusajs/framework/http";
import type { CreatePromotionDTO, HttpTypes } from "@medusajs/framework/types";
import createTenantPromotionWorkflow from "../../../workflows/tenant/create-tenant-promotion";
import {
  assertOwnedCampaign,
  emptyPage,
  listTenantCampaignIds,
  listTenantPromotionIds,
  scopeIdFilter,
} from "../tenant-scope";
import { forceChannelRule, requireTenantChannel, type PromotionRuleInput } from "./helpers";

/**
 * `GET /tenants/promotions` — the promotions the tenant created, in the Admin's
 * list shape, so the copied promotion list renders unchanged. Isolation is the
 * `id` constraint from the tenant-promotion link, intersected with any `id` the
 * caller asked for; an empty intersection answers an empty page rather than an
 * undefined `id` filter, which would be no filter at all.
 *
 * The Admin's route reads through `remoteQuery`; this one goes through
 * `refetchEntities`, the wrapper every other `/tenants/*` list uses, which
 * returns the same rows and the same `metadata.count/skip/take`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantPromotionIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ promotions: [], ...emptyPage(req) });
    return;
  }

  const { data: promotions, metadata } = await refetchEntities({
    entity: "promotion",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
    withDeleted: req.queryConfig.withDeleted,
  });

  res.json({
    promotions,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};

/**
 * `POST /tenants/promotions` — creates a promotion owned by the tenant and
 * confined to the tenant's sales channel.
 *
 * The confinement is a promotion rule, not a column: the promotion module
 * decides whether a cart qualifies by evaluating the rules, and the attribute
 * that names a channel is `sales_channel_id` (measured on this backend, see
 * `helpers.ts`). The route adds that rule when the body has none and replaces
 * it when the body names another channel, so a tenant cannot write a promotion
 * that discounts carts in another tenant's storefront. `rules/batch` then
 * refuses to remove or alter it.
 *
 * `campaign_id` in the body has to name a campaign the tenant owns (a foreign
 * id is a 404, same as a missing one). A campaign created inline through the
 * `campaign` key becomes the tenant's own and gets the tenant-campaign link,
 * because nothing else would ever claim it.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreatePromotion>,
  res: MedusaResponse,
) => {
  const tenant = await requireTenantChannel(req);

  const { additional_data, ...rest } = req.validatedBody as HttpTypes.AdminCreatePromotion & {
    additional_data?: Record<string, unknown>;
    rules?: PromotionRuleInput[];
  };

  if (rest.campaign_id) {
    await assertOwnedCampaign(req, rest.campaign_id);
  }

  const ownedCampaignIds = await listTenantCampaignIds(req);

  // The validated Admin body and the workflow's `CreatePromotionDTO` describe
  // the same payload with different enum types (zod natives vs the module's
  // string unions), which is the one cast the Admin's own JS route never has
  // to write down.
  const promotionPayload = {
    ...rest,
    rules: forceChannelRule(rest.rules, tenant.sales_channel_id),
  } as unknown as CreatePromotionDTO;

  const { result } = await createTenantPromotionWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      promotion: promotionPayload,
      owned_campaign_ids: ownedCampaignIds,
      additional_data,
    },
  });

  const promotion = await refetchEntity({
    entity: "promotion",
    idOrFilter: result.promotion_id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ promotion });
};
