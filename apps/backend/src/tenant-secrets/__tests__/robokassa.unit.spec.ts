import { createHash } from "node:crypto";

import {
  formatOutSum,
  invoiceIdFor,
  passwordFor,
  robokassaSignature,
  signaturesEqual,
  verifyResultSignature,
  verifySuccessSignature,
  type ResolvedRobokassaSecret,
} from "../robokassa";

/**
 * Robokassa's signature, the one thing both directions of the integration rest
 * on (i01-robokassa-checkout). The expectations below are not this module's own
 * output echoed back: every one of them is a digest computed here from the
 * string Robokassa's own documentation specifies, so a change to the join or to
 * the algorithm selection fails the test instead of redefining it.
 */

const secretFor = (overrides: Partial<ResolvedRobokassaSecret> = {}): ResolvedRobokassaSecret => ({
  id: "tis_test",
  tenant_id: "ten_test",
  is_test: false,
  is_enabled: true,
  credentials: {
    merchant_login: "DEMO",
    password1: "live-one",
    password2: "live-two",
    test_password1: "test-one",
    test_password2: "test-two",
    hash_algorithm: "sha256",
  },
  ...overrides,
});

const digest = (value: string, algorithm: string) =>
  createHash(algorithm).update(value).digest("hex");

describe("robokassaSignature", () => {
  it("joins the parts with a colon and hashes them with MD5", () => {
    const signature = robokassaSignature(["DEMO", "100.00", "42", "live-one"], "md5");

    expect(signature).toBe(digest("DEMO:100.00:42:live-one", "md5"));
    expect(signature).toHaveLength(32);
  });

  it("hashes with the configured algorithm, not a fixed one", () => {
    const parts = ["DEMO", "100.00", "42", "live-one"];
    const joined = "DEMO:100.00:42:live-one";

    expect(robokassaSignature(parts, "sha256")).toBe(digest(joined, "sha256"));
    expect(robokassaSignature(parts, "sha384")).toBe(digest(joined, "sha384"));
    expect(robokassaSignature(parts, "sha512")).toBe(digest(joined, "sha512"));
    expect(robokassaSignature(parts, "md5")).not.toBe(robokassaSignature(parts, "sha256"));
  });

  it("drops empty, null and undefined parts instead of leaving empty slots", () => {
    // Robokassa builds its own check without the optional parameters that were
    // not sent, so `a::b` would never match on its side.
    expect(robokassaSignature(["DEMO", null, "100.00", undefined, "", "42"], "md5")).toBe(
      digest("DEMO:100.00:42", "md5"),
    );
  });

  it("keeps the custom Shp_ parameter as name=value, last", () => {
    expect(
      robokassaSignature(["DEMO", "100.00", "42", "live-one", "Shp_SessionID=payses_1"], "sha256"),
    ).toBe(digest("DEMO:100.00:42:live-one:Shp_SessionID=payses_1", "sha256"));
  });
});

describe("signaturesEqual", () => {
  it("ignores case, because Robokassa sends uppercase hex", () => {
    const expected = digest("DEMO:100.00:42:live-one", "md5");

    expect(signaturesEqual(expected, expected.toUpperCase())).toBe(true);
    expect(signaturesEqual(expected, expected)).toBe(true);
  });

  it("refuses an absent or a different value", () => {
    const expected = digest("DEMO:100.00:42:live-one", "md5");

    expect(signaturesEqual(expected, null)).toBe(false);
    expect(signaturesEqual(expected, undefined)).toBe(false);
    expect(signaturesEqual(expected, "")).toBe(false);
    expect(signaturesEqual(expected, "deadbeef")).toBe(false);
  });
});

describe("passwordFor", () => {
  it("takes the live pair outside test mode and the test pair inside it", () => {
    const live = secretFor({ is_test: false });
    const test = secretFor({ is_test: true });

    expect(passwordFor(live, 1)).toBe("live-one");
    expect(passwordFor(live, 2)).toBe("live-two");
    expect(passwordFor(test, 1)).toBe("test-one");
    expect(passwordFor(test, 2)).toBe("test-two");
  });
});

describe("formatOutSum", () => {
  it("always carries two decimals with a dot, the form Robokassa echoes back", () => {
    expect(formatOutSum(1084)).toBe("1084.00");
    expect(formatOutSum("1084.5")).toBe("1084.50");
    expect(formatOutSum(0.1 + 0.2)).toBe("0.30");
  });
});

describe("invoiceIdFor", () => {
  it("is a positive integer below 2^31, stable for one session", () => {
    const first = invoiceIdFor("payses_01M2KWB39M4P5XFBSS3BHXQ3B2");

    expect(first).toMatch(/^[1-9][0-9]*$/);
    expect(Number(first)).toBeLessThan(2 ** 31);
    expect(invoiceIdFor("payses_01M2KWB39M4P5XFBSS3BHXQ3B2")).toBe(first);
  });

  it("separates two sessions", () => {
    expect(invoiceIdFor("payses_a")).not.toBe(invoiceIdFor("payses_b"));
  });
});

describe("verifyResultSignature", () => {
  const payload = (secret: ResolvedRobokassaSecret) => {
    const password = passwordFor(secret, 2);
    return {
      OutSum: "1084.00",
      InvId: "116796573",
      Shp_SessionID: "payses_1",
      SignatureValue: digest(
        `1084.00:116796573:${password}:Shp_SessionID=payses_1`,
        secret.credentials.hash_algorithm,
      ),
    };
  };

  it("accepts the webhook Robokassa signs with password #2", () => {
    const secret = secretFor();
    expect(verifyResultSignature(payload(secret), secret)).toBe(true);
  });

  it("accepts the TEST webhook, which is signed with the test password #2", () => {
    // The asymmetry that matters: in test mode Robokassa signs with the test
    // pair, so a verifier that always reaches for the live password #2 refuses
    // every callback of a shop that is still in test mode.
    const secret = secretFor({ is_test: true });
    expect(verifyResultSignature(payload(secret), secret)).toBe(true);

    const live = secretFor({ is_test: false });
    expect(verifyResultSignature(payload(secret), live)).toBe(false);
  });

  it("refuses password #1, a changed sum and a changed session", () => {
    const secret = secretFor();
    const valid = payload(secret);

    expect(
      verifyResultSignature(
        {
          ...valid,
          SignatureValue: digest(
            "1084.00:116796573:live-one:Shp_SessionID=payses_1",
            "sha256",
          ),
        },
        secret,
      ),
    ).toBe(false);
    expect(verifyResultSignature({ ...valid, OutSum: "1.00" }, secret)).toBe(false);
    expect(verifyResultSignature({ ...valid, Shp_SessionID: "payses_2" }, secret)).toBe(false);
  });

  it("works with MD5 for a shop whose dashboard is set to MD5", () => {
    const secret = secretFor({
      credentials: { ...secretFor().credentials, hash_algorithm: "md5" },
    });
    expect(verifyResultSignature(payload(secret), secret)).toBe(true);
  });
});

describe("verifySuccessSignature", () => {
  it("checks the browser return against password #1, not #2", () => {
    const secret = secretFor();
    const signed = (password: string) =>
      digest(`1084.00:116796573:${password}:Shp_SessionID=payses_1`, "sha256");
    const base = { OutSum: "1084.00", InvId: "116796573", Shp_SessionID: "payses_1" };

    expect(verifySuccessSignature({ ...base, SignatureValue: signed("live-one") }, secret)).toBe(
      true,
    );
    expect(verifySuccessSignature({ ...base, SignatureValue: signed("live-two") }, secret)).toBe(
      false,
    );
  });
});
