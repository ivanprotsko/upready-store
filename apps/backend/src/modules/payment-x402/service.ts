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
import { cryptoPaymentsAvailable, CRYPTO_PAYMENTS_UNAVAILABLE_REASON } from "../../btcpay/availability";
import { fromAtomicUnits, toAtomicUnits } from "../../x402/amount";
import {
  settleX402Payment,
  verifyX402Payment,
  X402FacilitatorError,
  type X402FacilitatorOptions,
} from "../../x402/facilitator";
import { x402ExplorerUrl, x402NetworkById } from "../../x402/networks";
import {
  buildX402PaymentRequired,
  buildX402Requirements,
  decodeX402Header,
  matchX402Requirement,
  readX402PaymentPayload,
  sameAddress,
  type X402PaymentPayload,
} from "../../x402/protocol";
import {
  findX402SessionsByAuthorization,
  settledX402Session,
  type X402Refund,
  type X402SessionData,
} from "../../x402/session";
import {
  effectiveX402Networks,
  missingX402Fields,
  readX402Secret,
  type ResolvedX402Secret,
} from "../../tenant-secrets/x402";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

const text = (value: unknown, max = 2048): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : null;

/** USDC has 6 decimals on every network in `x402/networks.ts`. */
const USDC_DECIMALS = 6;

/**
 * Payment provider for x402 (t-2026-10-03-33), registered under
 * `pp_x402_x402`: the buyer pays the cart's total in USDC by signing an
 * EIP-3009 transfer to the shop's own address, and an x402 facilitator moves
 * it on the chain. One registration serves every shop; the address, networks
 * and facilitator are a per-tenant row read on each call
 * (`tenant-secrets/x402.ts`), the pattern of `payment-btcpay`.
 *
 * THE FLOW. `initiatePayment` writes the shop's x402 requirements into the
 * session (`payment_required`). The buyer's wallet, or an AI agent, signs one
 * of them, and the signature comes back as `data.payment_signature` on a NEW
 * session for the same cart (the checkout and `/store/x402/purchase` both open
 * one), which checks its shape and stores it. `authorizePayment`, run when the
 * cart is completed, asks the facilitator to verify and then to settle; only a
 * settled transfer authorizes, and the transaction hash lands in the payment's
 * data. The capture that follows is bookkeeping, done by the `order.placed`
 * subscriber (`subscribers/x402-capture-on-placed.ts`) so the usual
 * `payment.captured` handlers run (courses, the receipt letter).
 *
 * WHO DECIDES THAT AN ORDER IS PAID. The facilitator's settlement, read by
 * the backend itself, never a client's word. A session already settled never
 * settles again; a (payer, nonce) settled in another session is refused, so a
 * replayed signature cannot pay a second order.
 *
 * Money never passes through the platform: the transfer goes to the shop's
 * `pay_to`. A refund is the owner's own transfer back (`refundPayment`).
 *
 * Only USD carts, because USDC is a dollar and the price is the amount. On an
 * instance that takes no cryptocurrency (`btcpay/availability.ts`) nothing is
 * initiated and nothing is settled.
 */
export default class X402PaymentProviderService extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "x402";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies, options: Record<string, never> = {}) {
    super(container, options);
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  /** Exposed for tests: the one seam that swaps the real `fetch` for a stand-in facilitator. */
  protected facilitatorOptions(): X402FacilitatorOptions {
    return {};
  }

  private async secretFor(tenantId: string | null | undefined): Promise<ResolvedX402Secret> {
    if (!tenantId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "x402 payment session has no tenant. The store middleware must set data.tenant_id.",
      );
    }
    const secret = await readX402Secret(this.pg_, tenantId);
    if (!secret || missingX402Fields(secret.credentials).length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "x402 is not configured for this shop. The owner sets a receiving address and networks in the panel under «Payments».",
      );
    }
    return secret;
  }

  private static resourceUrl(value: unknown, sessionId: string): string {
    const raw = text(value);
    if (raw) {
      try {
        const url = new URL(raw);
        if (url.protocol === "https:" || url.protocol === "http:") {
          return url.toString();
        }
      } catch {
        // falls through to the session's own name
      }
    }
    return `urn:x402:payment-session:${sessionId}`;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (!cryptoPaymentsAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
    }
    const data = (input.data ?? {}) as Record<string, unknown>;
    const currencyCode = String(input.currency_code ?? "").toLowerCase();
    if (currencyCode !== "usd") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `x402 takes USD carts only: USDC is a dollar, and this cart is priced in ${currencyCode.toUpperCase() || "no currency"}.`,
      );
    }
    const amount = toAtomicUnits(input.amount, USDC_DECIMALS);
    if (!amount) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "x402 cannot ask for a zero or invalid amount.");
    }
    const sessionId = text(data.session_id, 128);
    if (!sessionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment session id is missing.");
    }
    const secret = await this.secretFor(text(data.tenant_id, 64));
    const networks = effectiveX402Networks(secret.credentials);
    if (!networks.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "None of the shop's x402 networks is offered on this instance.",
      );
    }

    const paymentRequired = buildX402PaymentRequired({
      resource: {
        url: X402PaymentProviderService.resourceUrl(data.resource_url, sessionId),
        description: text(data.resource_description, 256) ?? `Order payment, ${fromAtomicUnits(amount, USDC_DECIMALS)} USD`,
        mimeType: "application/json",
      },
      accepts: buildX402Requirements({ amount, payTo: secret.credentials.pay_to, networks }),
    });

    const session: X402SessionData = {
      provider: "x402",
      tenant_id: secret.tenant_id,
      session_id: sessionId,
      currency_code: "usd",
      amount,
      payment_required: paymentRequired,
      payment_payload: null,
      payer: null,
      nonce: null,
      network: null,
      testnet: null,
      verified_at: null,
      settled_at: null,
      transaction: null,
      explorer_url: null,
      last_error: null,
      refunds: [],
    };

    const signature = data.payment_signature;
    if (signature !== undefined && signature !== null && signature !== "") {
      const payload = await this.acceptSignature(signature, session);
      session.payment_payload = payload;
      session.payer = payload.payload.authorization.from.toLowerCase();
      session.nonce = payload.payload.authorization.nonce.toLowerCase();
      session.network = payload.accepted.network;
      session.testnet = x402NetworkById(payload.accepted.network)?.testnet ?? null;
    }

    this.logger_.info(
      `[x402] session ${sessionId} for tenant ${secret.tenant_id}: ${amount} atomic USDC on ${networks
        .map((network) => network.id)
        .join(", ")}${session.payment_payload ? `, signed by ${session.payer}` : ""}`,
    );

    return { id: sessionId, data: session, status: PaymentSessionStatus.PENDING };
  }

  /**
   * A signed payment offered for this session: well formed, answering one of
   * its requirements unchanged and in time, and not already spent in another
   * session. Refused with the protocol's own reason code, which the agent
   * route passes back in its 402.
   */
  private async acceptSignature(raw: unknown, session: X402SessionData): Promise<X402PaymentPayload> {
    const decoded = typeof raw === "string" ? decodeX402Header(raw) : raw;
    const read = readX402PaymentPayload(decoded);
    if (!read.payload) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `x402 payment refused: ${read.error}`);
    }
    const match = matchX402Requirement(read.payload, session.payment_required.accepts);
    if (!match.requirement) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `x402 payment refused: ${match.error}`);
    }
    const auth = read.payload.payload.authorization;
    const settled = settledX402Session(await findX402SessionsByAuthorization(this.pg_, auth.from, auth.nonce));
    if (settled) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `x402 payment refused: this authorization already paid in session ${settled.id}`,
      );
    }
    return read.payload;
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as X402SessionData;
    if (data.settled_at && data.transaction) {
      return { status: PaymentSessionStatus.AUTHORIZED, data: data as unknown as Record<string, unknown> };
    }
    if (!cryptoPaymentsAvailable()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CRYPTO_PAYMENTS_UNAVAILABLE_REASON);
    }
    const payload = data.payment_payload;
    if (!payload) {
      return {
        status: PaymentSessionStatus.REQUIRES_MORE,
        data: { ...data, last_error: "payment_signature_missing" } as unknown as Record<string, unknown>,
      };
    }

    const secret = await this.secretFor(data.tenant_id);
    const match = matchX402Requirement(payload, data.payment_required?.accepts ?? []);
    const refusal = (reason: string) => ({
      status: PaymentSessionStatus.ERROR,
      data: { ...data, last_error: reason } as unknown as Record<string, unknown>,
    });
    if (!match.requirement) {
      return refusal(match.error);
    }
    const requirement = match.requirement;
    // The owner may have changed the receiving address since the session
    // opened, perhaps because the old one is lost: nothing settles to it now.
    if (!sameAddress(requirement.payTo, secret.credentials.pay_to)) {
      return refusal("pay_to_changed");
    }
    if (!effectiveX402Networks(secret.credentials).some((network) => network.id === requirement.network)) {
      return refusal("invalid_network");
    }

    const auth = payload.payload.authorization;
    const elsewhere = settledX402Session(await findX402SessionsByAuthorization(this.pg_, auth.from, auth.nonce));
    if (elsewhere && elsewhere.id !== data.session_id) {
      return refusal("authorization_already_settled");
    }

    const facilitator = secret.credentials.facilitator_url;
    const options = this.facilitatorOptions();
    try {
      const verdict = await verifyX402Payment(facilitator, payload, requirement, options);
      if (!verdict.isValid) {
        this.logger_.warn(
          `[x402] session ${data.session_id}: facilitator refused the payment of ${auth.from} (${verdict.invalidReason ?? "no reason"})`,
        );
        return refusal(verdict.invalidReason ?? "invalid_payload");
      }
    } catch (error) {
      this.logger_.warn(`[x402] session ${data.session_id}: ${(error as Error).message}`);
      return refusal("facilitator_unavailable");
    }
    const verifiedAt = new Date().toISOString();

    let settlement;
    try {
      settlement = await settleX402Payment(facilitator, payload, requirement, options);
    } catch (error) {
      // The transfer may or may not be on the chain now. Logged with everything
      // the owner needs to look it up; the nonce cannot be spent twice, so a
      // retry is refused by the chain if it went through.
      this.logger_.error(
        `[x402] session ${data.session_id}: settlement outcome UNKNOWN for payer ${auth.from}, nonce ${auth.nonce}, ${requirement.amount} atomic on ${requirement.network} to ${requirement.payTo}: ${
          (error as Error).message
        }`,
      );
      return refusal(error instanceof X402FacilitatorError ? "settle_outcome_unknown" : "unexpected_settle_error");
    }
    if (!settlement.success) {
      this.logger_.warn(
        `[x402] session ${data.session_id}: settlement refused for ${auth.from} (${settlement.errorReason ?? "no reason"})`,
      );
      return refusal(settlement.errorReason ?? "unexpected_settle_error");
    }

    const settled: X402SessionData = {
      ...data,
      payer: auth.from.toLowerCase(),
      nonce: auth.nonce.toLowerCase(),
      network: requirement.network,
      testnet: x402NetworkById(requirement.network)?.testnet ?? null,
      verified_at: verifiedAt,
      settled_at: new Date().toISOString(),
      transaction: settlement.transaction,
      explorer_url: x402ExplorerUrl(requirement.network, settlement.transaction),
      last_error: null,
    };
    this.logger_.info(
      `[x402] session ${data.session_id} settled: ${requirement.amount} atomic USDC from ${auth.from} on ${requirement.network}, transaction ${settlement.transaction}`,
    );
    return { status: PaymentSessionStatus.AUTHORIZED, data: settled as unknown as Record<string, unknown> };
  }

  /** Settled is authorized; anything else waits for the buyer's signature. Never calls the facilitator. */
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Partial<X402SessionData>;
    return {
      status: data.settled_at && data.transaction ? PaymentSessionStatus.AUTHORIZED : PaymentSessionStatus.PENDING,
      data: (input.data ?? {}) as Record<string, unknown>,
    };
  }

  /** The requirements keep the amount they were made for; a changed cart opens a new session. */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: (input.data ?? {}) as Record<string, unknown> };
  }

  /** A settled transfer is money already at `pay_to`: the capture is bookkeeping, as for BTCPay. */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as Partial<X402SessionData>;
    if (!data.settled_at || !data.transaction) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This x402 payment was never settled, so there is nothing to capture.");
    }
    return { data: input.data ?? {} };
  }

  /**
   * x402 moves money one way. A refund is the owner's own transfer from the
   * receiving wallet back to the payer, so this records what is owed and to
   * whom, and Medusa books the refund; the owner sends it.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Partial<X402SessionData>;
    if (!data.settled_at || !data.transaction) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This x402 payment was never settled, so there is nothing to refund.");
    }
    const amount = toAtomicUnits(input.amount, USDC_DECIMALS);
    if (!amount) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A refund needs a positive amount.");
    }
    const refund: X402Refund = {
      amount,
      to: data.payer ?? null,
      network: data.network ?? null,
      created_at: new Date().toISOString(),
    };
    this.logger_.info(
      `[x402] refund booked for session ${data.session_id}: the owner sends ${amount} atomic USDC to ${data.payer} on ${data.network}`,
    );
    return { data: { ...data, refunds: [...(data.refunds ?? []), refund] } };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  /**
   * Never undoes a transfer, because it cannot. Medusa calls this when placing
   * the order fails AFTER the payment settled; the money is then at `pay_to`
   * without an order, and the log line is what the owner reconciles from.
   */
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = (input.data ?? {}) as Partial<X402SessionData>;
    if (data.settled_at && data.transaction) {
      this.logger_.error(
        `[x402] payment of session ${data.session_id} canceled AFTER settling: transaction ${data.transaction} on ${data.network} from ${data.payer}; refund it by hand if no order follows`,
      );
    }
    return { data: input.data ?? {} };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    void payload;
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}
