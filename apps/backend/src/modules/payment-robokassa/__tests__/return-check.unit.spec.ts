import { createHash } from "node:crypto";

import type { ResolvedRobokassaSecret } from "../../../tenant-secrets/robokassa";
import type { RobokassaSessionData } from "../build-session";
import type { RobokassaOpState } from "../op-state";
import { checkRobokassaReturn, returnSignatureConfirms } from "../return-check";

/**
 * t-2026-10-12-13 (D2, D3): what the buyer's return proves. The return's
 * signature is the one Robokassa's full-page return carried on the test shop
 * on 12.10.2026 (`OutSum=1740.00&InvId=…&Shp_SessionID=…&SignatureValue=…`),
 * built here with the documented formula `OutSum:InvId:Password#1:Shp_SessionID=<id>`.
 */

const secret = (isTest: boolean): ResolvedRobokassaSecret => ({
  id: "tis_1",
  tenant_id: "ten_1",
  is_test: isTest,
  is_enabled: true,
  credentials: {
    merchant_login: "OLAVKA",
    password1: "live-one",
    password2: "live-two",
    test_password1: "test-one",
    test_password2: "test-two",
    hash_algorithm: "sha256",
    fiscalization_enabled: false,
    sno: "osn",
    default_tax: "none",
    disabled_methods: [],
  },
});

const session = (isTest: boolean): Partial<RobokassaSessionData> => ({
  session_id: "payses_1",
  invoice_id: "1230629747",
  out_sum: "1740.00",
  is_test: isTest,
  merchant_login: "OLAVKA",
});

const sign = (password: string, outSum = "1740.00", invId = "1230629747", sessionId = "payses_1") =>
  createHash("sha256").update(`${outSum}:${invId}:${password}:Shp_SessionID=${sessionId}`).digest("hex").toUpperCase();

const params = (password: string) => ({
  OutSum: "1740.00",
  InvId: "1230629747",
  Shp_SessionID: "payses_1",
  SignatureValue: sign(password),
});

const never = async (): Promise<RobokassaOpState | null> => {
  throw new Error("OpStateExt must not be asked");
};

describe("returnSignatureConfirms", () => {
  it("confirms the session's own invoice signed with password #1 of the session's mode", () => {
    expect(returnSignatureConfirms(session(true), params("test-one"), secret(true))).toBe(true);
    expect(returnSignatureConfirms(session(false), params("live-one"), secret(false))).toBe(true);
  });

  it("takes the same sum written with more decimals", () => {
    const longSum = { ...params("test-one"), OutSum: "1740.000000", SignatureValue: sign("test-one", "1740.000000") };
    expect(returnSignatureConfirms(session(true), longSum, secret(true))).toBe(true);
  });

  it("refuses password #2, the other mode's password, a forged value and a missing one", () => {
    expect(returnSignatureConfirms(session(true), params("test-two"), secret(true))).toBe(false);
    expect(returnSignatureConfirms(session(true), params("live-one"), secret(true))).toBe(false);
    expect(returnSignatureConfirms(session(true), { ...params("test-one"), SignatureValue: "deadbeef" }, secret(true))).toBe(false);
    expect(returnSignatureConfirms(session(true), { ...params("test-one"), SignatureValue: undefined }, secret(true))).toBe(false);
  });

  it("refuses a valid signature for another session, invoice or sum", () => {
    const other = { ...params("test-one"), Shp_SessionID: "payses_2", SignatureValue: sign("test-one", "1740.00", "1230629747", "payses_2") };
    expect(returnSignatureConfirms(session(true), other, secret(true))).toBe(false);
    const otherInvoice = { ...params("test-one"), InvId: "1", SignatureValue: sign("test-one", "1740.00", "1") };
    expect(returnSignatureConfirms(session(true), otherInvoice, secret(true))).toBe(false);
    const cheaper = { ...params("test-one"), OutSum: "1.00", SignatureValue: sign("test-one", "1.00") };
    expect(returnSignatureConfirms(session(true), cheaper, secret(true))).toBe(false);
  });

  it("never lets a test invoice confirm a shop that is live now", () => {
    expect(returnSignatureConfirms(session(true), params("test-one"), secret(false))).toBe(false);
  });
});

describe("checkRobokassaReturn", () => {
  it("confirms by the signature without asking Robokassa", async () => {
    await expect(
      checkRobokassaReturn({ data: session(true), params: params("test-one"), shopSecret: secret(true), askOpState: never }),
    ).resolves.toEqual({ kind: "confirmed", by: "success_signature", outSum: "1740.00" });
  });

  it("leaves a test invoice without a signature pending, OpStateExt does not see test payments", async () => {
    await expect(
      checkRobokassaReturn({ data: session(true), params: {}, shopSecret: secret(true), askOpState: never }),
    ).resolves.toEqual({ kind: "pending", reason: "test_invoice_without_signature" });
  });

  it("asks OpStateExt with live password #2 for a live invoice the modal returned without a signature", async () => {
    const asked: unknown[] = [];
    const decision = await checkRobokassaReturn({
      data: session(false),
      params: {},
      shopSecret: secret(false),
      askOpState: async (input) => {
        asked.push(input);
        return { resultCode: 0, stateCode: 100, incSum: "1740.000000", outSum: "1700.00" };
      },
    });
    expect(decision).toEqual({ kind: "confirmed", by: "op_state", outSum: "1740.00" });
    expect(asked).toEqual([{ merchantLogin: "OLAVKA", invoiceId: "1230629747", password2: "live-two" }]);
  });

  it("says not paid when Robokassa does not know the invoice or cancelled it", async () => {
    await expect(
      checkRobokassaReturn({
        data: session(false),
        params: {},
        shopSecret: secret(false),
        askOpState: async () => ({ resultCode: 3, stateCode: null, incSum: null, outSum: null }),
      }),
    ).resolves.toEqual({ kind: "not_paid", reason: "op_state_not_found" });
    await expect(
      checkRobokassaReturn({
        data: session(false),
        params: {},
        shopSecret: secret(false),
        askOpState: async () => ({ resultCode: 0, stateCode: 10, incSum: null, outSum: null }),
      }),
    ).resolves.toEqual({ kind: "not_paid", reason: "op_state_state_10" });
  });

  it("stays pending while the payment is on its way or Robokassa cannot be asked", async () => {
    await expect(
      checkRobokassaReturn({
        data: session(false),
        params: {},
        shopSecret: secret(false),
        askOpState: async () => ({ resultCode: 0, stateCode: 50, incSum: "1740.00", outSum: "1740.00" }),
      }),
    ).resolves.toEqual({ kind: "pending", reason: "op_state_state_50" });
    await expect(
      checkRobokassaReturn({ data: session(false), params: {}, shopSecret: secret(false), askOpState: async () => null }),
    ).resolves.toEqual({ kind: "pending", reason: "op_state_unreachable" });
  });

  it("checks a live session in the session's mode even after the owner switched the shop to test", async () => {
    await expect(
      checkRobokassaReturn({ data: session(false), params: params("live-one"), shopSecret: secret(true), askOpState: never }),
    ).resolves.toEqual({ kind: "confirmed", by: "success_signature", outSum: "1740.00" });
  });
});
