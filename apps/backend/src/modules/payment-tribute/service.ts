import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import {
  AbstractPaymentProvider,
  ContainerRegistrationKeys,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import {
  createTributeOrder,
  listTributeTransactions,
  refundTributeTransaction,
  type TributeClientOptions,
} from "../../tribute/client";
import {
  readTributeSecret,
  toTributeMinorUnits,
  TRIBUTE_CURRENCIES,
  type ResolvedTributeSecret,
  type TributeCurrency,
} from "../../tenant-secrets/tribute";
import { tributeAvailable, TRIBUTE_UNAVAILABLE_REASON } from "../../tribute/availability";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

/** `shop_order`'s own `payload.status`; see `getWebhookActionAndData`'s doc comment for the other event names. */
export type TributeOrderWebhookStatus = "pending" | "prepaid" | "paid" | "failed";

/**
 * What the provider keeps on `payment_session.data`, mirroring
 * `RobokassaSessionData`'s own doc comment: safe to hand back to the
 * storefront (the payment/Mini App URLs carry no secret), and every
 * `confirmed_*`/`last_event*` field is server-only, written exclusively by the
 * webhook route (`src/api/tribute/webhook/[tenant]/route.ts`) through
 * `updatePayment`, never by `initiatePayment` reading the client's body.
 */
export type TributeSessionData = {
  provider: "tribute";
  tenant_id: string;
  session_id: string;
  order_uuid: string;
  currency_code: TributeCurrency;
  amount_minor: number;
  payment_url: string;
  webapp_payment_url: string;
  success_url: string | null;
  fail_url: string | null;
  /** ISO time the FINAL `shop_order` (status `paid`) webhook was accepted; `null` until then. */
  confirmed_at: string | null;
  /** Name of the last webhook event this session saw, for logging/idempotency. */
  last_event: string | null;
  /** Set once a `shop_order_payment_failed` webhook arrives; the order stays payable. */
  last_failure_at: string | null;
};

const isPending = (data: Partial<TributeSessionData> | undefined): boolean => !data?.confirmed_at;

/**
 * Payment provider for Tribute (tribute.tg) with per-tenant credentials
 * (t-cherk-22), same shape as `RobokassaPaymentProviderService`: one
 * registration serves every shop, credentials are a per-tenant row resolved
 * on each call.
 *
 * Settlement is NOT at payment time the way Robokassa's `capturePayment` is a
 * no-op bookkeeping step: Tribute's docs distinguish an intermediate
 * `shop_order_payment_received` ("do not treat the order as paid") from the
 * FINAL `shop_order` event (`payload.status === "paid"`). Only the latter
 * stamps `confirmed_at`, which is the single fact `authorizePayment` and
 * `getPaymentStatus` read — exactly the role `result_confirmed_at` plays for
 * Robokassa, so the webhook, never the browser return, is the source of truth
 * here too.
 */
export default class TributePaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "tribute";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies, options: Record<string, never> = {}) {
    super(container, options);
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  private async secretFor(tenantId: string | undefined): Promise<ResolvedTributeSecret> {
    if (!tenantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Tribute payment session has no tenant. The store middleware must set data.tenant_id.",
      );
    }
    const secret = await readTributeSecret(this.pg_, tenantId);
    if (!secret) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Tribute is not configured for this shop. The owner sets the API key in the panel under «Приём оплат → Tribute».",
      );
    }
    return secret;
  }

  private static text(value: unknown, max = 2048): string | null {
    return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
  }

  /** Exposed for tests: the one seam that swaps the real `fetch` for a mock Tribute server. */
  protected clientOptions(): TributeClientOptions {
    return {};
  }

  /**
   * Refused before anything is read on an instance that does not offer
   * Tribute (`tribute/availability.ts`). The store middleware already answers
   * 404 there; this is the second wall, as in the BTCPay provider.
   */
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (!tributeAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, TRIBUTE_UNAVAILABLE_REASON);
    }
    const data = (input.data ?? {}) as Record<string, unknown>;
    const currencyCode = String(input.currency_code ?? "").toLowerCase();
    if (!TRIBUTE_CURRENCIES.includes(currencyCode as TributeCurrency)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Tribute accepts RUB, USD or EUR only; this cart is in ${currencyCode.toUpperCase()}.`,
      );
    }
    const secret = await this.secretFor(TributePaymentProviderService.text(data.tenant_id, 64) ?? undefined);
    const sessionId = TributePaymentProviderService.text(data.session_id, 128);
    if (!sessionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment session id is missing.");
    }
    const successUrl = TributePaymentProviderService.text(data.success_url);
    const failUrl = TributePaymentProviderService.text(data.fail_url);
    if (!successUrl || !failUrl) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Tribute requires both a success and a fail URL to create an order.",
      );
    }

    const amountMinor = toTributeMinorUnits(input.amount as number);
    const order = await createTributeOrder(
      secret.credentials.api_key,
      {
        amount: amountMinor,
        currency: currencyCode as TributeCurrency,
        title: TributePaymentProviderService.text(data.title, 100) ?? "Order payment",
        description: TributePaymentProviderService.text(data.description, 300) ?? `Session ${sessionId}`,
        successUrl,
        failUrl,
        email: TributePaymentProviderService.text(input.context?.customer?.email ?? data.email, 254),
        customerId: TributePaymentProviderService.text(input.context?.customer?.id ?? data.customer_id, 256),
        shopId: secret.credentials.shop_id,
      },
      this.clientOptions(),
    );

    const session: TributeSessionData = {
      provider: "tribute",
      tenant_id: secret.tenant_id,
      session_id: sessionId,
      order_uuid: order.uuid,
      currency_code: currencyCode as TributeCurrency,
      amount_minor: amountMinor,
      payment_url: order.paymentUrl,
      webapp_payment_url: order.webappPaymentUrl,
      success_url: successUrl,
      fail_url: failUrl,
      confirmed_at: null,
      last_event: null,
      last_failure_at: null,
    };

    this.logger_.info(
      `[tribute] session ${sessionId} for tenant ${secret.tenant_id}: order ${order.uuid}, ${amountMinor} minor ${currencyCode}`,
    );

    return { id: order.uuid, data: session };
  }

  /** Mirrors `RobokassaPaymentProviderService.updatePayment`: a confirmed session never changes. */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = (input.data ?? {}) as Partial<TributeSessionData> & Record<string, unknown>;
    return { data };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    if (!isPending(data)) {
      return { status: PaymentSessionStatus.CAPTURED, data };
    }
    return { status: PaymentSessionStatus.PENDING, data };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    return {
      status: !isPending(data) ? PaymentSessionStatus.CAPTURED : PaymentSessionStatus.PENDING,
      data,
    };
  }

  /** Tribute settles at payment time; the capture is a bookkeeping step here, as for Robokassa. */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Finds the order's sell transaction and refunds it in full — Tribute has no
   * partial refund (`t-cherk-22/notes.md`). Throws NOT_ALLOWED when there is no
   * refundable sell transaction, the same answer Robokassa gives for "not from
   * here", so the panel shows one consistent message either way.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Partial<TributeSessionData>;
    if (!data.tenant_id || !data.order_uuid) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Tribute session is missing its order.");
    }
    const secret = await this.secretFor(data.tenant_id);
    const transactions = await listTributeTransactions(secret.credentials.api_key, data.order_uuid, this.clientOptions());
    const sellTx = transactions.find((tx) => tx.isRefundable && !tx.isRefunded);
    if (!sellTx) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This Tribute order has no refundable transaction (already refunded, or not a completed sale).",
      );
    }
    await refundTributeTransaction(secret.credentials.api_key, data.order_uuid, sellTx.id, this.clientOptions());
    this.logger_.info(`[tribute] refund initiated: order ${data.order_uuid}, transaction ${sellTx.id}`);
    return { data: input.data ?? {} };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    void payload;
    this.logger_.warn(
      "[tribute] /hooks/payment/tribute_tribute is not Tribute's webhook URL. Point the shop's Tribute dashboard webhook at /tribute/webhook/:tenant.",
    );
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}
