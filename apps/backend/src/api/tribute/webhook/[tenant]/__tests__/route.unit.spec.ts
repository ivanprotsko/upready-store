import { createHmac } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * t-cherk-22: Tribute's per-shop webhook (`/tribute/webhook/:tenant`).
 *
 * `trbt-signature` is verified for real here (`tributeSignature`/
 * `verifyTributeSignature` are NOT mocked) — only `readTributeSecret` is, so
 * each test controls which shop's key the route checks against without
 * faking a Postgres connection. The brief's explicit ask: tests for the
 * signature (good/bad/tampered) and for the statuses (event → capture
 * mapping, idempotency).
 */

jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

jest.mock("../../../../../tenant-secrets/tribute", () => ({
  ...jest.requireActual("../../../../../tenant-secrets/tribute"),
  readTributeSecret: jest.fn(),
}));

import { POST } from "../route";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as { __run: jest.Mock };
const { readTributeSecret } = jest.requireMock("../../../../../tenant-secrets/tribute") as {
  readTributeSecret: jest.Mock;
};

const TENANT_ID = "ten_cherk";
const API_KEY = "trbt_live_abc123";
const ORDER_UUID = "order-uuid-1";
const SESSION_ID = "payses_tribute_1";

const sign = (body: Buffer, key: string) => createHmac("sha256", key).update(body).digest("hex");

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  amount: 1500,
  currency_code: "rub",
  data: {
    provider: "tribute",
    tenant_id: TENANT_ID,
    session_id: SESSION_ID,
    order_uuid: ORDER_UUID,
    currency_code: "rub",
    amount_minor: 150000,
    payment_url: "https://t.me/pay/1",
    webapp_payment_url: "https://t.me/tribute/app?startapp=1",
    success_url: "https://olavka.com/success",
    fail_url: "https://olavka.com/fail",
    confirmed_at: null,
    last_event: null,
    last_failure_at: null,
    ...overrides,
  },
});

const buildPg = (row: ReturnType<typeof sessionRow>) => {
  const updates: Array<{ id: string; data: unknown }> = [];
  const paymentSessionTable = {
    select: () => paymentSessionTable,
    where: () => paymentSessionTable,
    whereRaw: (_sql: string, [uuid]: [string]) => {
      paymentSessionTable.__match = uuid === row.data.order_uuid;
      return paymentSessionTable;
    },
    __match: true,
    first: async () => (paymentSessionTable.__match ? row : undefined),
  };
  return {
    pg: (table: string) => {
      if (table === "payment_session") return paymentSessionTable;
      throw new Error(`unexpected table ${table}`);
    },
    updates,
  };
};

const callWebhook = async (options: {
  apiKey?: string;
  secretEnabled?: boolean;
  bodyObj: Record<string, unknown>;
  signatureOverride?: string;
  row?: ReturnType<typeof sessionRow>;
  tenantParam?: string;
  noRawBody?: boolean;
}) => {
  const row = options.row ?? sessionRow();
  readTributeSecret.mockResolvedValue(
    options.secretEnabled === false
      ? null
      : {
          id: "tis_cherk",
          tenant_id: TENANT_ID,
          is_enabled: true,
          credentials: { api_key: options.apiKey ?? API_KEY, shop_id: null },
        },
  );

  const rawBody = Buffer.from(JSON.stringify(options.bodyObj));
  const signature = options.signatureOverride ?? sign(rawBody, options.apiKey ?? API_KEY);

  const payment = { updatePaymentSession: jest.fn(async () => ({})) };
  const { pg } = buildPg(row);
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    [ContainerRegistrationKeys.PG_CONNECTION]: pg,
    [Modules.PAYMENT]: payment,
  };

  const req = {
    params: { tenant: options.tenantParam ?? TENANT_ID },
    headers: { "trbt-signature": signature },
    body: options.bodyObj,
    ...(options.noRawBody ? {} : { rawBody }),
    scope: { resolve: (key: string) => services[key] },
  };

  const answer: { status: number; body?: unknown } = { status: 0 };
  const res = {
    status(code: number) {
      answer.status = code;
      return res;
    },
    json(body: unknown) {
      answer.body = body;
      return res;
    },
  };

  await POST(req as never, res as never);
  return { ...answer, updateCalls: payment.updatePaymentSession.mock.calls, row };
};

beforeEach(() => {
  workflowRun.mockClear();
  readTributeSecret.mockReset();
});

describe("Tribute webhook signature", () => {
  it("accepts a correctly signed shop_order (paid) and captures the session", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } },
    });

    expect(result).toMatchObject({ status: 200, body: { status: "ok" } });
    expect(result.updateCalls).toHaveLength(1);
    expect(result.updateCalls[0][0].data.confirmed_at).toEqual(expect.any(String));
    expect(workflowRun).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad signature (wrong key) with 401 and takes no action", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } },
      signatureOverride: sign(Buffer.from("something else"), API_KEY),
    });

    expect(result.status).toBe(401);
    expect(result.updateCalls).toHaveLength(0);
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("rejects a TAMPERED body: signature computed over the original bytes, body changed after", async () => {
    const originalBody = { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } };
    const originalRaw = Buffer.from(JSON.stringify(originalBody));
    const genuineSignature = sign(originalRaw, API_KEY);
    // The attacker changes the parsed body (e.g. re-stringified with a field
    // added) but replays the signature of the ORIGINAL bytes.
    const tamperedBody = { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid", amount: 1 } };

    const result = await callWebhook({
      bodyObj: tamperedBody,
      signatureOverride: genuineSignature,
    });

    expect(result.status).toBe(401);
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("rejects when another shop's key signs the body (cross-tenant replay)", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } },
      signatureOverride: sign(Buffer.from(JSON.stringify({ name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } })), "someone-elses-key"),
    });

    expect(result.status).toBe(401);
  });

  it("answers 400 when the raw body was not preserved (bodyParser misconfigured)", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } },
      noRawBody: true,
    });

    expect(result.status).toBe(400);
  });
});

describe("Tribute webhook status mapping", () => {
  it("shop_order_payment_received is intermediate: recorded, never captures", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order_payment_received", payload: { uuid: ORDER_UUID } },
    });

    expect(result.status).toBe(200);
    expect(result.updateCalls).toHaveLength(1);
    expect(result.updateCalls[0][0].data.confirmed_at).toBeNull();
    expect(result.updateCalls[0][0].data.last_event).toBe("shop_order_payment_received");
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("shop_order_payment_failed stays pending and records the failure", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order_payment_failed", payload: { uuid: ORDER_UUID, errorCode: "payment_declined" } },
    });

    expect(result.status).toBe(200);
    expect(result.updateCalls[0][0].data.confirmed_at).toBeNull();
    expect(result.updateCalls[0][0].data.last_failure_at).toEqual(expect.any(String));
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("shop_order_refunded is acknowledged and idempotent across its two retries", async () => {
    const row = sessionRow();
    const first = await callWebhook({
      bodyObj: { name: "shop_order_refunded", payload: { uuid: ORDER_UUID, transactionId: "tx_1" } },
      row,
    });
    const second = await callWebhook({
      bodyObj: { name: "shop_order_refunded", payload: { uuid: ORDER_UUID, transactionId: "tx_1" } },
      row,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("an unrecognized event name is acknowledged 200 without touching the session", async () => {
    const result = await callWebhook({
      bodyObj: { name: "some_future_event", payload: { uuid: ORDER_UUID } },
    });

    expect(result.status).toBe(200);
    expect(result.updateCalls).toHaveLength(0);
  });

  it("is idempotent: a REPLAYED final shop_order does not re-run the completion workflow", async () => {
    const row = sessionRow();
    const bodyObj = { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } };

    const first = await callWebhook({ bodyObj, row });
    expect(workflowRun).toHaveBeenCalledTimes(1);

    // The second delivery sees the row AS UPDATED by the first (confirmed_at set).
    const confirmedRow = sessionRow({ confirmed_at: first.updateCalls[0][0].data.confirmed_at });
    await callWebhook({ bodyObj, row: confirmedRow });

    expect(workflowRun).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for an order uuid that matches no stored session", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: "unknown-uuid", status: "paid" } },
    });

    expect(result.status).toBe(404);
  });

  it("answers 404 when the shop has no Tribute account configured", async () => {
    const result = await callWebhook({
      bodyObj: { name: "shop_order", payload: { uuid: ORDER_UUID, status: "paid" } },
      secretEnabled: false,
    });

    expect(result.status).toBe(404);
  });
});
