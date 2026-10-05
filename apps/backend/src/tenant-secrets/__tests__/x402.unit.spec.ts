import {
  effectiveX402Networks,
  missingX402Fields,
  normalizeX402FacilitatorUrl,
  normalizeX402Networks,
  x402IsTest,
  x402Ready,
  type ResolvedX402Secret,
} from "../x402";
import { PutTenantX402Schema } from "../../api/tenants/validators";

/** The shop's x402 settings (t-2026-10-03-33): what counts as complete, test, ready, and what a save accepts. */

const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

const secret = (overrides: Partial<ResolvedX402Secret["credentials"]> = {}, isEnabled = true): ResolvedX402Secret => ({
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: isEnabled,
  is_test: true,
  credentials: { pay_to: PAY_TO, networks: ["eip155:84532"], facilitator_url: "https://x402.org/facilitator", ...overrides },
});

describe("x402 settings", () => {
  it("names what is still missing before the switch may go on", () => {
    expect(missingX402Fields(secret().credentials)).toEqual([]);
    expect(missingX402Fields({ pay_to: "", networks: [], facilitator_url: "" })).toEqual(["pay_to", "networks", "facilitator_url"]);
    expect(missingX402Fields(secret({ pay_to: "0x123", networks: ["base-sepolia"] }).credentials)).toEqual(["pay_to", "networks"]);
  });

  it("is a test row while any chosen network is a test network", () => {
    expect(x402IsTest(["eip155:84532"])).toBe(true);
    expect(x402IsTest(["eip155:8453", "eip155:84532"])).toBe(true);
    expect(x402IsTest(["eip155:8453"])).toBe(false);
    expect(x402IsTest([])).toBe(false);
  });

  it("keeps known networks once each, and narrows them to what the instance offers", () => {
    expect(normalizeX402Networks(["eip155:8453", "x", "eip155:84532", "eip155:8453"])).toEqual(["eip155:84532", "eip155:8453"]);
    const both = secret({ networks: ["eip155:84532", "eip155:8453"] }).credentials;
    expect(effectiveX402Networks(both, {}).map((network) => network.id)).toEqual(["eip155:84532"]);
    expect(effectiveX402Networks(both, { X402_MAINNET_AVAILABLE: "true" }).map((network) => network.id)).toEqual([
      "eip155:84532",
      "eip155:8453",
    ]);
  });

  it("is ready only switched on, complete and with an offered network", () => {
    expect(x402Ready(secret(), {})).toBe(true);
    expect(x402Ready(secret({}, false), {})).toBe(false);
    expect(x402Ready(null, {})).toBe(false);
    expect(x402Ready(secret({ networks: ["eip155:8453"] }), {})).toBe(false);
    expect(x402Ready(secret({ networks: ["eip155:8453"] }), { X402_MAINNET_AVAILABLE: "true" })).toBe(true);
  });

  it("takes a facilitator the way it takes a BTCPay server: https, loopback http outside production only", () => {
    expect(normalizeX402FacilitatorUrl("https://x402.org/facilitator/", {})).toBe("https://x402.org/facilitator");
    expect(normalizeX402FacilitatorUrl("http://127.0.0.1:4021", {})).toBe("http://127.0.0.1:4021");
    expect(normalizeX402FacilitatorUrl("http://127.0.0.1:4021", { NODE_ENV: "production" })).toBeNull();
    expect(normalizeX402FacilitatorUrl("https://10.0.0.5/f", { NODE_ENV: "production" })).toBeNull();
    expect(normalizeX402FacilitatorUrl("http://facilitator.example.com", {})).toBeNull();
    expect(normalizeX402FacilitatorUrl("https://x402.org/facilitator?key=1", {})).toBeNull();
  });
});

describe("PutTenantX402Schema", () => {
  it("checksums the address and normalizes the facilitator", () => {
    const parsed = PutTenantX402Schema.parse({
      pay_to: PAY_TO.toLowerCase(),
      networks: ["eip155:84532"],
      facilitator_url: "https://x402.org/facilitator/",
      is_enabled: true,
    });
    expect(parsed).toEqual({
      pay_to: PAY_TO,
      networks: ["eip155:84532"],
      facilitator_url: "https://x402.org/facilitator",
      is_enabled: true,
    });
  });

  it("refuses a mistyped mixed-case address, an unknown network and an unknown field", () => {
    expect(PutTenantX402Schema.safeParse({ pay_to: `${PAY_TO.slice(0, -1)}c` }).success).toBe(false);
    expect(PutTenantX402Schema.safeParse({ networks: ["base-sepolia"] }).success).toBe(false);
    expect(PutTenantX402Schema.safeParse({ private_key: "0x1" }).success).toBe(false);
  });

  it("reads an empty address as «keep the stored one»", () => {
    expect(PutTenantX402Schema.parse({ pay_to: "  " }).pay_to).toBeUndefined();
  });
});
