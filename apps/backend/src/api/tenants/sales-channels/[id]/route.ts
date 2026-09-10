import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/sales-channels/:id` — the tenant's own channel by id. Any
 * other id, another tenant's channel included, answers 404, so the response
 * never confirms that a foreign channel exists.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);

  const notFound = new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Sales channel with id "${req.params.id}" was not found`,
  );

  if (tenant.sales_channel_id !== req.params.id) {
    throw notFound;
  }

  const salesChannel = await refetchEntity({
    entity: "sales_channel",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  if (!salesChannel) {
    throw notFound;
  }

  res.status(200).json({ sales_channel: salesChannel });
};
