import {
  X402_VERSION,
  type X402PaymentPayload,
  type X402PaymentRequirements,
  type X402SettleResponse,
  type X402VerifyResponse,
} from "./protocol";

/**
 * The x402 facilitator's HTTP API (t-2026-10-03-33), the shape of
 * `src/btcpay/client.ts`: plain functions, `fetchImpl` the one seam a test
 * replaces with a stand-in. The facilitator is the party that checks the
 * buyer's signature against the chain and submits the transfer; the shop
 * never holds a key and never talks to a blockchain node itself.
 *
 * Source of truth, read 2026-10-05: coinbase/x402 `specs/x402-specification-v2.md`
 * §7 and `typescript/packages/core/src/http/httpFacilitatorClient.ts`.
 * `POST /verify` and `POST /settle` take the same body,
 * `{ x402Version, paymentPayload, paymentRequirements }`. Verified only
 * against stand-ins in this repository's tests, never against a real one.
 *
 * Both calls carry no credentials. The public facilitator for test networks
 * needs none; one that does (Coinbase's CDP signs a JWT per request) is not
 * supported yet.
 */

export type X402FacilitatorOptions = {
  fetchImpl?: typeof fetch;
  /** Verification only reads the chain; settling waits for the transfer, so it gets longer. */
  verifyTimeoutMs?: number;
  settleTimeoutMs?: number;
};

/**
 * The facilitator could not be asked or answered something that is not a
 * verdict. The message names the step and the HTTP status, never the body,
 * which a third party controls and a log or an API answer would repeat.
 */
export class X402FacilitatorError extends Error {
  readonly status: number | null;

  constructor(step: "verify" | "settle", status: number | null, reason: string) {
    super(`x402 facilitator ${step} failed: ${status === null ? reason : `HTTP ${status}, ${reason}`}`);
    this.name = "X402FacilitatorError";
    this.status = status;
  }
}

/** A reason code as the facilitator gave it, if it looks like one; never free text. */
const reasonCode = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9_.:-]{1,96}$/.test(value) ? value : undefined;

const post = async (
  facilitatorUrl: string,
  step: "verify" | "settle",
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ status: number; json: Record<string, unknown> | null }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${facilitatorUrl}/${step}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      const parsed = text ? JSON.parse(text) : null;
      json = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      json = null;
    }
    return { status: response.status, json };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    throw new X402FacilitatorError(step, null, aborted ? `no answer within ${timeoutMs} ms` : "unreachable");
  } finally {
    clearTimeout(timeout);
  }
};

const requestBody = (payload: X402PaymentPayload, requirements: X402PaymentRequirements) => ({
  x402Version: X402_VERSION,
  paymentPayload: payload,
  paymentRequirements: requirements,
});

/**
 * Asks whether the payment would go through: the signature recovers to the
 * payer, the payer holds the amount, the window is open, the nonce is unused.
 * A refusal is an answer (`isValid: false` with a reason), whatever the HTTP
 * status it came with; only a body without a verdict is an error.
 */
export const verifyX402Payment = async (
  facilitatorUrl: string,
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
  options: X402FacilitatorOptions = {},
): Promise<X402VerifyResponse> => {
  const { status, json } = await post(
    facilitatorUrl,
    "verify",
    requestBody(payload, requirements),
    options.verifyTimeoutMs ?? 15_000,
    options.fetchImpl ?? fetch,
  );
  if (!json || typeof json.isValid !== "boolean") {
    throw new X402FacilitatorError("verify", status, "no isValid in the answer");
  }
  return {
    isValid: json.isValid,
    invalidReason: reasonCode(json.invalidReason),
    payer: typeof json.payer === "string" ? json.payer : undefined,
  };
};

/**
 * Submits the transfer and waits for it. `success: true` comes with the
 * transaction hash; a refusal (`success: false`) with a reason. A throw here
 * means the outcome is UNKNOWN: the transfer may have been submitted, so the
 * caller logs the payer and nonce for the owner to look up instead of
 * assuming either way.
 */
export const settleX402Payment = async (
  facilitatorUrl: string,
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
  options: X402FacilitatorOptions = {},
): Promise<X402SettleResponse> => {
  const { status, json } = await post(
    facilitatorUrl,
    "settle",
    requestBody(payload, requirements),
    options.settleTimeoutMs ?? 60_000,
    options.fetchImpl ?? fetch,
  );
  if (!json || typeof json.success !== "boolean") {
    throw new X402FacilitatorError("settle", status, "no success flag in the answer");
  }
  const transaction = typeof json.transaction === "string" ? json.transaction : "";
  if (json.success && !/^0x[0-9a-fA-F]{64}$/.test(transaction)) {
    throw new X402FacilitatorError("settle", status, "success without a transaction hash");
  }
  return {
    success: json.success,
    errorReason: reasonCode(json.errorReason),
    payer: typeof json.payer === "string" ? json.payer : undefined,
    transaction,
    network: typeof json.network === "string" ? json.network : requirements.network,
  };
};
