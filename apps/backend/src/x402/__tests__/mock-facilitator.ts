import { createHash } from "node:crypto";

/**
 * An x402 facilitator stand-in (t-2026-10-03-33): `POST /verify` and
 * `POST /settle` with the bodies and answers of the specification
 * (coinbase/x402 `specs/x402-specification-v2.md` §7). It checks nothing
 * cryptographic; it remembers which (payer, nonce) it settled, so a second
 * settlement of one authorization is refused the way the chain refuses it.
 * The unit suites pass its `fetchImpl` to the provider; the HTTP suite serves
 * it on a loopback port (`integration-tests/http/x402-facilitator-mock.ts`).
 */
type FacilitatorBody = {
  paymentPayload?: { payload?: { authorization?: { from?: string; nonce?: string } } };
  paymentRequirements?: { network?: string };
};

export type FacilitatorCall = { step: "verify" | "settle"; body: FacilitatorBody };

export type MockFacilitator = {
  url: string;
  calls: FacilitatorCall[];
  /** Overrides the verdict of the next calls; `null` restores the default. */
  verdict: { verify?: Record<string, unknown> | "http-500" | "hang"; settle?: Record<string, unknown> | "http-500" };
  fetchImpl: typeof fetch;
  transactionFor: (nonce: string) => string;
};

export const transactionFor = (nonce: string) => `0x${createHash("sha256").update(nonce.toLowerCase()).digest("hex")}`;

export const mockFacilitator = (url = "https://facilitator.test"): MockFacilitator => {
  const settled = new Set<string>();
  const state: MockFacilitator = {
    url,
    calls: [],
    verdict: {},
    transactionFor,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const step = href.endsWith("/verify") ? "verify" : href.endsWith("/settle") ? "settle" : null;
      if (!step || !href.startsWith(url) || init?.method !== "POST") {
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as FacilitatorBody;
      state.calls.push({ step, body });
      const auth = body?.paymentPayload?.payload?.authorization ?? {};
      const key = `${String(auth.from).toLowerCase()}:${String(auth.nonce).toLowerCase()}`;
      const network = body?.paymentRequirements?.network ?? "";
      const override = state.verdict[step];
      if (override === "http-500") {
        return new Response("upstream down", { status: 500 });
      }
      if (override === "hang") {
        await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      if (override && typeof override === "object") {
        return new Response(JSON.stringify(override), { status: 200 });
      }
      if (step === "verify") {
        const answer = settled.has(key)
          ? { isValid: false, invalidReason: "invalid_exact_evm_nonce_already_used", payer: auth.from }
          : { isValid: true, payer: auth.from };
        return new Response(JSON.stringify(answer), { status: 200 });
      }
      if (settled.has(key)) {
        return new Response(
          JSON.stringify({ success: false, errorReason: "invalid_exact_evm_nonce_already_used", transaction: "", network, payer: auth.from }),
          { status: 200 },
        );
      }
      settled.add(key);
      return new Response(
        JSON.stringify({ success: true, transaction: transactionFor(String(auth.nonce)), network, payer: auth.from }),
        { status: 200 },
      );
    }) as typeof fetch,
  };
  return state;
};
