import type { X402Network } from "./networks";

/**
 * The x402 protocol, version 2, as far as a shop that SELLS needs it
 * (t-2026-10-03-33). Written from the specification in coinbase/x402, read
 * 2026-10-05: `specs/x402-specification-v2.md`, `specs/transports-v2/http.md`
 * and `specs/schemes/exact/scheme_exact_evm.md`. No x402 package is a
 * dependency: the server side is three base64 JSON headers, a structural
 * check and two HTTP calls to the facilitator (`facilitator.ts`), and the
 * facilitator is the one that checks the signature and moves the money.
 *
 * Only the `exact` scheme on EVM networks with an EIP-3009 authorization,
 * which is what USDC on Base takes.
 */

export const X402_VERSION = 2;

/** Server → client on a 402: base64 of the `X402PaymentRequired` JSON. */
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
/** Client → server on the retry: base64 of the `X402PaymentPayload` JSON. */
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
/** Server → client after settling: base64 of the `X402SettleResponse` JSON. */
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

/**
 * How long a signed authorization stays valid, and the `maxTimeoutSeconds` of
 * every requirement. The reference client signs `validBefore = now +
 * maxTimeoutSeconds`; five minutes leaves a buyer time to read the wallet's
 * prompt, where the specification's examples use one minute for an API.
 */
export const X402_MAX_TIMEOUT_SECONDS = 300;

/** The facilitator refuses an authorization that expires in under six seconds (reference `eip3009.ts`). */
export const X402_VALID_BEFORE_MARGIN_SECONDS = 6;

/** A header longer than this is not a payment, whatever it decodes to. */
export const X402_HEADER_MAX_LENGTH = 16_384;

export type X402Resource = {
  url: string;
  description?: string;
  mimeType?: string;
};

export type X402PaymentRequirements = {
  scheme: "exact";
  network: string;
  /** Atomic units of `asset`, a decimal string. */
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

export type X402PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: X402Resource;
  accepts: X402PaymentRequirements[];
};

export type X402Authorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type X402PaymentPayload = {
  x402Version: number;
  resource?: X402Resource;
  accepted: X402PaymentRequirements;
  payload: {
    signature: string;
    authorization: X402Authorization;
  };
  extensions?: Record<string, unknown>;
};

export type X402VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
};

export type X402SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const NONCE = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,78}$/;
/**
 * 65 bytes for an ordinary wallet; a smart wallet's ERC-1271 or ERC-6492
 * signature is longer, and the facilitator accepts those too.
 */
const SIGNATURE = /^0x(?:[0-9a-fA-F]{2}){65,2048}$/;

export const isEvmAddress = (value: unknown): value is string => typeof value === "string" && ADDRESS.test(value);

export const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** UTF-8 JSON, base64: the encoding of all three headers. */
export const encodeX402Header = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64");

/** The JSON a header carries, or `null` for an absent, oversized, non-base64 or non-JSON one. Never throws. */
export const decodeX402Header = (raw: unknown): unknown => {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > X402_HEADER_MAX_LENGTH || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

/** One requirement per network the shop takes, in the order given. */
export const buildX402Requirements = (input: {
  amount: string;
  payTo: string;
  networks: readonly X402Network[];
}): X402PaymentRequirements[] =>
  input.networks.map((network) => ({
    scheme: "exact",
    network: network.id,
    amount: input.amount,
    asset: network.usdc.address,
    payTo: input.payTo,
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
    extra: { name: network.usdc.name, version: network.usdc.version },
  }));

export const buildX402PaymentRequired = (input: {
  resource: X402Resource;
  accepts: X402PaymentRequirements[];
  error?: string;
}): X402PaymentRequired => ({
  x402Version: X402_VERSION,
  ...(input.error ? { error: input.error } : {}),
  resource: input.resource,
  accepts: input.accepts,
});

/**
 * Structural equality of two JSON values, key order ignored. The reference
 * server matches the client's `accepted` against its own requirements with a
 * deep equality, and so does this: a requirement the client edited is not one
 * the shop asked for.
 */
export const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A decoded `PAYMENT-SIGNATURE` checked for shape: version 2, an `accepted`
 * requirement, and an EIP-3009 authorization whose every field has the form
 * the token contract takes. Says nothing about whether the signature is
 * genuine or the money is there; the facilitator answers that.
 */
export const readX402PaymentPayload = (
  raw: unknown,
): { payload: X402PaymentPayload; error?: undefined } | { payload?: undefined; error: string } => {
  if (!isRecord(raw)) {
    return { error: "invalid_payload" };
  }
  if (raw.x402Version !== X402_VERSION) {
    return { error: "invalid_x402_version" };
  }
  const accepted = raw.accepted;
  if (!isRecord(accepted) || accepted.scheme !== "exact") {
    return { error: "unsupported_scheme" };
  }
  const inner = raw.payload;
  if (!isRecord(inner) || !isRecord(inner.authorization)) {
    return { error: "invalid_payload" };
  }
  const { signature } = inner;
  const auth = inner.authorization;
  if (typeof signature !== "string" || !SIGNATURE.test(signature)) {
    return { error: "invalid_exact_evm_payload_signature" };
  }
  if (!isEvmAddress(auth.from) || !isEvmAddress(auth.to)) {
    return { error: "invalid_payload" };
  }
  for (const field of ["value", "validAfter", "validBefore"] as const) {
    if (typeof auth[field] !== "string" || !UINT.test(auth[field] as string)) {
      return { error: "invalid_payload" };
    }
  }
  if (typeof auth.nonce !== "string" || !NONCE.test(auth.nonce)) {
    return { error: "invalid_payload" };
  }
  return { payload: raw as unknown as X402PaymentPayload };
};

/**
 * Which of the shop's requirements a payment answers, checked the way the
 * facilitator will check it, so a payment that can only fail is refused
 * before anyone is called: the same requirement echoed unchanged, paid to the
 * shop's address, for exactly the amount, inside its validity window.
 */
export const matchX402Requirement = (
  payload: X402PaymentPayload,
  accepts: readonly X402PaymentRequirements[],
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { requirement: X402PaymentRequirements; error?: undefined } | { requirement?: undefined; error: string } => {
  const requirement = accepts.find((candidate) => jsonEqual(candidate, payload.accepted));
  if (!requirement) {
    return { error: "invalid_payment_requirements" };
  }
  const auth = payload.payload.authorization;
  if (!sameAddress(auth.to, requirement.payTo)) {
    return { error: "invalid_exact_evm_payload_recipient_mismatch" };
  }
  if (auth.value !== requirement.amount) {
    return { error: "invalid_exact_evm_payload_authorization_value_mismatch" };
  }
  if (Number(auth.validBefore) < nowSeconds + X402_VALID_BEFORE_MARGIN_SECONDS) {
    return { error: "invalid_exact_evm_payload_authorization_valid_before" };
  }
  if (Number(auth.validAfter) > nowSeconds) {
    return { error: "invalid_exact_evm_payload_authorization_valid_after" };
  }
  return { requirement };
};
