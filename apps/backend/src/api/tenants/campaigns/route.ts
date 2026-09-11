import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities, refetchEntity } from "@medusajs/framework/http";
import type { CreateCampaignDTO, HttpTypes } from "@medusajs/framework/types";
import createTenantCampaignWorkflow from "../../../workflows/tenant/create-tenant-campaign";
import {
  emptyPage,
  getTenantScope,
  listTenantCampaignIds,
  scopeIdFilter,
} from "../tenant-scope";

/**
 * `GET /tenants/campaigns` — the campaigns the tenant created, in the Admin's
 * list shape. Scope is the tenant-campaign link, intersected with any `id` the
 * caller asked for; an empty intersection is an empty page, never an unfiltered
 * query.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantCampaignIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ campaigns: [], ...emptyPage(req) });
    return;
  }

  const { data: campaigns, metadata } = await refetchEntities({
    entity: "campaign",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
    withDeleted: req.queryConfig.withDeleted,
  });

  res.json({
    campaigns,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};

/**
 * `POST /tenants/campaigns` — creates a campaign owned by the tenant and records
 * the tenant-campaign link, which is the only thing that makes it visible to
 * `GET /tenants/campaigns` afterwards.
 *
 * A campaign carries no sales channel of its own, so there is nothing to confine
 * the way a promotion is confined: what a campaign discounts is decided by the
 * promotions inside it, and each of those is pinned to the tenant's own channel
 * by `POST /tenants/promotions`. The Admin's `CreateCampaign` body is `.strict()`
 * and declares no `promotions` key, so a campaign is always created empty and
 * filled through `POST /tenants/campaigns/:id/promotions`, which checks ownership
 * of every promotion id it is handed.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateCampaign>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);

  const { additional_data, ...rest } = req.validatedBody as HttpTypes.AdminCreateCampaign & {
    additional_data?: Record<string, unknown>;
  };

  // Same enum-versus-string-union cast `POST /tenants/promotions` explains.
  const campaignPayload = rest as unknown as CreateCampaignDTO;

  const { result } = await createTenantCampaignWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, campaign: campaignPayload, additional_data },
    context: { requestId: req.requestId },
  });

  const campaign = await refetchEntity({
    entity: "campaign",
    idOrFilter: result.campaign_id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ campaign });
};
