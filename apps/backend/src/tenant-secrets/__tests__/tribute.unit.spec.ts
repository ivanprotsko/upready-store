import {
  fromTributeMinorUnits,
  maskTributeSettings,
  toTributeMinorUnits,
  tributeSignature,
  verifyTributeSignature,
  type ResolvedTributeSecret,
} from "../tribute";

/**
 * t-cherk-22: Tribute's webhook signature (`trbt-signature`, HMAC-SHA256 of
 * the raw body under the shop's own `api_key`) and the minor-units amount
 * conversion every currency Tribute accepts (rub/usd/eur) needs.
 */

describe("tributeSignature / verifyTributeSignature", () => {
  const apiKey = "trbt_live_secret";
  const body = Buffer.from(JSON.stringify({ name: "shop_order", payload: { uuid: "u1", status: "paid" } }));

  it("accepts the correct HMAC-SHA256 hex digest of the exact raw bytes", () => {
    const header = tributeSignature(body, apiKey);
    expect(verifyTributeSignature(body, apiKey, header)).toBe(true);
  });

  it("rejects a signature made with the wrong key", () => {
    const header = tributeSignature(body, "a-different-key");
    expect(verifyTributeSignature(body, apiKey, header)).toBe(false);
  });

  it("rejects a signature that does not match a TAMPERED body (bytes changed after signing)", () => {
    const header = tributeSignature(body, apiKey);
    const tampered = Buffer.from(JSON.stringify({ name: "shop_order", payload: { uuid: "u1", status: "paid", amount: 999 } }));
    expect(verifyTributeSignature(tampered, apiKey, header)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyTributeSignature(body, apiKey, undefined)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(verifyTributeSignature(body, apiKey, "")).toBe(false);
  });

  it("rejects a header that is not valid hex / wrong length, without throwing", () => {
    expect(verifyTributeSignature(body, apiKey, "not-hex-at-all")).toBe(false);
    expect(verifyTributeSignature(body, apiKey, "ab")).toBe(false);
  });

  it("is case-insensitive on the incoming header, as Tribute's own hex digest is", () => {
    const header = tributeSignature(body, apiKey).toUpperCase();
    expect(verifyTributeSignature(body, apiKey, header)).toBe(true);
  });

  it("signs the RAW bytes, not a re-serialization: different whitespace is a different signature", () => {
    const compact = Buffer.from(JSON.stringify({ a: 1 }));
    const spaced = Buffer.from(JSON.stringify({ a: 1 }, null, 2));
    expect(tributeSignature(compact, apiKey)).not.toEqual(tributeSignature(spaced, apiKey));
  });
});

describe("toTributeMinorUnits / fromTributeMinorUnits", () => {
  it.each([
    [1500, 150000],
    [1500.5, 150050],
    [0.01, 1],
    [19.999, 2000], // rounds to the nearest minor unit
  ])("converts %s major units to %s minor units for rub/usd/eur alike", (major, minor) => {
    expect(toTributeMinorUnits(major)).toBe(minor);
  });

  it("round-trips through fromTributeMinorUnits", () => {
    expect(fromTributeMinorUnits(toTributeMinorUnits(1234.56))).toBeCloseTo(1234.56, 2);
  });

  it("accepts a string amount, same as formatOutSum does for Robokassa", () => {
    expect(toTributeMinorUnits("99.90")).toBe(9990);
  });
});

describe("maskTributeSettings", () => {
  const secret: ResolvedTributeSecret = {
    id: "tis_1",
    tenant_id: "ten_1",
    is_enabled: true,
    credentials: { api_key: "trbt_live_abcdef1234", shop_id: "shop_9" },
  };

  it("never returns the api_key itself, only whether it is set and its last four characters", () => {
    const masked = maskTributeSettings(secret);
    expect(masked).toEqual({
      id: "tis_1",
      provider: "tribute",
      is_enabled: true,
      shop_id: "shop_9",
      api_key: { set: true, last4: "1234" },
    });
    expect(JSON.stringify(masked)).not.toContain("trbt_live_abcdef1234");
  });
});
