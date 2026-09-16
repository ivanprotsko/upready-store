import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService, Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { readCdekSecret } from "../../../tenant-secrets/cdek";
import {
  CDEK_DELIVERED_STATUSES,
  CDEK_SHIPPED_STATUSES,
  type CdekStatusEntry,
} from "../../../cdek/statuses";

/**
 * `POST /cdek/webhook?token=…` — CDEK's ORDER_STATUS callback
 * (i02-apiship-cdek-shipping).
 *
 * Top-level, next to `/robokassa/result`, so it sits outside the publishable-key
 * gate on `/store` and outside the tenant authentication on `/tenants`: the
 * caller is a carrier, not a browser and not an owner.
 *
 * CDEK signs nothing. The only proof the call is genuine is the token in the
 * URL, which this backend generated per shop and handed to CDEK itself when it
 * registered the subscription (`registerCdekWebhook`). A request without a token
 * that matches a shop is answered 200 and dropped: CDEK retries a non-2xx for
 * hours, and there is nothing for it to fix.
 *
 * The body CDEK posts (documented shape, and what the registration asks for):
 * `{ type: "ORDER_STATUS", date_time, uuid, attributes: { cdek_number, code,
 * status_code?, status_date_time?, is_return } }`. Field names differ between
 * CDEK's own docs and its live payloads, so every read here is tolerant and the
 * whole payload is kept.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const token = String((req.query as Record<string, unknown>)?.token ?? "").trim();
  const tenantId = String((req.query as Record<string, unknown>)?.tenant ?? "").trim();

  // Always 200 from here on: a carrier retrying a 4xx for a shop that is gone
  // helps nobody, and every rejection is logged for the operator instead.
  const accept = (note: string) => {
    logger?.info(`[cdek webhook] ${note}`);
    res.status(200).json({ received: true });
  };

  if (!token || !tenantId) {
    return accept("rejected: no token or tenant in the URL");
  }

  const secret = await readCdekSecret(pg, tenantId, { includeDisabled: true });
  if (!secret) {
    return accept(`rejected: no CDEK row for tenant ${tenantId}`);
  }
  if (!secret.credentials.webhook_token || secret.credentials.webhook_token !== token) {
    return accept(`rejected: token mismatch for tenant ${tenantId}`);
  }

  const body = (req.body ?? {}) as {
    type?: string;
    date_time?: string;
    uuid?: string;
    attributes?: Record<string, unknown>;
  };
  const attributes = body.attributes ?? {};
  // CDEK puts the order's uuid at the top level of the callback; the
  // `attributes` carry the human-facing number and the status.
  const orderUuid = typeof body.uuid === "string" ? body.uuid : null;
  const statusCode = String(attributes.status_code ?? attributes.code ?? "").toUpperCase();
  const statusAt = String(attributes.status_date_time ?? body.date_time ?? new Date().toISOString());
  const cdekNumber = attributes.cdek_number ? String(attributes.cdek_number) : null;

  if (body.type && body.type !== "ORDER_STATUS") {
    return accept(`ignored: type ${body.type}`);
  }
  if (!orderUuid) {
    return accept("ignored: payload carries no order uuid");
  }

  const row = (await pg("fulfillment")
    .select("id", "data")
    .whereRaw("data->>'cdek_order_uuid' = ?", [orderUuid])
    .whereNull("deleted_at")
    .first()) as { id: string; data: Record<string, unknown> | null } | undefined;

  if (!row) {
    return accept(`ignored: no fulfillment carries cdek_order_uuid ${orderUuid}`);
  }

  const previous = (row.data ?? {}) as Record<string, unknown>;
  const history = Array.isArray(previous.cdek_statuses)
    ? (previous.cdek_statuses as CdekStatusEntry[])
    : [];
  const entry: CdekStatusEntry = { code: statusCode, at: statusAt, raw: attributes };

  const fulfillmentModule = req.scope.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
  const update: Record<string, unknown> = {
    data: {
      ...previous,
      cdek_number: cdekNumber ?? previous.cdek_number ?? null,
      cdek_status: statusCode,
      cdek_status_at: statusAt,
      cdek_statuses: [...history, entry].slice(-50),
    },
  };
  if (CDEK_SHIPPED_STATUSES.has(statusCode)) {
    update.shipped_at = new Date(statusAt);
  }
  if (CDEK_DELIVERED_STATUSES.has(statusCode)) {
    update.delivered_at = new Date(statusAt);
  }

  await fulfillmentModule.updateFulfillment(row.id, update);
  return accept(`fulfillment ${row.id} → ${statusCode || "(no code)"}`);
}
