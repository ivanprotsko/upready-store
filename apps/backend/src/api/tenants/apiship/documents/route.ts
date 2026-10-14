import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { getLabels, getWaybills, type ApishipFailedOrder } from "../../../../apiship/orders";
import { isApishipShippingMethodData } from "../../../../apiship/method";
import { carrierLabel } from "../../../../apiship/carriers";
import { apishipApiCredentials, readApishipSecret } from "../../../../tenant-secrets/apiship";
import { getTenantScope, listTenantOrderIds } from "../../tenant-scope";
import type { PostTenantApishipDocumentsBody } from "../../validators";

/**
 * `POST /tenants/apiship/documents` — the labels or the hand-over acts of one
 * or many of the shop's orders, as files ApiShip generated (t-2026-10-14-58,
 * checklist 3 and 4).
 *
 * `kind: "labels"` answers ONE PDF for every order given (`POST /orders/labels`);
 * `kind: "waybills"` answers one act PER CARRIER among them (`POST /orders/waybills`),
 * because a hand-over act is signed with one carrier. The answer lists the
 * files with their ApiShip storage link and, for each, a download road through
 * this backend (`GET /tenants/apiship/documents/file?url=…`) that sets the
 * file name and keeps the panel on one origin.
 *
 * What cannot be made is said per order, in ApiShip's own words (measured on
 * the test contour: «Заказ не был передан в СД» for an order the carrier has
 * not accepted yet), so a batch of ten with one laggard still yields nine
 * labels and names the tenth.
 *
 * Only the caller's own orders are read: every id outside `listTenantOrderIds`
 * answers 404, never a foreign shop's label.
 */
type FulfillmentRow = {
  id: string;
  data: Record<string, unknown> | null;
  canceled_at: Date | null;
};

type OrderRow = { id: string; display_id: string | number; fulfillments?: FulfillmentRow[] };

export const POST = async (req: AuthenticatedMedusaRequest<PostTenantApishipDocumentsBody>, res: MedusaResponse) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const owned = new Set(await listTenantOrderIds(req));
  const foreign = body.order_ids.filter((id) => !owned.has(id));
  if (foreign.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${foreign[0]}" was not found`);
  }

  const api = apishipApiCredentials(await readApishipSecret(pg, tenant.id));
  if (!api) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "ApiShip не подключён в этом магазине");
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "fulfillments.id", "fulfillments.data", "fulfillments.canceled_at"],
    filters: { id: body.order_ids },
  });

  // Every live ApiShip shipment of the orders asked for, with the order it belongs to.
  const shipments: Array<{ order_id: string; display_id: string; fulfillment_id: string; apiship_order_id: number; provider_key: string }> = [];
  const withoutShipment: string[] = [];
  for (const order of orders as unknown as OrderRow[]) {
    const mine = (order.fulfillments ?? []).filter(
      (fulfillment) =>
        !fulfillment.canceled_at &&
        isApishipShippingMethodData(fulfillment.data) &&
        Number(fulfillment.data.apiship_order_id) > 0 &&
        (!body.fulfillment_ids?.length || body.fulfillment_ids.includes(fulfillment.id)),
    );
    if (!mine.length) {
      withoutShipment.push(order.id);
      continue;
    }
    for (const fulfillment of mine) {
      const data = fulfillment.data as { apiship_order_id?: number; provider_key?: string };
      shipments.push({
        order_id: order.id,
        display_id: String(order.display_id),
        fulfillment_id: fulfillment.id,
        apiship_order_id: Number(data.apiship_order_id),
        provider_key: String(data.provider_key ?? ""),
      });
    }
  }
  if (!shipments.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "У выбранных заказов нет отправок через ApiShip: сначала оформите отправку на карточке заказа.",
    );
  }

  const ids = shipments.map((shipment) => shipment.apiship_order_id);
  const describeFailed = (failed: ApishipFailedOrder[]) =>
    failed.map((entry) => {
      const shipment = shipments.find((candidate) => candidate.apiship_order_id === Number(entry.orderId));
      return {
        order_id: shipment?.order_id ?? null,
        display_id: shipment?.display_id ?? null,
        fulfillment_id: shipment?.fulfillment_id ?? null,
        apiship_order_id: Number(entry.orderId),
        message: entry.message,
      };
    });
  const fileRoad = (url: string) => `/tenants/apiship/documents/file?url=${encodeURIComponent(url)}`;

  if (body.kind === "labels") {
    const answer = await getLabels(api, ids);
    const made = shipments.filter((shipment) => !answer.failedOrders.some((entry) => Number(entry.orderId) === shipment.apiship_order_id));
    res.json({
      kind: "labels",
      files: answer.url
        ? [
            {
              provider_key: null,
              label: "Наклейки",
              url: answer.url,
              download: fileRoad(answer.url),
              order_ids: made.map((shipment) => shipment.order_id),
              display_ids: made.map((shipment) => shipment.display_id),
            },
          ]
        : [],
      failed: describeFailed(answer.failedOrders),
      without_shipment: withoutShipment,
    });
    return;
  }

  const answer = await getWaybills(api, ids, body.format ?? "pdf");
  res.json({
    kind: "waybills",
    files: answer.waybills.map((waybill) => {
      const made = shipments.filter((shipment) => waybill.orderIds.includes(shipment.apiship_order_id));
      return {
        provider_key: waybill.providerKey,
        label: `Акт приёма-передачи — ${carrierLabel(waybill.providerKey)}`,
        url: waybill.file,
        download: fileRoad(waybill.file),
        order_ids: made.map((shipment) => shipment.order_id),
        display_ids: made.map((shipment) => shipment.display_id),
      };
    }),
    failed: describeFailed(answer.failedOrders),
    without_shipment: withoutShipment,
  });
};
