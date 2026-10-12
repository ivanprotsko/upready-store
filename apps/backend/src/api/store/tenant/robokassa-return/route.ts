import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type { IPaymentModuleService, Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { readRobokassaSecret } from "../../../../tenant-secrets/robokassa";
import type { RobokassaSessionData } from "../../../../modules/payment-robokassa/build-session";
import { askRobokassaOpState } from "../../../../modules/payment-robokassa/op-state";
import { checkRobokassaReturn, type RobokassaReturnParams } from "../../../../modules/payment-robokassa/return-check";
import { ROBOKASSA_PROVIDER_ID, tenantOrNull } from "../robokassa";

export type StoreRobokassaReturnResponse = {
  /**
   * - `completed`: the cart is an order already (the Result came first);
   * - `confirmed`: the payment is proved, the session authorizes;
   * - `pending`: the buyer came back, nothing proved, the order is placed without a payment;
   * - `not_paid`: Robokassa says this invoice was not paid;
   * - `no_session`: the cart has no Robokassa session to speak of.
   */
  status: "completed" | "confirmed" | "pending" | "not_paid" | "no_session";
};

const text = (value: unknown, max = 256): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;

/**
 * `POST /store/tenant/robokassa-return` (t-2026-10-12-13): what the buyer's
 * return from Robokassa proves, asked by the storefront's
 * `app/api/payment-return` the moment `SuccessUrl2` brings the browser back,
 * before it completes the cart and sends the buyer to the order page.
 *
 * Body: `cart_id` and the parameters Robokassa put on the return, verbatim
 * (`OutSum`, `InvId`, `SignatureValue`, `Shp_SessionID`; none of them from the
 * modal, which returns without any). The decision is
 * `modules/payment-robokassa/return-check.ts`; this route finds the session,
 * asks `OpStateExt` when that decision needs it, and stamps the session through
 * the payment module, so the provider answers AUTHORIZED (`return_confirmed_at`)
 * or PENDING_AUTHORIZATION (`return_seen_at`) to the cart completion that
 * follows. The Result webhook stays the one place the payment is captured.
 *
 * The cart must belong to the shop behind the publishable key; a cart of
 * another shop is a cart that does not exist. Asking again is safe: a session
 * already confirmed answers `confirmed` without a second look, and a completed
 * cart answers `completed`.
 */
export const POST = async (req: MedusaStoreRequest, res: MedusaResponse<StoreRobokassaReturnResponse>) => {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const cartId = text(body.cart_id, 64);
  if (!cartId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "cart_id is required.");
  }
  const params: RobokassaReturnParams = {
    OutSum: text(body.OutSum, 32),
    InvId: text(body.InvId, 16),
    SignatureValue: text(body.SignatureValue, 256),
    Shp_SessionID: text(body.Shp_SessionID, 128),
  };

  const tenant = await tenantOrNull(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "completed_at",
      "sales_channel_id",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.data",
      "payment_collection.payment_sessions.amount",
      "payment_collection.payment_sessions.currency_code",
      "payment_collection.payment_sessions.status",
    ],
    filters: { id: cartId },
  });
  const cart = carts[0] as
    | {
        id: string;
        completed_at?: string | Date | null;
        sales_channel_id?: string | null;
        payment_collection?: {
          payment_sessions?: Array<{
            id: string;
            provider_id: string;
            data: Record<string, unknown> | null;
            amount: number;
            currency_code: string;
            status: string;
          } | null> | null;
        } | null;
      }
    | undefined;
  if (!tenant || !cart || cart.sales_channel_id !== tenant.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${cartId} was not found.`);
  }
  if (cart.completed_at) {
    res.json({ status: "completed" });
    return;
  }

  const session = (cart.payment_collection?.payment_sessions ?? []).find(
    (candidate) => candidate?.provider_id === ROBOKASSA_PROVIDER_ID,
  );
  if (!session) {
    res.json({ status: "no_session" });
    return;
  }
  const data = (session.data ?? {}) as Partial<RobokassaSessionData>;
  if (data.result_confirmed_at || data.return_confirmed_at) {
    res.json({ status: "confirmed" });
    return;
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const shopSecret = await readRobokassaSecret(pg, tenant.id, { includeDisabled: true });
  const decision = shopSecret
    ? await checkRobokassaReturn({
        data,
        params,
        shopSecret,
        askOpState: (input) =>
          askRobokassaOpState({ ...input, algorithm: shopSecret.credentials.hash_algorithm, logger }),
      })
    : ({ kind: "pending", reason: "shop_not_configured" } as const);

  const paymentModule = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT);
  const stamp = async (fields: Partial<RobokassaSessionData>) =>
    paymentModule.updatePaymentSession({
      id: session.id,
      amount: session.amount,
      currency_code: session.currency_code,
      data: { ...data, ...fields },
    });
  const now = new Date().toISOString();

  if (decision.kind === "confirmed") {
    await stamp({ return_confirmed_at: now, return_confirmed_by: decision.by, return_out_sum: decision.outSum });
    logger.info(
      `[robokassa/return] confirmed by ${decision.by}: session ${session.id}, invoice ${data.invoice_id}, ${decision.outSum} RUB, tenant ${tenant.id}`,
    );
    res.json({ status: "confirmed" });
    return;
  }
  if (decision.kind === "not_paid") {
    logger.warn(
      `[robokassa/return] not paid (${decision.reason}): session ${session.id}, invoice ${data.invoice_id}, tenant ${tenant.id}`,
    );
    res.json({ status: "not_paid" });
    return;
  }
  if (!data.return_seen_at) {
    await stamp({ return_seen_at: now });
  }
  logger.info(
    `[robokassa/return] pending (${decision.reason}): session ${session.id}, invoice ${data.invoice_id}, tenant ${tenant.id}; the order is placed awaiting the Result`,
  );
  res.json({ status: "pending" });
};
