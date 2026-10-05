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
import { amountToNumber, toBtcpayAmount } from "../../btcpay/amount";
import { cryptoPaymentsAvailable, CRYPTO_PAYMENTS_UNAVAILABLE_REASON } from "../../btcpay/availability";
import {
  btcpayConnectionOf,
  createBtcpayInvoice,
  getBtcpayInvoice,
  refundBtcpayInvoice,
  type BtcpayClientOptions,
} from "../../btcpay/client";
import { mapBtcpayInvoiceStatus } from "../../btcpay/status";
import { readInvoiceInto, unixToIso, type BtcpayRefund, type BtcpaySessionData } from "../../btcpay/session";
import {
  missingBtcpayFields,
  normalizeBtcpayServerUrl,
  readBtcpaySecret,
  type ResolvedBtcpaySecret,
} from "../../tenant-secrets/btcpay";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

const text = (value: unknown, max = 2048): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : null;

/** BCP 47 the way BTCPay's `defaultLanguage` takes it: `ru`, `en`, `pt-BR`. */
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

/**
 * Payment provider for the shop's OWN BTCPay Server store
 * (ask-20261005-070255-438f), registered under `pp_btcpay_btcpay`. One
 * registration serves every shop: the server, store and key are a per-tenant
 * row read on each call, the pattern of `payment-tribute` and
 * `payment-robokassa`.
 *
 * WHO DECIDES THAT AN ORDER IS PAID. Only BTCPay itself, asked by the backend.
 * `initiatePayment` creates a Greenfield invoice and sends the buyer to its
 * checkout page. From then on the status is read from the server, never from
 * a request: by the webhook (`/btcpay/webhook/:tenant`), by the sweep job
 * (`jobs/btcpay-invoice-sweep.ts`) and by `authorizePayment` itself, which
 * re-reads the invoice whenever the cart is completed, so the storefront's
 * waiting page can turn a settled invoice into an order even before the
 * webhook lands. Settled is the only status that captures
 * (`btcpay/status.ts`), and only for an invoice whose id, store, currency and
 * amount match the session (`btcpay/session.ts`).
 *
 * Money never passes through the platform: the invoice pays into the owner's
 * own wallet, and a refund is a pull payment the owner funds from it.
 *
 * On an instance that takes no cryptocurrency (`btcpay/availability.ts`) no
 * invoice is created and no unconfirmed session is authorized. A refund still
 * goes through: it gives money back, it takes none.
 */
export default class BtcpayPaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "btcpay";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies, options: Record<string, never> = {}) {
    super(container, options);
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  /** Exposed for tests: the one seam that swaps the real `fetch` for a mock BTCPay Server. */
  protected clientOptions(): BtcpayClientOptions {
    return {};
  }

  /**
   * The shop's store. A new invoice needs the switch on; everything that
   * follows an invoice already issued passes `includeDisabled`, so switching
   * BTCPay off never strands a payment that is on its way.
   */
  private async secretFor(
    tenantId: string | null | undefined,
    options: { includeDisabled?: boolean } = {},
  ): Promise<ResolvedBtcpaySecret> {
    if (!tenantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "BTCPay payment session has no tenant. The store middleware must set data.tenant_id.",
      );
    }
    const secret = await readBtcpaySecret(this.pg_, tenantId, options);
    if (!secret || missingBtcpayFields(secret.credentials).length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "BTCPay is not configured for this shop. The owner connects a BTCPay Server store in the panel under «Payments».",
      );
    }
    return secret;
  }

  /**
   * Where BTCPay's «return to store» button may lead: an absolute address with
   * the scheme rules the server address follows. Anything else is dropped and
   * the checkout page shows no button rather than an arbitrary link.
   */
  private static returnUrl(value: unknown): string | null {
    const raw = text(value);
    if (!raw) {
      return null;
    }
    try {
      const url = new URL(raw);
      return normalizeBtcpayServerUrl(`${url.origin}${url.pathname}`) ? url.toString() : null;
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
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "BTCPay needs the cart's ISO 4217 currency code.");
    }
    const amount = amountToNumber(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "BTCPay cannot issue an invoice for a zero or invalid amount.");
    }
    const sessionId = text(data.session_id, 128);
    if (!sessionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment session id is missing.");
    }
    const secret = await this.secretFor(text(data.tenant_id, 64));
    const returnUrl = BtcpayPaymentProviderService.returnUrl(data.return_url);
    const locale = text(data.locale, 16);
    const amountText = toBtcpayAmount(amount, currencyCode);

    const invoice = await createBtcpayInvoice(
      btcpayConnectionOf(secret),
      {
        amount: amountText,
        currency: currencyCode.toUpperCase(),
        // `orderId` is the field BTCPay indexes and shows the owner; the order
        // does not exist yet, so it names the payment session.
        metadata: { orderId: sessionId, paymentSessionId: sessionId },
        checkout: {
          ...(returnUrl ? { redirectURL: returnUrl, redirectAutomatically: true } : {}),
          ...(locale && LANGUAGE.test(locale) ? { defaultLanguage: locale } : {}),
        },
      },
      this.clientOptions(),
    );

    if (typeof invoice?.id !== "string" || !invoice.id || typeof invoice.checkoutLink !== "string") {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "BTCPay Server answered without an invoice id or checkout link.");
    }

    const session: BtcpaySessionData = {
      provider: "btcpay",
      tenant_id: secret.tenant_id,
      session_id: sessionId,
      invoice_id: invoice.id,
      store_id: secret.credentials.store_id,
      checkout_link: invoice.checkoutLink,
      amount: amountText,
      currency_code: currencyCode,
      return_url: returnUrl,
      invoice_status: String(invoice.status ?? "New"),
      additional_status: invoice.additionalStatus ? String(invoice.additionalStatus) : null,
      expires_at: unixToIso(invoice.expirationTime),
      monitoring_expires_at: unixToIso(invoice.monitoringExpiration),
      confirmed_at: null,
      last_event: null,
      last_error: null,
      refunds: [],
    };

    this.logger_.info(
      `[btcpay] session ${sessionId} for tenant ${secret.tenant_id}: invoice ${invoice.id}, ${amountText} ${currencyCode}`,
    );

    return { id: invoice.id, data: session, status: PaymentSessionStatus.PENDING };
  }

  /**
   * The session as BTCPay sees it now. A session the server already confirmed
   * never asks again; anything else re-reads the invoice, so a stale session
   * cannot be completed and a settled one is not kept waiting for the webhook.
   */
  private async refresh(raw: Record<string, unknown> | undefined) {
    const data = (raw ?? {}) as BtcpaySessionData;
    if (data.confirmed_at) {
      return { status: PaymentSessionStatus.CAPTURED, data };
    }
    if (!cryptoPaymentsAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
    }
    if (!data.invoice_id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "BTCPay session has no invoice.");
    }
    const secret = await this.secretFor(data.tenant_id, { includeDisabled: true });
    const invoice = await getBtcpayInvoice(btcpayConnectionOf(secret), data.invoice_id, this.clientOptions());
    const reading = readInvoiceInto(data, invoice);
    if (reading.mismatch) {
      this.logger_.error(
        `[btcpay] invoice ${data.invoice_id} does not match session ${data.session_id} (${reading.mismatch}); not capturing`,
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
      const data = (input.data ?? {}) as Partial<BtcpaySessionData>;
      this.logger_.warn(
        `[btcpay] status of invoice ${data.invoice_id ?? "-"} not read, answering the stored one: ${
          (error as Error).message
        }`,
      );
      return {
        status: mapBtcpayInvoiceStatus(data.invoice_status, data.additional_status),
        data: (input.data ?? {}) as Record<string, unknown>,
      };
    }
  }

  /** The invoice keeps the amount it was created for; `btcpay/session.ts` refuses to capture a different one. */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: (input.data ?? {}) as Record<string, unknown> };
  }

  /** A settled invoice is money already in the owner's wallet: the capture is bookkeeping, as for Tribute. */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Opens a refund on the owner's BTCPay store: a pull payment in the
   * invoice's currency for exactly `input.amount`. The store is watch-only, so
   * BTCPay sends nothing by itself; the buyer enters an address on the pull
   * payment's page and the owner pays it from their wallet. Medusa records the
   * refund when the pull payment exists, which is when this returns.
   *
   * The pull payment id lands in the payment's data and the log; its claim
   * link only in the data, because anyone holding it can claim the refund.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Partial<BtcpaySessionData>;
    if (!data.tenant_id || !data.invoice_id || !data.currency_code) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "BTCPay payment is missing its invoice.");
    }
    if (!data.confirmed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This BTCPay invoice was never settled, so there is nothing to refund.");
    }
    const amount = amountToNumber(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A refund needs a positive amount.");
    }
    const amountText = toBtcpayAmount(amount, data.currency_code);
    const secret = await this.secretFor(data.tenant_id, { includeDisabled: true });
    const pullPayment = await refundBtcpayInvoice(
      btcpayConnectionOf(secret),
      data.invoice_id,
      {
        name: `Refund ${data.invoice_id}`,
        description: `Refund of ${amountText} ${data.currency_code.toUpperCase()}`,
        customAmount: amountText,
        customCurrency: data.currency_code.toUpperCase(),
      },
      this.clientOptions(),
    );
    if (typeof pullPayment?.id !== "string" || !pullPayment.id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "BTCPay Server answered the refund without a pull payment id.");
    }

    const refund: BtcpayRefund = {
      pull_payment_id: pullPayment.id,
      view_link: typeof pullPayment.viewLink === "string" ? pullPayment.viewLink : null,
      amount: amountText,
      currency: data.currency_code,
      created_at: new Date().toISOString(),
    };
    this.logger_.info(
      `[btcpay] refund opened: invoice ${data.invoice_id}, pull payment ${pullPayment.id}, ${amountText} ${data.currency_code}`,
    );
    return { data: { ...data, refunds: [...(data.refunds ?? []), refund] } };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Never touches the invoice. Medusa also calls this when recording an
   * authorization fails AFTER the invoice settled; marking that invoice
   * invalid would disown money the buyer already paid. An unpaid invoice
   * expires on its own (15 minutes by BTCPay's store default).
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
      "[btcpay] /hooks/payment/btcpay_btcpay is not BTCPay's webhook URL. Point the store's webhook at /btcpay/webhook/:tenant.",
    );
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}
