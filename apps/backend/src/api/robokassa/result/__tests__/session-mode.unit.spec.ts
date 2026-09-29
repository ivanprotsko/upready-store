import { createHash } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

import type { ResolvedRobokassaSecret } from "../../../../tenant-secrets/robokassa";

/**
 * 46df D2: the Result webhook is signed with password #2 of the mode the
 * payment was CREATED in, and Robokassa keeps that mode for the whole life of
 * the invoice, retries included. The shop's mode is the owner's switch in the
 * panel and can flip between the payment page and the webhook. These tests
 * flip it and send the webhook Robokassa would send.
 *
 * The expected signatures are computed here from Robokassa's documented string,
 * not with the module's own helper, so a change to the formula fails the test.
 */

// `jest.mock` is hoisted above every binding, so the mocks live in the
// factories and are read back through `jest.requireMock`.
jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

jest.mock("../../../../tenant-secrets/robokassa", () => ({
  ...jest.requireActual("../../../../tenant-secrets/robokassa"),
  readRobokassaSecret: jest.fn(),
}));

import { POST } from "../route";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as {
  __run: jest.Mock;
};
const { readRobokassaSecret } = jest.requireMock("../../../../tenant-secrets/robokassa") as {
  readRobokassaSecret: jest.Mock;
};

const SESSION_ID = "payses_46df_d2";
const INVOICE_ID = "465631662";
const OUT_SUM = "852.89";

const shopIn = (isTest: boolean): ResolvedRobokassaSecret => ({
  id: "tis_46df",
  tenant_id: "ten_46df",
  is_test: isTest,
  is_enabled: true,
  credentials: {
    merchant_login: "DEMO",
    password1: "live-one",
    password2: "live-two",
    test_password1: "test-one",
    test_password2: "test-two",
    hash_algorithm: "sha256",
  },
});

const signedWith = (password2: string) =>
  createHash("sha256")
    .update(`${OUT_SUM}:${INVOICE_ID}:${password2}:Shp_SessionID=${SESSION_ID}`)
    .digest("hex")
    .toUpperCase();

const sessionData = (isTest: boolean | undefined) => ({
  provider: "robokassa",
  tenant_id: "ten_46df",
  session_id: SESSION_ID,
  invoice_id: INVOICE_ID,
  out_sum: OUT_SUM,
  currency_code: "rub",
  ...(isTest === undefined ? {} : { is_test: isTest }),
  merchant_login: "DEMO",
  result_confirmed_at: null,
  result_out_sum: null,
});

const callResult = async (options: {
  sessionIsTest: boolean | undefined;
  shopIsTest: boolean;
  signature: string;
}) => {
  readRobokassaSecret.mockResolvedValue(shopIn(options.shopIsTest));
  const payment = {
    listPaymentSessions: jest.fn(async () => [
      {
        id: SESSION_ID,
        provider_id: "pp_robokassa_robokassa",
        data: sessionData(options.sessionIsTest),
        amount: 852.89,
        currency_code: "rub",
        status: "pending",
      },
    ]),
    updatePaymentSession: jest.fn(async () => ({})),
  };
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    [ContainerRegistrationKeys.PG_CONNECTION]: {},
    [Modules.PAYMENT]: payment,
  };
  const req = {
    method: "POST",
    query: {},
    body: {
      OutSum: OUT_SUM,
      InvId: INVOICE_ID,
      SignatureValue: options.signature,
      Shp_SessionID: SESSION_ID,
    },
    scope: { resolve: (key: string) => services[key] },
  };
  const answer = { status: 200, body: "" };
  const res = {
    status(code: number) {
      answer.status = code;
      return res;
    },
    type() {
      return res;
    },
    send(body: string) {
      answer.body = body;
      return res;
    },
  };

  await POST(req as never, res as never);
  return { ...answer, confirmed: payment.updatePaymentSession.mock.calls.length > 0 };
};

beforeEach(() => {
  workflowRun.mockClear();
  readRobokassaSecret.mockReset();
});

describe("Robokassa Result after the owner switched the shop's mode", () => {
  it("accepts a LIVE payment's Result after the shop was switched to test mode", async () => {
    const answer = await callResult({
      sessionIsTest: false,
      shopIsTest: true,
      signature: signedWith("live-two"),
    });

    expect(answer).toEqual({ status: 200, body: `OK${INVOICE_ID}`, confirmed: true });
    expect(workflowRun).toHaveBeenCalledTimes(1);
  });

  it("refuses the other pair's signature for a live payment", async () => {
    const answer = await callResult({
      sessionIsTest: false,
      shopIsTest: true,
      signature: signedWith("test-two"),
    });

    expect(answer).toMatchObject({ status: 400, body: "ERROR bad_signature", confirmed: false });
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("does not let a TEST payment pay an order once the shop is live", async () => {
    // The signature is genuine (Robokassa signs a test invoice with test
    // password #2), but no money moved. Before the fix this was refused as a
    // bad signature; it stays refused, now under its real reason.
    const answer = await callResult({
      sessionIsTest: true,
      shopIsTest: false,
      signature: signedWith("test-two"),
    });

    expect(answer).toMatchObject({ status: 400, body: "ERROR test_payment_in_live_mode", confirmed: false });
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("keeps a test payment in a shop that is still in test mode working", async () => {
    const answer = await callResult({
      sessionIsTest: true,
      shopIsTest: true,
      signature: signedWith("test-two"),
    });

    expect(answer).toEqual({ status: 200, body: `OK${INVOICE_ID}`, confirmed: true });
  });

  it("falls back to the shop's mode for a session that did not record one", async () => {
    const live = await callResult({
      sessionIsTest: undefined,
      shopIsTest: false,
      signature: signedWith("live-two"),
    });
    const test = await callResult({
      sessionIsTest: undefined,
      shopIsTest: true,
      signature: signedWith("test-two"),
    });

    expect(live).toEqual({ status: 200, body: `OK${INVOICE_ID}`, confirmed: true });
    expect(test).toEqual({ status: 200, body: `OK${INVOICE_ID}`, confirmed: true });
  });
});
