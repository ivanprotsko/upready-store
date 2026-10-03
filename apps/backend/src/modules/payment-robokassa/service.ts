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
  readRobokassaSecret,
  type ResolvedRobokassaSecret,
  type RobokassaReceiptLineInput,
} from "../../tenant-secrets/robokassa";
import { buildRobokassaSession, type RobokassaSessionData } from "./build-session";

export type { RobokassaSessionData } from "./build-session";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
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

  private static text(value: unknown, max = 2048): string | null {
    return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
  }

  /**
   * `data.receipt_lines` as `src/api/store/tenant/robokassa.ts` wrote it:
   * server-set, same trust level as `data.tenant_id`, but still walked field
   * by field rather than cast wholesale, because `data` crosses the HTTP
   * boundary as `Record<string, unknown>` either way.
   */
  private static receiptLines(value: unknown): RobokassaReceiptLineInput[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      const line = entry as Partial<RobokassaReceiptLineInput> | null;
      const name = RobokassaPaymentProviderService.text(line?.name, 128);
      const amount = Number(line?.amount);
      const quantity = Number(line?.quantity);
      if (!name || !Number.isFinite(amount) || !Number.isFinite(quantity)) {
        return [];
      }
      return [{ name, amount, quantity, kind: line?.kind === "shipping" ? "shipping" : "item" }];
    });
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

    const session = buildRobokassaSession({
      secret,
      sessionId,
      amount: input.amount as number,
      currencyCode,
      successUrl: RobokassaPaymentProviderService.text(data.success_url),
      failUrl: RobokassaPaymentProviderService.text(data.fail_url),
      email: RobokassaPaymentProviderService.text(input.context?.customer?.email ?? data.email, 254),
      culture: RobokassaPaymentProviderService.text(data.culture, 5),
      description: RobokassaPaymentProviderService.text(data.description, 100),
      receiptLines: RobokassaPaymentProviderService.receiptLines(data.receipt_lines),
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
    const rebuilt = buildRobokassaSession({
      secret,
      sessionId: data.session_id,
      amount: input.amount as number,
      currencyCode: String(input.currency_code ?? data.currency_code ?? CURRENCY_CODE).toLowerCase(),
      successUrl: data.success_url ?? null,
      failUrl: data.fail_url ?? null,
      email: RobokassaPaymentProviderService.text(input.context?.customer?.email, 254),
      culture: null,
      description: null,
      receiptLines: data.receipt_lines ?? [],
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
