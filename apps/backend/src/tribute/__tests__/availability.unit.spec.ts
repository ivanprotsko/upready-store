import { tributeAvailable, TRIBUTE_FLAG } from "../availability";

/**
 * t-cherk-22, part A: Tribute exists only where `TRIBUTE_AVAILABLE` is exactly
 * `true`. Off by default, so the RU instance, which never sets it, never
 * offers Tribute.
 */

describe("tributeAvailable", () => {
  it("is off when the variable is not set", () => {
    expect(tributeAvailable({})).toBe(false);
  });

  it("is on for exactly `true`", () => {
    expect(tributeAvailable({ [TRIBUTE_FLAG]: "true" })).toBe(true);
  });

  it.each(["", "false", "TRUE", "True", " true", "true ", "1", "yes", "on"])("is off for %p", (value) => {
    expect(tributeAvailable({ [TRIBUTE_FLAG]: value })).toBe(false);
  });

  it("does not follow the cryptocurrency switch", () => {
    expect(tributeAvailable({ PAYMENTS_CRYPTO_AVAILABLE: "true" })).toBe(false);
  });

  it("reads the process environment by default, on every call", () => {
    const previous = process.env[TRIBUTE_FLAG];
    try {
      delete process.env[TRIBUTE_FLAG];
      expect(tributeAvailable()).toBe(false);
      process.env[TRIBUTE_FLAG] = "true";
      expect(tributeAvailable()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env[TRIBUTE_FLAG];
      else process.env[TRIBUTE_FLAG] = previous;
    }
  });
});
