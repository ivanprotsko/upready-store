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
  formatOutSum,
  invoiceIdFor,
  passwordFor,
  readRobokassaSecret,
  ROBOKASSA_PAYMENT_URL,
  robokassaSignature,
  type ResolvedRobokassaSecret,
} from "../../tenant-secrets/robokassa";
import { isSyntheticTelegramEmail } from "../auth-telegram/lib/identity";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

/**
 * What the provider keeps on `payment_session.data`. Everything here is safe to
 * hand to the storefront (`/store/carts/:id?fields=payment_collection.payment_sessions.data`
 * returns it to the browser): the payment URL carries a signature, not a
 * password, and the credentials themselves never leave `initiatePayment`.
 *
 * `tenant_id` is written by the server (`src/api/middlewares.ts` overwrites
 * whatever the client sent before the provider runs) and `result_*` only by
 * the Result webhook route through `updatePayment`, never from the storefront:
 * `initiatePayment` builds this object from scratch, so a client-supplied
 * `result_confirmed_at` is dropped on the floor.
 */
export type RobokassaSessionData = {
  provider: "robokassa";
  tenant_id: string;
  session_id: string;
  invoice_id: string;
  out_sum: string;
  currency_code: string;
  is_test: boolean;
  merchant_login: string;
  payment_url: string;
  success_url: string | null;
  fail_url: string | null;
  /** ISO time the signed Result webhook was accepted; `null` until then. */
  result_confirmed_at: string | null;
  /** `OutSum` verbatim from the accepted Result webhook. */
  result_out_sum: string | null;
};

const CURRENCY_CODE = "rub";

/**
 * Payment provider for Robokassa with per-tenant credentials.
 *
 * Contract facts this follows, read from `@medusajs/payment` 2.19
 * `services/payment-module.js` on 2026-09-15:
 *
 * - `createPaymentSession` calls `initiatePayment` with
 *   `data: { ...request.data, session_id }` and stores
 *   `{ ...request.data, ...output.data }` on the session, so the provider's
 *   own `data` wins over anything the client sent under the same key.
 * - `updatePaymentSession` calls `updatePayment` and stores whatever `data` it
 *   returns. The Result route uses this to record the confirmation, and the
 *   cart refresh uses it to carry a changed total into a new payment URL.
 * - `authorizePaymentSession` calls `authorizePayment` with the stored data
 *   and refuses the cart completion unless the status is AUTHORIZED or
 *   CAPTURED. Only a session carrying `result_confirmed_at` answers CAPTURED,
 *   which is what makes the webhook, and not the browser, the source of truth.
 *
 * Medusa's generic webhook route (`/hooks/payment/robokassa_robokassa`) is not
 * the Result URL: Robokassa expects the literal body `OK<InvId>` and retries on
 * anything else, and the confirmation has to be persisted before the workflow
 * authorizes. `src/api/robokassa/result/route.ts` does both, so
 * `getWebhookActionAndData` answers NOT_SUPPORTED and says where to point the
 * merchant's Result URL instead.
 */
export default class RobokassaPaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "robokassa";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies, options: Record<string, never> = {}) {
    super(container, options);
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  private async secretFor(tenantId: string | undefined): Promise<ResolvedRobokassaSecret> {
    if (!tenantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Robokassa payment session has no tenant. The store middleware must set data.tenant_id.",
      );
    }
    const secret = await readRobokassaSecret(this.pg_, tenantId);
    if (!secret) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Robokassa is not configured for this shop. The owner sets the credentials in the panel under «Приём оплат».",
      );
    }
    return secret;
  }

  /**
   * Robokassa's payment URL with the signature
   * `MerchantLogin:OutSum:InvId:[SuccessUrl2:SuccessUrl2Method:][FailUrl2:FailUrl2Method:]Password#1:Shp_SessionID=<id>`,
   * the order `@gorgo/medusa-payment-robokassa` 1.0.0 uses (read from the old
   * project's installed copy, measured there against Robokassa's test page).
   */
  private buildSession(input: {
    secret: ResolvedRobokassaSecret;
    sessionId: string;
    amount: number | string;
    currencyCode: string;
    successUrl: string | null;
    failUrl: string | null;
    email: string | null;
    culture: string | null;
    description: string | null;
  }): RobokassaSessionData {
    const { secret, sessionId } = input;
    const outSum = formatOutSum(input.amount);
    const invoiceId = invoiceIdFor(sessionId);
    const urlParams = {
      SuccessUrl2: input.successUrl,
      SuccessUrl2Method: input.successUrl ? "GET" : null,
      FailUrl2: input.failUrl,
      FailUrl2Method: input.failUrl ? "GET" : null,
    };
    const signature = robokassaSignature(
      [
        secret.credentials.merchant_login,
        outSum,
        invoiceId,
        urlParams.SuccessUrl2,
        urlParams.SuccessUrl2Method,
        urlParams.FailUrl2,
        urlParams.FailUrl2Method,
        passwordFor(secret, 1),
        `Shp_SessionID=${sessionId}`,
      ],
      secret.credentials.hash_algorithm,
    );

    const params = new URLSearchParams();
    params.set("MerchantLogin", secret.credentials.merchant_login);
    params.set("OutSum", outSum);
    params.set("InvId", invoiceId);
    if (input.description) {
      params.set("Description", input.description.slice(0, 100));
    }
    params.set("SignatureValue", signature);
    params.set("Shp_SessionID", sessionId);
    for (const [key, value] of Object.entries(urlParams)) {
      if (value) {
        params.set(key, value);
      }
    }
    // Robokassa mails the receipt to this address; a Telegram buyer's synthetic one would bounce.
    if (input.email && !isSyntheticTelegramEmail(input.email)) {
      params.set("Email", input.email);
    }
    if (input.culture) {
      params.set("Culture", input.culture);
    }
    if (secret.is_test) {
      params.set("IsTest", "1");
    }

    return {
      provider: "robokassa",
      tenant_id: secret.tenant_id,
      session_id: sessionId,
      invoice_id: invoiceId,
      out_sum: outSum,
      currency_code: input.currencyCode,
      is_test: secret.is_test,
      merchant_login: secret.credentials.merchant_login,
      payment_url: `${ROBOKASSA_PAYMENT_URL}?${params.toString()}`,
      success_url: input.successUrl,
      fail_url: input.failUrl,
      result_confirmed_at: null,
      result_out_sum: null,
    };
  }

  private static text(value: unknown, max = 2048): string | null {
    return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
  }

  private static isConfirmed(data: Record<string, unknown> | undefined): boolean {
    const session = (data ?? {}) as Partial<RobokassaSessionData>;
    return Boolean(session.result_confirmed_at) && session.result_out_sum === session.out_sum;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const currencyCode = String(input.currency_code ?? "").toLowerCase();
    if (currencyCode !== CURRENCY_CODE) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Robokassa accepts payments in RUB only; this cart is in ${currencyCode.toUpperCase()}.`,
      );
    }
    const secret = await this.secretFor(RobokassaPaymentProviderService.text(data.tenant_id, 64) ?? undefined);
    const sessionId = RobokassaPaymentProviderService.text(data.session_id, 128);
    if (!sessionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment session id is missing.");
    }

    const session = this.buildSession({
      secret,
      sessionId,
      amount: input.amount as number,
      currencyCode,
      successUrl: RobokassaPaymentProviderService.text(data.success_url),
      failUrl: RobokassaPaymentProviderService.text(data.fail_url),
      email: RobokassaPaymentProviderService.text(input.context?.customer?.email ?? data.email, 254),
      culture: RobokassaPaymentProviderService.text(data.culture, 5),
      description: RobokassaPaymentProviderService.text(data.description, 100),
    });

    this.logger_.info(
      `[robokassa] session ${sessionId} for tenant ${secret.tenant_id}: invoice ${session.invoice_id}, ${session.out_sum} RUB, test=${session.is_test}`,
    );

    return { id: session.invoice_id, data: session };
  }

  /**
   * Two callers. The cart refresh (a changed total) sends the session's own data
   * plus the new amount: an unconfirmed session gets a new URL and signature for
   * the new sum. The Result route sends the confirmation fields: stored as is.
   * A confirmed session never changes its sum again.
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = (input.data ?? {}) as Partial<RobokassaSessionData> & Record<string, unknown>;
    if (RobokassaPaymentProviderService.isConfirmed(data)) {
      return { data };
    }
    const nextOutSum = formatOutSum(input.amount as number);
    if (data.out_sum === nextOutSum || !data.tenant_id || !data.session_id) {
      return { data };
    }
    const secret = await this.secretFor(data.tenant_id);
    const rebuilt = this.buildSession({
      secret,
      sessionId: data.session_id,
      amount: input.amount as number,
      currencyCode: String(input.currency_code ?? data.currency_code ?? CURRENCY_CODE).toLowerCase(),
      successUrl: data.success_url ?? null,
      failUrl: data.fail_url ?? null,
      email: RobokassaPaymentProviderService.text(input.context?.customer?.email, 254),
      culture: null,
      description: null,
    });
    this.logger_.info(
      `[robokassa] session ${data.session_id}: total changed ${data.out_sum} → ${nextOutSum} RUB, payment URL rebuilt`,
    );
    return { data: { ...data, ...rebuilt } };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    if (RobokassaPaymentProviderService.isConfirmed(data)) {
      return { status: PaymentSessionStatus.CAPTURED, data };
    }
    return { status: PaymentSessionStatus.PENDING, data };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    return {
      status: RobokassaPaymentProviderService.isConfirmed(data)
        ? PaymentSessionStatus.CAPTURED
        : PaymentSessionStatus.PENDING,
      data,
    };
  }

  /** Robokassa settles at payment time; the capture is a bookkeeping step here. */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    void input;
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Refunds through Robokassa are made in the merchant's Robokassa dashboard, not from the panel.",
    );
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
      "[robokassa] /hooks/payment/robokassa_robokassa is not the Result URL. Point the merchant's Result URL at /robokassa/result.",
    );
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}
