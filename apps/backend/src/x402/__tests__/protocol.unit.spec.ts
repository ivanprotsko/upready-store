import {
  buildX402PaymentRequired,
  decodeX402Header,
  encodeX402Header,
  jsonEqual,
  matchX402Requirement,
  readX402PaymentPayload,
  X402_MAX_TIMEOUT_SECONDS,
} from "../protocol";
import { NONCE, NOW, PAY_TO, payloadFor, requirementsFor, SIGNATURE } from "./fixtures";

/**
 * The x402 V2 wire format as the shop speaks it (t-2026-10-03-33), checked
 * against the specification's own examples (coinbase/x402
 * `specs/x402-specification-v2.md` §5): base64 JSON headers, a requirement per
 * network, and the checks a payment must pass before the facilitator is asked.
 */

describe("x402 headers", () => {
  it("round-trips UTF-8 JSON through base64", () => {
    const value = { x402Version: 2, resource: { url: "https://shop.test/ü" } };
    const header = encodeX402Header(value);
    expect(header).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodeX402Header(header)).toEqual(value);
  });

  it.each([undefined, null, 42, "", "not base64 !", "e30", `${"A".repeat(20_000)}`, Buffer.from("{oops").toString("base64")])(
    "reads %p as no payment, never throws",
    (raw) => {
      const decoded = decodeX402Header(raw);
      expect(decoded === null || (typeof decoded === "object" && Object.keys(decoded as object).length === 0)).toBe(true);
    },
  );
});

describe("requirements", () => {
  it("names USDC on Base Sepolia with its EIP-712 domain, the amount in atomic units and the shop's address", () => {
    const [requirement] = requirementsFor("25500000");
    expect(requirement).toEqual({
      scheme: "exact",
      network: "eip155:84532",
      amount: "25500000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: PAY_TO,
      maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
      extra: { name: "USDC", version: "2" },
    });
  });

  it("wraps them in a version 2 PaymentRequired with the resource and an optional error", () => {
    const accepts = requirementsFor();
    expect(buildX402PaymentRequired({ resource: { url: "https://shop.test/x" }, accepts })).toEqual({
      x402Version: 2,
      resource: { url: "https://shop.test/x" },
      accepts,
    });
    expect(buildX402PaymentRequired({ resource: { url: "u" }, accepts, error: "e" }).error).toBe("e");
  });
});

describe("readX402PaymentPayload", () => {
  const [requirement] = requirementsFor();

  it("accepts a well-formed exact EVM payload", () => {
    const read = readX402PaymentPayload(payloadFor(requirement));
    expect(read.error).toBeUndefined();
    expect(read.payload?.payload.authorization.nonce).toBe(NONCE);
  });

  it.each([
    ["not an object", "x", "invalid_payload"],
    ["version 1", { ...payloadFor(requirement), x402Version: 1 }, "invalid_x402_version"],
    ["another scheme", { ...payloadFor(requirement), accepted: { ...requirement, scheme: "upto" } }, "unsupported_scheme"],
    [
      "a short signature",
      { ...payloadFor(requirement), payload: { ...payloadFor(requirement).payload, signature: "0x1234" } },
      "invalid_exact_evm_payload_signature",
    ],
    ["a bad payer", payloadFor(requirement, { from: "0x123" }), "invalid_payload"],
    ["a decimal nonce", payloadFor(requirement, { nonce: "12" }), "invalid_payload"],
    ["a negative value", payloadFor(requirement, { value: "-1" }), "invalid_payload"],
    ["a numeric validBefore", payloadFor(requirement, { validBefore: 5 as unknown as string }), "invalid_payload"],
  ])("refuses %s", (_label, raw, error) => {
    expect(readX402PaymentPayload(raw).error).toBe(error);
  });

  it("takes a longer smart-wallet signature", () => {
    const payload = payloadFor(requirement);
    payload.payload.signature = `0x${"cd".repeat(200)}`;
    expect(readX402PaymentPayload(payload).error).toBeUndefined();
    expect(SIGNATURE.length).toBe(132);
  });
});

describe("matchX402Requirement", () => {
  const accepts = requirementsFor();
  const [requirement] = accepts;

  it("finds the requirement echoed unchanged, key order ignored", () => {
    const payload = payloadFor(requirement);
    payload.accepted = JSON.parse(JSON.stringify(requirement, Object.keys(requirement).reverse()));
    payload.accepted.extra = { version: "2", name: "USDC" };
    expect(matchX402Requirement(payload, accepts, NOW).requirement).toEqual(requirement);
  });

  it.each([
    ["an edited amount in accepted", (p: ReturnType<typeof payloadFor>) => (p.accepted.amount = "1"), "invalid_payment_requirements"],
    ["an extra key in accepted", (p: ReturnType<typeof payloadFor>) => ((p.accepted as unknown as Record<string, unknown>).memo = "x"), "invalid_payment_requirements"],
    ["another recipient", (p: ReturnType<typeof payloadFor>) => (p.payload.authorization.to = `0x${"22".repeat(20)}`), "invalid_exact_evm_payload_recipient_mismatch"],
    ["a smaller value", (p: ReturnType<typeof payloadFor>) => (p.payload.authorization.value = "25499999"), "invalid_exact_evm_payload_authorization_value_mismatch"],
    ["an expiring window", (p: ReturnType<typeof payloadFor>) => (p.payload.authorization.validBefore = String(NOW + 5)), "invalid_exact_evm_payload_authorization_valid_before"],
    ["a window not open yet", (p: ReturnType<typeof payloadFor>) => (p.payload.authorization.validAfter = String(NOW + 60)), "invalid_exact_evm_payload_authorization_valid_after"],
  ])("refuses %s", (_label, edit, error) => {
    const payload = payloadFor(requirement);
    edit(payload);
    expect(matchX402Requirement(payload, accepts, NOW).error).toBe(error);
  });

  it("compares the recipient case-insensitively", () => {
    const payload = payloadFor(requirement, { to: PAY_TO.toLowerCase() });
    expect(matchX402Requirement(payload, accepts, NOW).requirement).toBeDefined();
  });
});

describe("jsonEqual", () => {
  it("is structural and order-free for objects, ordered for arrays", () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: undefined }, {})).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});
