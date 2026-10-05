import { cryptoPaymentsAvailable, CRYPTO_PAYMENTS_FLAG } from "../availability";

/**
 * ask-20261005-070255-438f, the lead's review of PR #272: BTCPay exists only
 * where `PAYMENTS_CRYPTO_AVAILABLE` is exactly `true`. Off by default, so the
 * RU instance, which never sets it, never offers cryptocurrency.
 */

describe("cryptoPaymentsAvailable", () => {
  it("is off when the variable is not set", () => {
    expect(cryptoPaymentsAvailable({})).toBe(false);
  });

  it("is on for exactly `true`", () => {
    expect(cryptoPaymentsAvailable({ [CRYPTO_PAYMENTS_FLAG]: "true" })).toBe(true);
  });

  it.each(["", "false", "TRUE", "True", " true", "true ", "1", "yes", "on"])(
    "is off for %p",
    (value) => {
      expect(cryptoPaymentsAvailable({ [CRYPTO_PAYMENTS_FLAG]: value })).toBe(false);
    },
  );

  it("reads the process environment by default, on every call", () => {
    const previous = process.env[CRYPTO_PAYMENTS_FLAG];
    try {
      delete process.env[CRYPTO_PAYMENTS_FLAG];
      expect(cryptoPaymentsAvailable()).toBe(false);
      process.env[CRYPTO_PAYMENTS_FLAG] = "true";
      expect(cryptoPaymentsAvailable()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env[CRYPTO_PAYMENTS_FLAG];
      else process.env[CRYPTO_PAYMENTS_FLAG] = previous;
    }
  });
});
