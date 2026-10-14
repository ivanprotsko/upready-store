import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { syncApishipStatuses } from "../../../../apiship/status-sync";
import { getTenantScope, listTenantOrderIds } from "../../tenant-scope";
import type { PostTenantApishipStatusSyncBody } from "../../validators";

/**
 * `POST /tenants/apiship/status-sync` — pull the statuses of the shop's open
 * ApiShip shipments now, the «Обновить статус» of the order card
 * (t-2026-10-14-58, checklist 5). The same function the ten-minute job and
 * the webhook run; a status applied by one road is a no-op for the others.
 *
 * `order_ids` narrows the pull to the shipments of those orders (the caller's
 * own, else 404); without it every open shipment of the shop is asked for.
 */
type OrderRow = { id: string; fulfillments?: Array<{ id: string }> };

export const POST = async (req: AuthenticatedMedusaRequest<PostTenantApishipStatusSyncBody>, res: MedusaResponse) => {
  const body = req.validatedBody ?? {};
  const tenant = await getTenantScope(req);

  let fulfillmentIds: string[] | undefined;
  if (body.order_ids?.length) {
    const owned = new Set(await listTenantOrderIds(req));
    const foreign = body.order_ids.filter((id) => !owned.has(id));
    if (foreign.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${foreign[0]}" was not found`);
    }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "fulfillments.id"],
      filters: { id: body.order_ids },
    });
    fulfillmentIds = (orders as unknown as OrderRow[]).flatMap((order) => (order.fulfillments ?? []).map((f) => f.id));
    if (body.fulfillment_ids?.length) {
      fulfillmentIds = fulfillmentIds.filter((id) => body.fulfillment_ids!.includes(id));
    }
    if (!fulfillmentIds.length) {
      res.json({ tenants: 0, checked: 0, updated: 0, shipped: 0, delivered: 0, failed: 0, results: [] });
      return;
    }
  }

  const summary = await syncApishipStatuses(req.scope, { tenantId: tenant.id, fulfillmentIds });
  res.json(summary);
};
