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
import { amountToNumber, toBitcartPrice } from "../../bitcart/amount";
import {
  bitcartCheckoutLink,
  bitcartConnectionOf,
  bitcartRefundLink,
  createBitcartInvoice,
  getBitcartInvoice,
  refundBitcartInvoice,
  type BitcartClientOptions,
} from "../../bitcart/client";
import { bitcartNotificationUrl } from "../../bitcart/notification-url";
import {
  bitcartExpiresAt,
  bitcartWatchUntil,
  readBitcartInvoiceInto,
  type BitcartRefundRecord,
  type BitcartSessionData,
} from "../../bitcart/session";
import { mapBitcartInvoiceStatus } from "../../bitcart/status";
import { cryptoPaymentsAvailable, CRYPTO_PAYMENTS_UNAVAILABLE_REASON } from "../../btcpay/availability";
import {
  missingBitcartFields,
  normalizeBitcartUrl,
  readBitcartSecret,
  type ResolvedBitcartSecret,
} from "../../tenant-secrets/bitcart";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

const text = (value: unknown, max = 2048): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : null;

/**
 * Payment provider for the shop's OWN Bitcart store
 * (ask-20261005-070255-438f, stage 2), registered under `pp_bitcart_bitcart`.
 * One registration serves every shop: the server, store and token are a
 * per-tenant row read on each call, the pattern of `payment-btcpay`.
 *
 * WHO DECIDES THAT AN ORDER IS PAID. Only Bitcart itself, asked by the
 * backend. `initiatePayment` creates an invoice and sends the buyer to its
 * checkout page on the shop's Bitcart admin app. From then on the status is
 * read from the server, never from a request: by the notification route
 * (`/bitcart/webhook/:tenant`), whose body Bitcart does not sign and which is
 * therefore only a reason to read the invoice again; by the sweep job
 * (`jobs/bitcart-invoice-sweep.ts`), which Bitcart's single, unretried
 * notification makes the real safety net; and by `authorizePayment` itself,
 * which re-reads the invoice whenever the cart is completed. `complete` is the
 * only status that captures (`bitcart/status.ts`), and only for an invoice
 * whose id, store, currency and price match the session (`bitcart/session.ts`).
 *
 * Money never passes through the platform: the invoice pays into the owner's
 * own wallet, and a refund is a request the owner pays from it.
 *
 * Bitcart obeys the same switch as BTCPay (`btcpay/availability.ts`): on an
 * instance that takes no cryptocurrency no invoice is created and no
 * unconfirmed session is authorized. A refund still goes through: it gives
 * money back, it takes none.
 */
export default class BitcartPaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "bitcart";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies, options: Record<string, never> = {}) {
    super(container, options);
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  /** Exposed for tests: the one seam that swaps the real `fetch` for a mock Bitcart. */
  protected clientOptions(): BitcartClientOptions {
    return {};
  }

  /**
   * The shop's store. A new invoice needs the switch on; everything that
   * follows an invoice already issued passes `includeDisabled`, so switching
   * Bitcart off never strands a payment that is on its way.
   */
  private async secretFor(
    tenantId: string | null | undefined,
    options: { includeDisabled?: boolean } = {},
  ): Promise<ResolvedBitcartSecret> {
    if (!tenantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Bitcart payment session has no tenant. The store middleware must set data.tenant_id.",
      );
    }
    const secret = await readBitcartSecret(this.pg_, tenantId, options);
    if (!secret || missingBitcartFields(secret.credentials).length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Bitcart is not configured for this shop. The owner connects a Bitcart store in the panel under «Payments».",
      );
    }
    return secret;
  }

  /**
   * Where the checkout page's «return to store» may lead: an absolute address
   * with the scheme rules the server address follows. Anything else is
   * dropped and the page shows no way back rather than an arbitrary link.
   */
  private static returnUrl(value: unknown): string | null {
    const raw = text(value);
    if (!raw) {
      return null;
    }
    try {
      const url = new URL(raw);
      return normalizeBitcartUrl(`${url.origin}${url.pathname}`) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (!cryptoPaymentsAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
    }
    const data = (input.data ?? {}) as Record<string, unknown>;
    const currencyCode = String(input.currency_code ?? "").toLowerCase();
    if (!/^[a-z]{3}$/.test(currencyCode)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bitcart needs the cart's ISO 4217 currency code.");
    }
    const amount = amountToNumber(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bitcart cannot issue an invoice for a zero or invalid amount.");
    }
    const sessionId = text(data.session_id, 128);
    if (!sessionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment session id is missing.");
    }
    const secret = await this.secretFor(text(data.tenant_id, 64));
    const returnUrl = BitcartPaymentProviderService.returnUrl(data.return_url);
    const price = toBitcartPrice(amount, currencyCode);
    const notificationUrl = bitcartNotificationUrl(secret.tenant_id);
    if (!notificationUrl) {
      this.logger_.warn(
        "[bitcart] BACKEND_PUBLIC_URL is not set, so this invoice carries no notification address; the sweep job settles it",
      );
    }

    const invoice = await createBitcartInvoice(
      bitcartConnectionOf(secret),
      {
        price,
        currency: currencyCode.toUpperCase(),
        // `order_id` is what Bitcart shows the owner; the order does not
        // exist yet, so it names the payment session.
        orderId: sessionId,
        notificationUrl,
        redirectUrl: returnUrl,
        metadata: { payment_session_id: sessionId },
      },
      this.clientOptions(),
    );

    if (typeof invoice?.id !== "string" || !invoice.id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Bitcart answered without an invoice id.");
    }

    const expiresAt = bitcartExpiresAt(invoice);
    const session: BitcartSessionData = {
      provider: "bitcart",
      tenant_id: secret.tenant_id,
      session_id: sessionId,
      invoice_id: invoice.id,
      store_id: secret.credentials.store_id,
      checkout_link: bitcartCheckoutLink(secret.credentials.admin_url, invoice.id),
      amount: price,
      currency_code: currencyCode,
      return_url: returnUrl,
      invoice_status: String(invoice.status ?? "pending"),
      exception_status: invoice.exception_status ? String(invoice.exception_status) : null,
      expires_at: expiresAt,
      watch_until: bitcartWatchUntil(expiresAt),
      confirmed_at: null,
      last_event: null,
      last_error: null,
      refunds: [],
    };

    this.logger_.info(
      `[bitcart] session ${sessionId} for tenant ${secret.tenant_id}: invoice ${invoice.id}, ${price} ${currencyCode}`,
    );

    return { id: invoice.id, data: session, status: PaymentSessionStatus.PENDING };
  }

  /**
   * The session as Bitcart sees it now. A session the server already
   * confirmed never asks again; anything else re-reads the invoice, so a stale
   * session cannot be completed and a complete one is not kept waiting for the
   * notification.
   */
  private async refresh(raw: Record<string, unknown> | undefined) {
    const data = (raw ?? {}) as BitcartSessionData;
    if (data.confirmed_at) {
      return { status: PaymentSessionStatus.CAPTURED, data };
    }
    if (!cryptoPaymentsAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
    }
    if (!data.invoice_id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Bitcart session has no invoice.");
    }
    const secret = await this.secretFor(data.tenant_id, { includeDisabled: true });
    const invoice = await getBitcartInvoice(bitcartConnectionOf(secret), data.invoice_id, this.clientOptions());
    const reading = readBitcartInvoiceInto(data, invoice);
    if (reading.mismatch) {
      this.logger_.error(
        `[bitcart] invoice ${data.invoice_id} does not match session ${data.session_id} (${reading.mismatch}); not capturing`,
      );
    }
    return { status: reading.status, data: reading.data };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return this.refresh(input.data);
  }

  /** Like `authorizePayment`, but a server that cannot be reached answers with the last status read, not an error. */
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    try {
      return await this.refresh(input.data);
    } catch (error) {
      const data = (input.data ?? {}) as Partial<BitcartSessionData>;
      this.logger_.warn(
        `[bitcart] status of invoice ${data.invoice_id ?? "-"} not read, answering the stored one: ${
          (error as Error).message
        }`,
      );
      return {
        status: mapBitcartInvoiceStatus(data.invoice_status, data.exception_status),
        data: (input.data ?? {}) as Record<string, unknown>,
      };
    }
  }

  /** The invoice keeps the price it was created for; `bitcart/session.ts` refuses to capture a different one. */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: (input.data ?? {}) as Record<string, unknown> };
  }

  /** A complete invoice is money already in the owner's wallet: the capture is bookkeeping, as for BTCPay. */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Opens a refund on the owner's Bitcart: a refund request in the invoice's
   * currency for exactly `input.amount` (`refundBitcartInvoice`). The wallets
   * are the owner's, so Bitcart sends nothing by itself: the buyer enters an
   * address on the claim page, and the owner approves the payout that follows
   * in Bitcart and sends it from their own wallet. Medusa records the refund
   * when the request exists, which is when this returns.
   *
   * The refund id lands in the payment's data and the log; its claim link only
   * in the data, because whoever opens it first chooses where the money goes.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Partial<BitcartSessionData>;
    if (!data.tenant_id || !data.invoice_id || !data.currency_code) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Bitcart payment is missing its invoice.");
    }
    if (!data.confirmed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This Bitcart invoice was never completed, so there is nothing to refund.");
    }
    const amount = amountToNumber(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A refund needs a positive amount.");
    }
    const amountText = toBitcartPrice(amount, data.currency_code);
    const secret = await this.secretFor(data.tenant_id, { includeDisabled: true });
    const refund = await refundBitcartInvoice(
      bitcartConnectionOf(secret),
      data.invoice_id,
      {
        amount: amountText,
        currency: data.currency_code.toUpperCase(),
        adminHost: secret.credentials.admin_url,
      },
      this.clientOptions(),
    );
    if (typeof refund?.id !== "string" || !refund.id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Bitcart answered the refund without a refund id.");
    }

    const record: BitcartRefundRecord = {
      refund_id: refund.id,
      claim_link: bitcartRefundLink(secret.credentials.admin_url, refund.id),
      amount: amountText,
      currency: data.currency_code,
      created_at: new Date().toISOString(),
    };
    this.logger_.info(
      `[bitcart] refund opened: invoice ${data.invoice_id}, refund ${refund.id}, ${amountText} ${data.currency_code}`,
    );
    return { data: { ...data, refunds: [...(data.refunds ?? []), record] } };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Never touches the invoice. Medusa also calls this when recording an
   * authorization fails AFTER the invoice completed; marking that invoice
   * invalid would disown money the buyer already paid. An unpaid invoice
   * expires on its own (15 minutes by Bitcart's store default).
   */
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} };
  }

  /** Same reason as `cancelPayment`: the invoice is left to expire. */
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    void payload;
    this.logger_.warn(
      "[bitcart] /hooks/payment/bitcart_bitcart is not Bitcart's notification URL. Each invoice names /bitcart/webhook/:tenant itself.",
    );
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}
