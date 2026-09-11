import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes, UpdateCampaignDTO } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { updateCampaignsWorkflow } from "@medusajs/medusa/core-flows";
import deleteTenantCampaignWorkflow from "../../../../workflows/tenant/delete-tenant-campaign";
import { assertOwnedCampaign } from "../../tenant-scope";

/**
 * `GET /tenants/campaigns/:id` — one of the tenant's own campaigns. A campaign
 * another tenant created is a 404, identical to an id that does not exist.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const id = req.params.id;

  await assertOwnedCampaign(req, id);

  const campaign = await refetchEntity({
    entity: "campaign",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  if (!campaign) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Campaign with id: ${id} was not found`);
  }

  res.status(200).json({ campaign });
};

/** `POST /tenants/campaigns/:id` — updates one of the tenant's own campaigns. */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdateCampaign>,
  res: MedusaResponse,
) => {
  const id = req.params.id;

  await assertOwnedCampaign(req, id);

  const { additional_data, ...rest } = req.validatedBody as HttpTypes.AdminUpdateCampaign & {
    additional_data?: Record<string, unknown>;
  };

  // Same enum-versus-string-union cast `POST /tenants/promotions` explains.
  const campaignsData = [{ id, ...rest }] as unknown as UpdateCampaignDTO[];

  await updateCampaignsWorkflow(req.scope).run({
    input: { campaignsData, additional_data },
  });

  const campaign = await refetchEntity({
    entity: "campaign",
    idOrFilter: id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ campaign });
};

/**
 * `DELETE /tenants/campaigns/:id` — deletes one of the tenant's own campaigns and
 * the tenant-campaign link with it. `deleteCampaignsWorkflow` carries no
 * `removeRemoteLinkStep`, so the wrapper workflow adds one; otherwise
 * `tenant.campaigns` would keep handing a deleted id to every list.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const id = req.params.id;

  await assertOwnedCampaign(req, id);

  await deleteTenantCampaignWorkflow(req.scope).run({ input: { campaign_id: id } });

  res.status(200).json({
    id,
    object: "campaign",
    deleted: true,
  });
};
