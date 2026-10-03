import { decryptJson, deriveKey, encryptJson, keyFromEnv, maskSecret } from "../crypto";
import {
  invoiceIdFor,
  maskRobokassaSettings,
  robokassaSignature,
  verifyResultSignature,
  verifySuccessSignature,
  type ResolvedRobokassaSecret,
} from "../robokassa";

/**
 * Unit facts of `src/tenant-secrets` (t03-tenant-secrets-robokassa): the
 * ciphertext never carries the plaintext, the masked view never carries a
 * secret, and the Robokassa signatures follow the documented order.
 */
describe("tenant-secrets/crypto", () => {
  const key = deriveKey("unit-test-passphrase");

  it("round-trips JSON and keeps the plaintext out of the blob", () => {
    const value = { password1: "p1-secret", nested: { n: 1 } };
    const blob = encryptJson(value, key);
    expect(blob).not.toContain("p1-secret");
    expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decryptJson(blob, key)).toEqual(value);
    // A fresh IV per call: the same value never encrypts to the same blob.
    expect(encryptJson(value, key)).not.toBe(blob);
  });

  it("refuses a wrong key and a tampered blob", () => {
    const blob = encryptJson({ a: 1 }, key);
    expect(() => decryptJson(blob, deriveKey("other"))).toThrow();
    const tampered = Buffer.from(blob, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptJson(tampered.toString("base64"), key)).toThrow();
  });

  it("fails loudly without the platform key instead of falling back to plaintext", () => {
    expect(() => keyFromEnv({})).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("masks to last four characters and never less than the whole of a short value", () => {
    expect(maskSecret("abcdefgh")).toEqual({ set: true, last4: "efgh" });
    expect(maskSecret("ab")).toEqual({ set: true, last4: "••" });
    expect(maskSecret("")).toEqual({ set: false, last4: null });
    expect(maskSecret(undefined)).toEqual({ set: false, last4: null });
  });
});

describe("tenant-secrets/robokassa", () => {
  const secret: ResolvedRobokassaSecret = {
    id: "tis_1",
    tenant_id: "ten_1",
    is_test: true,
    is_enabled: true,
    credentials: {
      merchant_login: "SHOP",
      hash_algorithm: "sha256",
      password1: "live-one",
      password2: "live-two",
      test_password1: "test-one",
      test_password2: "test-two",
      fiscalization_enabled: false,
      sno: "osn",
      default_tax: "none",
    },
  };

  it("masks every secret field of the settings view", () => {
    const masked = maskRobokassaSettings(secret);
    const serialized = JSON.stringify(masked);
    for (const value of ["live-one", "live-two", "test-one", "test-two"]) {
      expect(serialized).not.toContain(value);
    }
    expect(masked.password1).toEqual({ set: true, last4: "-one" });
    expect(masked.merchant_login).toBe("SHOP");
  });

  it("joins non-empty parts with ':' and hashes hex, as Robokassa does", () => {
    expect(robokassaSignature(["a", "", "b", null, "c"], "md5")).toBe(
      require("node:crypto").createHash("md5").update("a:b:c").digest("hex"),
    );
  });

  it("verifies the Result webhook with password #2 of the active mode, case-insensitively", () => {
    const payload = { OutSum: "10.00", InvId: "42", Shp_SessionID: "payses_1", SignatureValue: "" };
    const expected = robokassaSignature(["10.00", "42", "test-two", "Shp_SessionID=payses_1"], "sha256");
    expect(verifyResultSignature({ ...payload, SignatureValue: expected.toUpperCase() }, secret)).toBe(true);
    expect(verifyResultSignature({ ...payload, SignatureValue: expected }, { ...secret, is_test: false })).toBe(false);
    const successExpected = robokassaSignature(["10.00", "42", "test-one", "Shp_SessionID=payses_1"], "sha256");
    expect(verifySuccessSignature({ ...payload, SignatureValue: successExpected }, secret)).toBe(true);
    expect(verifyResultSignature({ ...payload, SignatureValue: successExpected }, secret)).toBe(false);
  });

  it("derives a stable positive int32 invoice id from the session id", () => {
    const id = invoiceIdFor("payses_01ABC");
    expect(id).toBe(invoiceIdFor("payses_01ABC"));
    expect(Number(id)).toBeGreaterThan(0);
    expect(Number(id)).toBeLessThan(2 ** 31);
    expect(id).not.toBe(invoiceIdFor("payses_01ABD"));
  });
});
