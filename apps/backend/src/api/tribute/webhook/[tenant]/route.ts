import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules, PaymentActions } from "@medusajs/framework/utils";
import type { IPaymentModuleService, Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows";
import { readTributeSecret, verifyTributeSignature } from "../../../../tenant-secrets/tribute";
import type { TributeSessionData } from "../../../../modules/payment-tribute/service";

const TRIBUTE_PROVIDER_ID = "pp_tribute_tribute";

/**
 * Tribute's per-shop webhook URL: `/tribute/webhook/:tenant` (t-cherk-22). The
 * owner pastes this into their Tribute Creator Dashboard (Settings → API Keys
 * → webhook settings, per `t-cherk-22/notes.md`), `:tenant` filled in with
 * their own tenant id — the "exact panel steps" the brief's report asks for.
 *
 * Why the tenant is in the PATH and chosen before anything else runs: Tribute
 * signs the webhook body with the SAME `api_key` the shop authenticates
 * `POST /shop/orders` with (`trbt-signature`, HMAC-SHA256 of the raw body), so
 * there is no way to verify the signature without first knowing whose key to
 * check it against — unlike Robokassa's Result route, which identifies the
 * shop from the payment session the signed fields already name.
 *
 * `bodyParser: { preserveRawBody: true }` (wired in `src/api/middlewares.ts`)
 * is required on this route: the signature is over the exact bytes Tribute
 * sent, not a re-serialization of the parsed JSON, which could differ in key
 * order or whitespace and would make a genuine webhook fail verification.
 *
 * Event handling (read from the OpenAPI doc, not just the wiki — see notes):
 * - `shop_order` with `payload.status === "paid"` is the ONE final event: it
 *   stamps `confirmed_at` and runs `processPaymentWorkflow` SUCCESSFUL, same
 *   role `result_confirmed_at` plays for Robokassa.
 * - `shop_order_payment_received` is INTERMEDIATE — Tribute's own docs say not
 *   to treat the order as paid on it. Recorded (`last_event`) but never
 *   confirms. The brief said to capture on this event; this diverges from the
 *   brief and follows the docs instead (flagged for the lead in notes.md and
 *   the report).
 * - `shop_order_payment_failed` is not terminal (Tribute may still retry the
 *   charge): recorded as `last_failure_at`, the session stays pending and
 *   payable.
 * - `shop_order_refunded` is acknowledged and recorded; Tribute sends it twice
 *   per transaction (initiated → completed), so this is a no-op either time
 *   beyond the log line — nothing here drives a Medusa-side refund workflow,
 *   since a refund the OWNER starts goes through `refundPayment` instead.
 * - Any other event name is acknowledged 200 without action, so a new event
 *   Tribute adds later does not turn into an endless retry storm.
 *
 * Replies `{"status":"ok"}` on 200 (what Tribute's own retry logic treats as
 * delivered) and 401 on a bad signature, as the docs specify.
 */

type TributeWebhookBody = {
  name?: string;
  created_at?: string;
  sent_at?: string;
  payload?: {
    uuid?: string;
    status?: string;
    amount?: number;
    currency?: string;
    errorCode?: string;
    transactionId?: string;
  };
};

const reject = (res: MedusaResponse, logger: Logger, status: number, reason: string, tenantId: string) => {
  logger.warn(`[tribute/webhook] rejected for tenant ${tenantId}: ${reason}`);
  res.status(status).json({ status: "error", reason });
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const tenantId = String(req.params.tenant ?? "");
  if (!tenantId) {
    return reject(res, logger, 400, "missing_tenant", "");
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readTributeSecret(pg, tenantId, { includeDisabled: true });
  if (!secret) {
    return reject(res, logger, 404, "shop_not_configured", tenantId);
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return reject(res, logger, 400, "missing_raw_body", tenantId);
  }
  const header = req.headers["trbt-signature"];
  if (!verifyTributeSignature(rawBody, secret.credentials.api_key, header)) {
    return reject(res, logger, 401, "bad_signature", tenantId);
  }

  const body = req.body as TributeWebhookBody;
  const name = body?.name;
  const orderUuid = body?.payload?.uuid;
  if (!name || !orderUuid) {
    return reject(res, logger, 400, "malformed_payload", tenantId);
  }

  const sessionRow = (await pg("payment_session")
    .select("id", "data", "amount", "currency_code")
    .where({ provider_id: TRIBUTE_PROVIDER_ID })
    .whereRaw(`"data"->>'order_uuid' = ?`, [orderUuid])
    .first()) as { id: string; data: TributeSessionData; amount: unknown; currency_code: string } | undefined;

  if (!sessionRow || sessionRow.data?.tenant_id !== tenantId) {
    return reject(res, logger, 404, "unknown_session", tenantId);
  }

  const paymentModule = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT);
  const data = sessionRow.data;

  if (name === "shop_order_payment_failed") {
    await paymentModule.updatePaymentSession({
      id: sessionRow.id,
      amount: sessionRow.amount as number,
      currency_code: sessionRow.currency_code,
      data: { ...data, last_event: name, last_failure_at: new Date().toISOString() },
    });
    logger.info(`[tribute/webhook] order ${orderUuid}: payment failed (${body.payload?.errorCode ?? "unknown"}), stays pending`);
    return res.status(200).json({ status: "ok" });
  }

  if (name === "shop_order_refunded") {
    await paymentModule.updatePaymentSession({
      id: sessionRow.id,
      amount: sessionRow.amount as number,
      currency_code: sessionRow.currency_code,
      data: { ...data, last_event: name },
    });
    logger.info(`[tribute/webhook] order ${orderUuid}: refund event acknowledged (idempotent)`);
    return res.status(200).json({ status: "ok" });
  }

  if (name === "shop_order_payment_received") {
    // Intermediate — Tribute's own docs: do not treat the order as paid yet.
    await paymentModule.updatePaymentSession({
      id: sessionRow.id,
      amount: sessionRow.amount as number,
      currency_code: sessionRow.currency_code,
      data: { ...data, last_event: name },
    });
    logger.info(`[tribute/webhook] order ${orderUuid}: payment received (intermediate), not capturing yet`);
    return res.status(200).json({ status: "ok" });
  }

  if (name === "shop_order" && body.payload?.status === "paid") {
    if (!data.confirmed_at) {
      await paymentModule.updatePaymentSession({
        id: sessionRow.id,
        amount: sessionRow.amount as number,
        currency_code: sessionRow.currency_code,
        data: { ...data, last_event: name, confirmed_at: new Date().toISOString() },
      });
      logger.info(`[tribute/webhook] order ${orderUuid}: confirmed paid, tenant ${tenantId}`);

      try {
        await processPaymentWorkflow(req.scope).run({
          input: {
            action: PaymentActions.SUCCESSFUL,
            data: { session_id: sessionRow.id, amount: Number(sessionRow.amount) },
          },
        });
      } catch (error) {
        logger.error(
          `[tribute/webhook] order ${orderUuid} confirmed but the cart could not be completed: ${
            (error as Error).message
          }`,
        );
        return res.status(500).json({ status: "error", reason: "completion_failed" });
      }
    } else {
      logger.info(`[tribute/webhook] replay of already-confirmed order ${orderUuid}, answering ok again`);
    }
    return res.status(200).json({ status: "ok" });
  }

  // Unrecognized, or `shop_order` with a non-final status: acknowledged, no action.
  logger.info(`[tribute/webhook] order ${orderUuid}: event ${name} (status ${body.payload?.status ?? "-"}) — no action`);
  res.status(200).json({ status: "ok" });
};
