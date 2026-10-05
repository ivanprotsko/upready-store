import { buildX402Requirements, encodeX402Header, type X402PaymentPayload, type X402PaymentRequirements } from "../protocol";
import { X402_NETWORKS } from "../networks";

/**
 * Shared fixtures of the x402 unit suites (t-2026-10-03-33). The addresses are
 * EIP-55 valid but belong to nobody; the signature is 65 bytes of filler that
 * only the stand-in facilitator ever looks at.
 */
export const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
export const PAYER = "0x857b06519E91e3A54538791bDbb0E22373e36b66";
export const SIGNATURE = `0x${"ab".repeat(65)}`;
export const NONCE = `0x${"11".repeat(32)}`;
export const NOW = 1_800_000_000;

export const baseSepolia = X402_NETWORKS[0];

export const requirementsFor = (amount = "25500000"): X402PaymentRequirements[] =>
  buildX402Requirements({ amount, payTo: PAY_TO, networks: [baseSepolia] });

export const payloadFor = (
  requirement: X402PaymentRequirements,
  overrides: Partial<X402PaymentPayload["payload"]["authorization"]> = {},
): X402PaymentPayload => ({
  x402Version: 2,
  resource: { url: "https://shop.test/store/x402/purchase" },
  accepted: JSON.parse(JSON.stringify(requirement)),
  payload: {
    signature: SIGNATURE,
    authorization: {
      from: PAYER,
      to: requirement.payTo,
      value: requirement.amount,
      validAfter: String(NOW - 600),
      validBefore: String(NOW + requirement.maxTimeoutSeconds),
      nonce: NONCE,
      ...overrides,
    },
  },
});

export const headerFor = (payload: unknown): string => encodeX402Header(payload);
