import { settleX402Payment, verifyX402Payment, X402FacilitatorError } from "../facilitator";
import { mockFacilitator, transactionFor } from "./mock-facilitator";
import { NONCE, PAYER, payloadFor, requirementsFor } from "./fixtures";

/** The facilitator client (t-2026-10-03-33) against a stand-in, never a real facilitator. */

describe("x402 facilitator client", () => {
  const [requirement] = requirementsFor();
  const payload = payloadFor(requirement);

  it("posts the version 2 body to /verify and /settle and reads the verdicts", async () => {
    const facilitator = mockFacilitator();
    const options = { fetchImpl: facilitator.fetchImpl };

    await expect(verifyX402Payment(facilitator.url, payload, requirement, options)).resolves.toEqual({
      isValid: true,
      invalidReason: undefined,
      payer: PAYER,
    });
    await expect(settleX402Payment(facilitator.url, payload, requirement, options)).resolves.toEqual({
      success: true,
      errorReason: undefined,
      payer: PAYER,
      transaction: transactionFor(NONCE),
      network: "eip155:84532",
    });
    expect(facilitator.calls.map((call) => call.step)).toEqual(["verify", "settle"]);
    expect(facilitator.calls[0].body).toEqual({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirement });
  });

  it("reads a refusal as an answer, and a spent nonce as one", async () => {
    const facilitator = mockFacilitator();
    const options = { fetchImpl: facilitator.fetchImpl };
    await settleX402Payment(facilitator.url, payload, requirement, options);

    await expect(verifyX402Payment(facilitator.url, payload, requirement, options)).resolves.toMatchObject({
      isValid: false,
      invalidReason: "invalid_exact_evm_nonce_already_used",
    });
    await expect(settleX402Payment(facilitator.url, payload, requirement, options)).resolves.toMatchObject({
      success: false,
      errorReason: "invalid_exact_evm_nonce_already_used",
      transaction: "",
    });
  });

  it("keeps free text out of a reason code", async () => {
    const facilitator = mockFacilitator();
    facilitator.verdict.verify = { isValid: false, invalidReason: "<script>alert(1)</script> lots of words" };
    const verdict = await verifyX402Payment(facilitator.url, payload, requirement, { fetchImpl: facilitator.fetchImpl });
    expect(verdict).toEqual({ isValid: false, invalidReason: undefined, payer: undefined });
  });

  it("throws on an answer without a verdict, on a success without a hash, and on no answer at all", async () => {
    const facilitator = mockFacilitator();
    const options = { fetchImpl: facilitator.fetchImpl, verifyTimeoutMs: 50 };

    facilitator.verdict.verify = "http-500";
    await expect(verifyX402Payment(facilitator.url, payload, requirement, options)).rejects.toThrow(
      "x402 facilitator verify failed: HTTP 500, no isValid in the answer",
    );

    facilitator.verdict.settle = { success: true, transaction: "pending", network: "eip155:84532" };
    await expect(settleX402Payment(facilitator.url, payload, requirement, options)).rejects.toBeInstanceOf(X402FacilitatorError);

    facilitator.verdict.verify = "hang";
    await expect(verifyX402Payment(facilitator.url, payload, requirement, options)).rejects.toThrow("no answer within 50 ms");

    const unreachable = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(verifyX402Payment(facilitator.url, payload, requirement, { fetchImpl: unreachable })).rejects.toThrow(
      "x402 facilitator verify failed: unreachable",
    );
  });
});
