import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules, PaymentActions } from "@medusajs/framework/utils";
import type { IPaymentModuleService, Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows";
import {
  readRobokassaSecret,
  verifyResultSignature,
  type ResolvedRobokassaSecret,
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
 * password #2 of the shop the session belongs to, in the mode (test or live)
 * the session was created in, so the shop is resolved from the session, not
 * from anything the caller says about itself. A test invoice never pays an
 * order once the shop has been switched to live: no money moved.
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

/**
 * The shop's credentials in the mode the payment session was CREATED in (46df
 * D2). Robokassa signs the Result of a test invoice with test password #2 and
 * of a live one with password #2, for the whole life of the invoice, retries
 * included. The shop's `is_test` is the owner's switch and may have flipped
 * since the payment page was built; checking against it turned a genuine live
 * Result into `bad_signature`, money taken and no order. A session written
 * before `is_test` was stored on it falls back to the shop's mode.
 */
const secretInSessionMode = (
  secret: ResolvedRobokassaSecret,
  sessionIsTest: unknown,
): ResolvedRobokassaSecret =>
  typeof sessionIsTest === "boolean" && sessionIsTest !== secret.is_test
    ? { ...secret, is_test: sessionIsTest }
    : secret;

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
  const shopSecret = data.tenant_id
    ? await readRobokassaSecret(pg, data.tenant_id, { includeDisabled: true })
    : null;
  if (!shopSecret) {
    return reject(400, "shop_not_configured");
  }
  const secret = secretInSessionMode(shopSecret, data.is_test);
  if (!verifyResultSignature(payload, secret)) {
    return reject(400, "bad_signature");
  }
  if (secret.is_test && !shopSecret.is_test) {
    return reject(400, "test_payment_in_live_mode");
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
