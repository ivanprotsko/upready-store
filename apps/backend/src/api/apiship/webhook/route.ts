import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { readApishipSecret } from "../../../tenant-secrets/apiship";
import { applyApishipStatus, findApishipFulfillment } from "../../../apiship/status-sync";
import type { ApishipOrderInfo, ApishipOrderStatus } from "../../../apiship/orders";

/**
 * `POST /apiship/webhook?tenant=…&token=…` — ApiShip's callbacks
 * (t-2026-10-14-58): `ORDER_STATUS` on every new status, `ORDER_NUMBER_UPDATE`
 * when the carrier's number appears or changes.
 *
 * Top-level, next to `/cdek/webhook`, so it sits outside the publishable-key
 * gate on `/store` and outside the tenant authentication on `/tenants`: the
 * caller is the aggregator, not a browser and not an owner.
 *
 * ApiShip signs nothing. The only proof the call is genuine is the token in
 * the URL, which this backend generated per shop and handed to ApiShip itself
 * when it registered the subscription (`/tenants/apiship`, PUT). A request
 * without a token that matches a shop is answered 200 and dropped: ApiShip
 * retries a 5xx three times, and there is nothing for it to fix.
 *
 * The two bodies (OpenAPI `WebhookOrderStatusBody` and `WebhookOrderUpdateBody`):
 * `{ orderInfo, status }` for a status, and `{ eventType, orderInfo }` for a
 * number update, which carries no `status` block. Empty fields are absent, not
 * null, so every read here is tolerant and the whole payload is kept.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const token = String((req.query as Record<string, unknown>)?.token ?? "").trim();
  const tenantId = String((req.query as Record<string, unknown>)?.tenant ?? "").trim();

  // Always 200 from here on: an aggregator retrying a 5xx for a shop that is
  // gone helps nobody, and every rejection is logged for the operator instead.
  const accept = (note: string) => {
    logger?.info(`[apiship webhook] ${note}`);
    res.status(200).json({ received: true });
  };

  if (!token || !tenantId) {
    return accept("rejected: no token or tenant in the URL");
  }

  const secret = await readApishipSecret(pg, tenantId, { includeDisabled: true });
  if (!secret) {
    return accept(`rejected: no ApiShip row for tenant ${tenantId}`);
  }
  if (!secret.credentials.webhook_token || secret.credentials.webhook_token !== token) {
    return accept(`rejected: token mismatch for tenant ${tenantId}`);
  }

  const body = (req.body ?? {}) as {
    eventType?: string;
    orderInfo?: ApishipOrderInfo;
    status?: ApishipOrderStatus;
  };
  const orderId = Number(body.orderInfo?.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return accept("ignored: payload carries no orderInfo.orderId");
  }

  const fulfillment = await findApishipFulfillment(pg, { apishipOrderId: orderId, tenantId });
  if (!fulfillment) {
    return accept(`ignored: no fulfillment of tenant ${tenantId} carries apiship order ${orderId}`);
  }

  const result = await applyApishipStatus(req.scope, fulfillment, {
    orderInfo: body.orderInfo ?? { orderId },
    status: body.status ?? null,
  });
  return accept(
    `fulfillment ${fulfillment.id} ← ${body.eventType ?? "ORDER_STATUS"} ${body.status?.key ?? "(no status)"}: ${
      result.changed ? "updated" : "no change"
    }${result.shipped ? ", shipped" : ""}${result.delivered ? ", delivered" : ""}`,
  );
}
