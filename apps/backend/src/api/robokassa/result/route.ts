import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules, PaymentActions } from "@medusajs/framework/utils";
import type { IPaymentModuleService, Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows";
import {
  readRobokassaSecret,
  verifyResultSignature,
  type RobokassaResultPayload,
} from "../../../tenant-secrets/robokassa";
import type { RobokassaSessionData } from "../../../modules/payment-robokassa/service";

/**
 * Robokassa's Result URL (`/robokassa/result`, t03-tenant-secrets-robokassa).
 *
 * This is the ONE place a payment becomes «paid». Robokassa calls it
 * server-to-server after the customer pays, with
 * `OutSum`, `InvId`, `SignatureValue` and every `Shp_*` the payment URL
 * carried. The signature is `OutSum:InvId:Password#2:Shp_SessionID=<id>`,
 * password #2 (the test one in test mode) of the shop the session belongs to,
 * so the shop is resolved from the session, not from anything the caller
 * says about itself.
 *
 * On a valid signature the session is stamped with `result_confirmed_at`
 * through the provider's `updatePayment`, and `processPaymentWorkflow` runs
 * with `SUCCESSFUL`: it authorizes the session (the provider answers CAPTURED
 * once stamped), captures the payment and completes the cart into an order.
 * The browser return (`SuccessUrl2`, storefront `api/payment-return`) never
 * marks anything; it only reads the order that this route produced.
 *
 * Robokassa expects the literal body `OK<InvId>` and keeps retrying otherwise,
 * so a replay of an already confirmed invoice answers `OK` again (idempotent),
 * while a bad signature, an unknown session or a sum mismatch answer 400 with
 * a short reason and are logged for the operator.
 *
 * No publishable key and no session: the route lives outside `/store` on
 * purpose, the way `/storefront/by-host` does.
 */

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length ? value : typeof value === "number" ? String(value) : undefined;

const payloadFrom = (req: MedusaRequest): RobokassaResultPayload => {
  const source = (req.method === "GET" ? req.query : req.body) as Record<string, unknown>;
  return {
    OutSum: text(source?.OutSum),
    InvId: text(source?.InvId),
    SignatureValue: text(source?.SignatureValue),
    Shp_SessionID: text(source?.Shp_SessionID),
  };
};

const handle = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const payload = payloadFrom(req);
  const reject = (status: number, reason: string) => {
    logger.warn(
      `[robokassa/result] rejected: ${reason} (InvId=${payload.InvId ?? "-"}, session=${payload.Shp_SessionID ?? "-"})`,
    );
    res.status(status).type("text/plain").send(`ERROR ${reason}`);
  };

  if (!payload.OutSum || !payload.InvId || !payload.SignatureValue || !payload.Shp_SessionID) {
    return reject(400, "missing_params");
  }

  const paymentModule = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT);
  const [session] = await paymentModule.listPaymentSessions(
    { id: [payload.Shp_SessionID] },
    { select: ["id", "provider_id", "data", "amount", "currency_code", "status"] },
  );
  if (!session || session.provider_id !== "pp_robokassa_robokassa") {
    return reject(400, "unknown_session");
  }

  const data = (session.data ?? {}) as Partial<RobokassaSessionData>;
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = data.tenant_id ? await readRobokassaSecret(pg, data.tenant_id, { includeDisabled: true }) : null;
  if (!secret) {
    return reject(400, "shop_not_configured");
  }
  if (!verifyResultSignature(payload, secret)) {
    return reject(400, "bad_signature");
  }
  if (payload.InvId !== data.invoice_id || payload.OutSum !== data.out_sum) {
    return reject(400, "invoice_mismatch");
  }

  if (!data.result_confirmed_at) {
    await paymentModule.updatePaymentSession({
      id: session.id,
      amount: session.amount,
      currency_code: session.currency_code,
      data: {
        ...data,
        result_confirmed_at: new Date().toISOString(),
        result_out_sum: payload.OutSum,
      },
    });
    logger.info(
      `[robokassa/result] confirmed: session ${session.id}, invoice ${payload.InvId}, ${payload.OutSum} RUB, tenant ${secret.tenant_id}, test=${secret.is_test}`,
    );
  } else {
    logger.info(`[robokassa/result] replay of confirmed invoice ${payload.InvId}, answering OK again`);
  }

  try {
    await processPaymentWorkflow(req.scope).run({
      input: {
        action: PaymentActions.SUCCESSFUL,
        data: { session_id: session.id, amount: Number(payload.OutSum) },
      },
    });
  } catch (error) {
    // The confirmation is already on the session, so the browser return can
    // still complete the cart; a non-OK answer makes Robokassa retry, which is
    // one more chance for the order to be created server-side.
    logger.error(
      `[robokassa/result] confirmed invoice ${payload.InvId} but the cart could not be completed: ${(error as Error).message}`,
    );
    return res.status(500).type("text/plain").send("ERROR completion_failed");
  }

  res.type("text/plain").send(`OK${payload.InvId}`);
};

export const POST = handle;
export const GET = handle;
