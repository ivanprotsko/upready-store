import { createHash } from "node:crypto";

import { buildRobokassaSession } from "../build-session";
import type { ResolvedRobokassaSecret } from "../../../tenant-secrets/robokassa";

/**
 * `buildRobokassaSession` is the one place the payment URL and its signature
 * are assembled (t-cherk-30 folds `Receipt` into it). Every expectation below
 * is a digest computed here from the string the fiscalization doc specifies,
 * not this module's own output echoed back.
 */

const digest = (value: string, algorithm = "sha256") => createHash(algorithm).update(value).digest("hex");

const secretFor = (overrides: Partial<ResolvedRobokassaSecret> = {}): ResolvedRobokassaSecret => ({
  id: "tis_test",
  tenant_id: "ten_test",
  is_test: true,
  is_enabled: true,
  credentials: {
    merchant_login: "DEMO",
    password1: "live-one",
    password2: "live-two",
    test_password1: "test-one",
    test_password2: "test-two",
    hash_algorithm: "sha256",
    fiscalization_enabled: false,
    sno: "osn",
    default_tax: "none",
    ...overrides.credentials,
  },
  ...overrides,
});

const baseInput = (secret: ResolvedRobokassaSecret) => ({
  secret,
  sessionId: "payses_01M2KWB39M4P5XFBSS3BHXQ3B2",
  amount: 100,
  currencyCode: "rub",
  successUrl: null,
  failUrl: null,
  email: null,
  culture: null,
  description: null,
  receiptLines: [],
});

describe("buildRobokassaSession: fiscalization off (t-cherk-30)", () => {
  it("is byte-identical to the pre-Receipt request: no Receipt param, no Receipt in the signature", () => {
    const secret = secretFor();
    const input = baseInput(secret);
    const session = buildRobokassaSession(input);

    const expectedSignature = digest(
      ["DEMO", "100.00", session.invoice_id, "test-one", `Shp_SessionID=${input.sessionId}`].join(":"),
    );

    const url = new URL(session.payment_url);
    expect(url.searchParams.get("SignatureValue")).toBe(expectedSignature);
    expect(url.searchParams.has("Receipt")).toBe(false);
    expect(session.payment_url).not.toContain("Receipt=");
    expect(session.receipt).toBeNull();
  });

  it("stays byte-identical even when the caller hands it cart lines it never asked for", () => {
    // Defence in depth: fiscalization off means off, whatever `receipt_lines`
    // a stale client happens to carry on the session.
    const secret = secretFor();
    const withLines = buildRobokassaSession({
      ...baseInput(secret),
      receiptLines: [{ name: "Товар", quantity: 1, amount: 100, kind: "item" }],
    });
    const withoutLines = buildRobokassaSession(baseInput(secret));

    expect(withLines.payment_url).toBe(withoutLines.payment_url);
  });
});

describe("buildRobokassaSession: fiscalization on (t-cherk-30)", () => {
  it("places Receipt right after InvId in the signature, matching the fiscalization doc's own example", () => {
    const secret = secretFor({
      credentials: {
        merchant_login: "DEMO",
        password1: "live-one",
        password2: "live-two",
        test_password1: "test-one",
        test_password2: "test-two",
        hash_algorithm: "sha256",
        fiscalization_enabled: true,
        sno: "osn",
        default_tax: "vat10",
      },
    });
    const input = {
      ...baseInput(secret),
      receiptLines: [{ name: "Название товара 1", quantity: 1, amount: 100, kind: "item" as const }],
    };
    const session = buildRobokassaSession(input);

    expect(session.receipt).toEqual({
      sno: "osn",
      items: [
        {
          name: "Название товара 1",
          quantity: 1,
          sum: 100,
          payment_method: "full_payment",
          payment_object: "commodity",
          tax: "vat10",
        },
      ],
    });

    const encodedReceipt = encodeURIComponent(JSON.stringify(session.receipt));
    const url = new URL(session.payment_url);
    expect(url.searchParams.get("Receipt")).toBe(encodedReceipt);

    // docs.robokassa.ru/ru/fiscalization: "MerchantLogin:OutSum:InvId:Receipt:Пароль#1".
    const expectedSignature = digest(
      ["DEMO", "100.00", session.invoice_id, encodedReceipt, "test-one", `Shp_SessionID=${input.sessionId}`].join(
        ":",
      ),
    );
    expect(url.searchParams.get("SignatureValue")).toBe(expectedSignature);
  });

  it("inserts Receipt before SuccessUrl2/FailUrl2, the fiscalization doc's modifier order", () => {
    const secret = secretFor({
      credentials: {
        merchant_login: "DEMO",
        password1: "live-one",
        password2: "live-two",
        test_password1: "test-one",
        test_password2: "test-two",
        hash_algorithm: "sha256",
        fiscalization_enabled: true,
        sno: "osn",
        default_tax: "vat20",
      },
    });
    const session = buildRobokassaSession({
      ...baseInput(secret),
      successUrl: "https://shop.test/ok",
      failUrl: "https://shop.test/fail",
      receiptLines: [{ name: "Товар", quantity: 1, amount: 100, kind: "item" }],
    });

    const encodedReceipt = encodeURIComponent(JSON.stringify(session.receipt));
    const expectedSignature = digest(
      [
        "DEMO",
        "100.00",
        session.invoice_id,
        encodedReceipt,
        "https://shop.test/ok",
        "GET",
        "https://shop.test/fail",
        "GET",
        "test-one",
        `Shp_SessionID=${session.session_id}`,
      ].join(":"),
    );
    const url = new URL(session.payment_url);
    expect(url.searchParams.get("SignatureValue")).toBe(expectedSignature);
  });

  it("carries shipping and a rounding remainder through to the actual request", () => {
    const secret = secretFor({
      credentials: {
        merchant_login: "DEMO",
        password1: "live-one",
        password2: "live-two",
        test_password1: "test-one",
        test_password2: "test-two",
        hash_algorithm: "sha256",
        fiscalization_enabled: true,
        sno: "osn",
        default_tax: "none",
      },
    });
    const session = buildRobokassaSession({
      ...baseInput(secret),
      amount: 10,
      receiptLines: [
        { name: "A", quantity: 1, amount: 3.3333, kind: "item" },
        { name: "B", quantity: 1, amount: 3.3333, kind: "item" },
        { name: "Доставка", quantity: 1, amount: 3.3334, kind: "shipping" },
      ],
    });

    expect(session.receipt?.items.map((item) => item.sum)).toEqual([3.33, 3.33, 3.34]);
    expect(session.receipt?.items.at(-1)?.payment_object).toBe("service");
    expect(session.receipt?.items.reduce((total, item) => total + item.sum, 0)).toBe(10);
  });
});
