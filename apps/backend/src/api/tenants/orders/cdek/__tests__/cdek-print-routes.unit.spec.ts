import { CdekError } from "../../../../../cdek/client";
import { CdekPrintTimeoutError, printCdekLabels, printCdekWaybill } from "../../../../../cdek/print";
import { readCdekSecret } from "../../../../../tenant-secrets/cdek";
import { GET as getLabel } from "../../[id]/fulfillments/[fulfillment_id]/cdek/label/route";
import { GET as getWaybill } from "../../[id]/fulfillments/[fulfillment_id]/cdek/waybill/route";
import { POST as postLabels } from "../labels/route";

/**
 * The CDEK label and receipt routes of the order card (t-2026-10-14-58, part A).
 * The print client and the secret reader are replaced, so these hold the route
 * side: whose fulfillment may be printed, which refusal answers what, and what
 * reaches CDEK. `cdek/__tests__/print.unit.spec.ts` holds the CDEK side.
 */

jest.mock("../../../../../cdek/print", () => ({
  ...jest.requireActual("../../../../../cdek/print"),
  printCdekLabels: jest.fn(),
  printCdekWaybill: jest.fn(),
}));

jest.mock("../../../../../tenant-secrets/cdek", () => ({
  ...jest.requireActual("../../../../../tenant-secrets/cdek"),
  readCdekSecret: jest.fn(),
}));

const PDF = Buffer.from("%PDF-1.4 test");

const printLabels = printCdekLabels as jest.MockedFunction<typeof printCdekLabels>;
const printWaybill = printCdekWaybill as jest.MockedFunction<typeof printCdekWaybill>;
const readSecret = readCdekSecret as jest.MockedFunction<typeof readCdekSecret>;

type Row = {
  id: string;
  provider_id: string;
  canceled_at?: string | null;
  data: Record<string, unknown>;
  order: { id: string; display_id: number };
};

const cdekRow = (id: string, orderId: string, displayId: number, uuid: string | null = `uuid-${id}`): Row => ({
  id,
  provider_id: "cdek_cdek",
  canceled_at: null,
  data: { provider: "cdek", tenant_id: "ten_own", cdek_order_uuid: uuid },
  order: { id: orderId, display_id: displayId },
});

/** Two orders of the caller's shop and one of another shop's. */
const ROWS: Row[] = [
  cdekRow("ful_1", "order_own_1", 101),
  cdekRow("ful_2", "order_own_2", 102),
  cdekRow("ful_foreign", "order_foreign", 900),
  cdekRow("ful_unregistered", "order_own_1", 101, null),
  { ...cdekRow("ful_canceled", "order_own_1", 101), canceled_at: "2026-10-14T05:00:00Z" },
  { ...cdekRow("ful_manual", "order_own_1", 101), provider_id: "manual_manual", data: {} },
];

const graph = jest.fn(async ({ entity, filters }: { entity: string; filters: { id: string[] } }) => {
  if (entity === "tenant_admin") {
    return { data: [{ id: "ta_1", tenant: { id: "ten_own", orders: [{ id: "order_own_1" }, { id: "order_own_2" }] } }] };
  }
  if (entity === "fulfillment") {
    return { data: ROWS.filter((row) => filters.id.includes(row.id)) };
  }
  throw new Error(`unexpected entity ${entity}`);
});

const warn = jest.fn();

const request = (input: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown }) =>
  ({
    params: input.params ?? {},
    query: input.query ?? {},
    body: input.body,
    auth_context: { actor_id: "ta_1" },
    scope: {
      resolve: (key: string) => {
        if (key === "query") return { graph };
        if (key === "logger") return { warn, info: jest.fn() };
        if (key === "__pg_connection__") return {};
        throw new Error(`unexpected resolve ${key}`);
      },
    },
  }) as never;

const response = () => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    send(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
};

const labelOf = async (orderId: string, fulfillmentId: string, query: Record<string, unknown> = {}) => {
  const res = response();
  await getLabel(request({ params: { id: orderId, fulfillment_id: fulfillmentId }, query }), res as never);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  readSecret.mockResolvedValue({
    id: "sec_1",
    tenant_id: "ten_own",
    is_test: false,
    is_enabled: true,
    credentials: { account: "live-acc", password: "live-pwd", test_account: "", test_password: "" } as never,
  });
  printLabels.mockResolvedValue({ uuid: "print-1", pdf: PDF });
  printWaybill.mockResolvedValue({ uuid: "print-2", pdf: PDF });
});

describe("GET …/fulfillments/:fulfillment_id/cdek/label", () => {
  it("answers the PDF inline, A6 by default, from the shop's live CDEK account", async () => {
    const res = await labelOf("order_own_1", "ful_1");

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(PDF);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('inline; filename="cdek-label-101.pdf"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(printLabels).toHaveBeenCalledWith(
      { base: "https://api.cdek.ru/v2", account: "live-acc", password: "live-pwd" },
      ["uuid-ful_1"],
      "A6",
    );
    expect(readSecret).toHaveBeenCalledWith({}, "ten_own", { includeDisabled: true });
  });

  it("passes the asked format through and refuses an unknown one", async () => {
    await labelOf("order_own_1", "ful_1", { format: "a4" });
    expect(printLabels).toHaveBeenLastCalledWith(expect.anything(), ["uuid-ful_1"], "A4");

    const bad = await labelOf("order_own_1", "ful_1", { format: "A7" });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toMatchObject({ code: "invalid_data" });
  });

  it("answers 404 for another shop's order and for a fulfillment of another order", async () => {
    const foreignOrder = await labelOf("order_foreign", "ful_foreign");
    expect(foreignOrder.statusCode).toBe(404);
    expect(foreignOrder.body).toMatchObject({ code: "not_found" });

    const wrongOrder = await labelOf("order_own_2", "ful_1");
    expect(wrongOrder.statusCode).toBe(404);

    const foreignFulfillment = await labelOf("order_own_1", "ful_foreign");
    expect(foreignFulfillment.statusCode).toBe(404);

    const nobodys = await labelOf("order_own_1", "ful_missing");
    expect(nobodys.statusCode).toBe(404);

    expect(printLabels).not.toHaveBeenCalled();
  });

  it("answers 422 cdek_not_cdek for a fulfillment of another provider", async () => {
    const res = await labelOf("order_own_1", "ful_manual");
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ code: "cdek_not_cdek" });
  });

  it("answers 409 cdek_not_registered without a CDEK uuid and after a cancel", async () => {
    const unregistered = await labelOf("order_own_1", "ful_unregistered");
    expect(unregistered.statusCode).toBe(409);
    expect(unregistered.body).toEqual({
      code: "cdek_not_registered",
      message: "Отправление ещё не зарегистрировано в СДЭК",
    });

    const canceled = await labelOf("order_own_1", "ful_canceled");
    expect(canceled.statusCode).toBe(409);
    expect(printLabels).not.toHaveBeenCalled();
  });

  it("answers 422 cdek_not_configured when the shop has no CDEK access", async () => {
    readSecret.mockResolvedValue(null);
    const res = await labelOf("order_own_1", "ful_1");
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ code: "cdek_not_configured" });
  });

  it("answers 504 cdek_print_timeout when CDEK does not finish the file", async () => {
    printLabels.mockRejectedValue(new CdekPrintTimeoutError("barcodes", "print-1", 20_000));
    const res = await labelOf("order_own_1", "ful_1");
    expect(res.statusCode).toBe(504);
    expect(res.body).toMatchObject({ code: "cdek_print_timeout" });
  });

  it("answers 502 cdek_print_failed with CDEK's code and nothing secret", async () => {
    printLabels.mockRejectedValue(
      new CdekError("CDEK /print/barcodes answered 400", {
        status: 400,
        errors: [{ code: "v2_entity_not_found", message: "Bearer tok-secret, phone 79001234567" }],
        path: "/print/barcodes",
      }),
    );
    const res = await labelOf("order_own_1", "ful_1");

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ code: "cdek_print_failed", message: "v2_entity_not_found" });
    expect(JSON.stringify(res.body)).not.toMatch(/tok-secret|live-pwd|79001234567/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toMatch(/79001234567/);
  });
});

describe("GET …/fulfillments/:fulfillment_id/cdek/waybill", () => {
  it("answers the receipt PDF of the fulfillment", async () => {
    const res = response();
    await getWaybill(request({ params: { id: "order_own_2", fulfillment_id: "ful_2" } }), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe('inline; filename="cdek-receipt-102.pdf"');
    expect(printWaybill).toHaveBeenCalledWith(expect.objectContaining({ account: "live-acc" }), "uuid-ful_2");
  });

  it("holds the same tenant scope as the label", async () => {
    const res = response();
    await getWaybill(request({ params: { id: "order_foreign", fulfillment_id: "ful_foreign" } }), res as never);
    expect(res.statusCode).toBe(404);
    expect(printWaybill).not.toHaveBeenCalled();
  });
});

describe("POST /tenants/orders/cdek/labels", () => {
  const batch = async (body: unknown) => {
    const res = response();
    await postLabels(request({ body }), res as never);
    return res;
  };

  it("prints every label of the batch in one CDEK call", async () => {
    const res = await batch({ fulfillment_ids: ["ful_1", "ful_2", "ful_1"], format: "A5" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe('inline; filename="cdek-labels-2.pdf"');
    expect(printLabels).toHaveBeenCalledTimes(1);
    expect(printLabels).toHaveBeenCalledWith(expect.anything(), ["uuid-ful_1", "uuid-ful_2"], "A5");
  });

  it("refuses the whole batch with 404 when one id is another shop's", async () => {
    const res = await batch({ fulfillment_ids: ["ful_1", "ful_foreign"] });
    expect(res.statusCode).toBe(404);
    expect(printLabels).not.toHaveBeenCalled();
  });

  it("refuses the whole batch with 409 or 422 for one unprintable fulfillment", async () => {
    expect((await batch({ fulfillment_ids: ["ful_1", "ful_unregistered"] })).statusCode).toBe(409);
    expect((await batch({ fulfillment_ids: ["ful_1", "ful_manual"] })).statusCode).toBe(422);
    expect(printLabels).not.toHaveBeenCalled();
  });

  it("takes 1 to 100 ids and nothing else", async () => {
    expect((await batch({ fulfillment_ids: [] })).statusCode).toBe(400);
    expect((await batch({ fulfillment_ids: Array.from({ length: 101 }, (_, i) => `ful_${i}`) })).statusCode).toBe(400);
    expect((await batch({})).statusCode).toBe(400);
    expect((await batch({ fulfillment_ids: ["ful_1"], tenant_id: "ten_other" })).statusCode).toBe(400);
    expect(printLabels).not.toHaveBeenCalled();
  });
});
