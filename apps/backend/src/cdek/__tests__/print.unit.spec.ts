import { CdekError, forgetCdekToken, type CdekCredentials } from "../client";
import {
  CdekPrintTimeoutError,
  cdekPrintFailureReason,
  printCdekLabels,
  printCdekWaybill,
  printState,
} from "../print";

/**
 * The CDEK print forms (t-2026-10-14-58, part A): order the form, poll it until
 * `READY`, download the PDF with the same token. Every answer here is scripted;
 * no call leaves the process.
 */

const CREDENTIALS: CdekCredentials = {
  base: "https://api.test.invalid/v2",
  account: "acc",
  password: "pwd",
};

const PDF_TEXT = "%PDF-1.4\n% label\n";
const PDF = Buffer.from(PDF_TEXT);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const pdf = () => new Response(PDF_TEXT, { status: 200, headers: { "Content-Type": "application/pdf" } });

const accepted = (uuid = "print-1") =>
  json(202, { entity: { uuid }, requests: [{ type: "CREATE", state: "ACCEPTED", date_time: "x" }] });

const status = (code: string, url?: string) =>
  json(200, {
    entity: {
      uuid: "print-1",
      url,
      statuses: [
        { code: "ACCEPTED", date_time: "x" },
        ...(code === "ACCEPTED" ? [] : [{ code, date_time: "y" }]),
      ],
    },
  });

type Call = { url: string; method: string; body: unknown; auth: string | null };

/**
 * A `fetch` that answers the token call itself and plays the script for every
 * other call, in order (the last entry repeats). It records what it was asked.
 */
const scriptedFetch = (script: Array<() => Response>) => {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/oauth/token")) return json(200, { access_token: "tok-secret", expires_in: 3599 });
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      auth: headers.get("Authorization"),
    });
    const next = script[Math.min(index, script.length - 1)];
    index += 1;
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
};

const fast = (impl: typeof fetch) => ({ fetchImpl: impl, pollDelaysMs: [0, 0, 0, 0], retryDelaysMs: [0] });

describe("cdek/print", () => {
  beforeEach(() => forgetCdekToken(CREDENTIALS));

  it("orders the label, polls until READY and downloads the PDF with the same token", async () => {
    const { impl, calls } = scriptedFetch([
      () => accepted(),
      () => status("PROCESSING"),
      () => status("READY", "https://api.test.invalid/v2/print/barcodes/print-1.pdf"),
      () => pdf(),
    ]);

    const result = await printCdekLabels(CREDENTIALS, ["order-uuid-1"], "A6", fast(impl));

    expect(result.uuid).toBe("print-1");
    expect(result.pdf.equals(PDF)).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://api.test.invalid/v2/print/barcodes",
      "GET https://api.test.invalid/v2/print/barcodes/print-1",
      "GET https://api.test.invalid/v2/print/barcodes/print-1",
      "GET https://api.test.invalid/v2/print/barcodes/print-1.pdf",
    ]);
    expect(calls[0].body).toEqual({ orders: [{ order_uuid: "order-uuid-1" }], format: "A6", copy_count: 1 });
    expect(calls.every((call) => call.auth === "Bearer tok-secret")).toBe(true);
  });

  it("asks for every order of a batch in ONE /print/barcodes call", async () => {
    const { impl, calls } = scriptedFetch([
      () => accepted(),
      () => status("READY", "https://api.test.invalid/v2/print/barcodes/print-1.pdf"),
      () => pdf(),
    ]);

    await printCdekLabels(CREDENTIALS, ["u-1", "u-2", "u-3"], "A4", fast(impl));

    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      orders: [{ order_uuid: "u-1" }, { order_uuid: "u-2" }, { order_uuid: "u-3" }],
      format: "A4",
      copy_count: 1,
    });
  });

  it("orders the receipt from /print/orders in two copies", async () => {
    const { impl, calls } = scriptedFetch([
      () => accepted("print-2"),
      () => status("READY"),
      () => pdf(),
    ]);

    const result = await printCdekWaybill(CREDENTIALS, "order-uuid-1", fast(impl));

    expect(result.pdf.equals(PDF)).toBe(true);
    expect(calls[0].url).toBe("https://api.test.invalid/v2/print/orders");
    expect(calls[0].body).toEqual({ orders: [{ order_uuid: "order-uuid-1" }], copy_count: 2 });
    // No `url` in the READY answer: the documented path on the API base is read.
    expect(calls[2].url).toBe("https://api.test.invalid/v2/print/orders/print-2.pdf");
  });

  it("gives up with a timeout when the form never becomes READY", async () => {
    const { impl, calls } = scriptedFetch([() => accepted(), () => status("PROCESSING")]);

    await expect(printCdekLabels(CREDENTIALS, ["u-1"], "A6", fast(impl))).rejects.toBeInstanceOf(
      CdekPrintTimeoutError,
    );
    // One POST, one read per pause, and no download.
    expect(calls).toHaveLength(5);
    expect(calls.some((call) => call.url.endsWith(".pdf"))).toBe(false);
  });

  it("stops at the time limit even when pauses remain", async () => {
    const { impl, calls } = scriptedFetch([() => accepted(), () => status("PROCESSING")]);
    let clock = 0;
    const now = () => (clock += 15_000);

    await expect(
      printCdekLabels(CREDENTIALS, ["u-1"], "A6", { ...fast(impl), now, pollLimitMs: 20_000 }),
    ).rejects.toBeInstanceOf(CdekPrintTimeoutError);
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
  });

  it("raises CDEK's own error code when the order is refused", async () => {
    const { impl } = scriptedFetch([
      () => json(400, { requests: [{ state: "INVALID", errors: [{ code: "v2_entity_not_found", message: "Order 1234567 not found" }] }] }),
    ]);

    const error = await printCdekLabels(CREDENTIALS, ["u-1"], "A6", fast(impl)).catch((e) => e);

    expect(error).toBeInstanceOf(CdekError);
    expect(cdekPrintFailureReason(error)).toBe("v2_entity_not_found");
  });

  it("raises when the form turns INVALID while it is polled", async () => {
    const { impl } = scriptedFetch([
      () => accepted(),
      () =>
        json(200, {
          entity: { uuid: "print-1", statuses: [{ code: "INVALID" }] },
          requests: [{ state: "INVALID", errors: [{ code: "v2_order_not_found", message: "x" }] }],
        }),
    ]);

    const error = await printCdekLabels(CREDENTIALS, ["u-1"], "A6", fast(impl)).catch((e) => e);

    expect(error).toBeInstanceOf(CdekError);
    expect(cdekPrintFailureReason(error)).toBe("v2_order_not_found");
  });

  it("refuses a download that is not a PDF", async () => {
    const { impl } = scriptedFetch([
      () => accepted(),
      () => status("READY"),
      () => new Response("<html>oops</html>", { status: 200 }),
    ]);

    const error = await printCdekLabels(CREDENTIALS, ["u-1"], "A6", fast(impl)).catch((e) => e);

    expect(error).toBeInstanceOf(CdekError);
    expect(cdekPrintFailureReason(error)).toBe("print_not_pdf");
  });

  it("never sends the token to a url on another host", async () => {
    const { impl, calls } = scriptedFetch([
      () => accepted(),
      () => status("READY", "https://files.elsewhere.invalid/label.pdf"),
      () => pdf(),
    ]);

    await printCdekLabels(CREDENTIALS, ["u-1"], "A6", fast(impl));

    expect(calls.some((call) => call.url.includes("elsewhere"))).toBe(false);
    expect(calls[calls.length - 1].url).toBe("https://api.test.invalid/v2/print/barcodes/print-1.pdf");
  });

  it("names a failure by code or status, never by the token", () => {
    const reason = cdekPrintFailureReason(new CdekError("CDEK /print/barcodes answered 500", { status: 500 }));
    expect(reason).toBe("HTTP 500");
    expect(reason).not.toContain("tok");
    expect(cdekPrintFailureReason(new CdekError("CDEK auth failed (401)", { status: 401 }))).toBe(
      "auth_failed (HTTP 401)",
    );
  });

  it("reads the worst status of the history", () => {
    expect(printState({ entity: { statuses: [{ code: "ACCEPTED" }, { code: "READY" }] } })).toBe("READY");
    expect(printState({ entity: { statuses: [{ code: "READY" }, { code: "REMOVED" }] } })).toBe("REMOVED");
    expect(printState({ entity: { statuses: [{ code: "PROCESSING" }] } })).toBe("PENDING");
  });
});
