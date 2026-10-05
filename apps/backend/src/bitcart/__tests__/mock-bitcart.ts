import type { BitcartInvoice } from "../client";

/**
 * A Bitcart reduced to the three Merchants API calls this integration makes
 * (ask-20261005-070255-438f, stage 2), as a `fetch` replacement: the
 * `fetchImpl` the client takes and the provider's `clientOptions()` seam hands
 * it. Routes, bodies and answers follow `bitcart/bitcart` master at e3bf1016
 * (`bitcart/client.ts`), including the two behaviours a caller must survive:
 * `GET /invoices/{id}` answers anybody, token or not, and a refund of an
 * unpaid invoice is a 422.
 *
 * Not a spec file: the unit suite only picks up `*.unit.spec.ts`.
 */

export type BitcartMockCall = { method: string; path: string; authorization: string | null; body: unknown };

export type MockBitcart = {
  fetchImpl: typeof fetch;
  calls: BitcartMockCall[];
  invoices: Map<string, BitcartInvoice>;
  /** Sets what the server answers for an invoice from now on. */
  setStatus: (invoiceId: string, status: string, exceptionStatus?: string) => void;
  /** Overrides any field of a stored invoice, e.g. another `store_id` or `price`. */
  patch: (invoiceId: string, fields: Partial<BitcartInvoice>) => void;
  /** The next request answers this HTTP status instead, once. */
  failNext: (status: number, body?: unknown) => void;
};

const PAID = new Set(["paid", "unconfirmed", "confirmed", "complete"]);

export const mockBitcart = (options: { serverUrl: string; storeId: string; apiKey: string }): MockBitcart => {
  const calls: BitcartMockCall[] = [];
  const invoices = new Map<string, BitcartInvoice>();
  let failure: { status: number; body: unknown } | null = null;
  let sequence = 0;
  const base = new URL(options.serverUrl);
  const prefix = base.pathname.replace(/\/+$/, "");

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: url.pathname, authorization: headers.get("authorization"), body });

    if (failure) {
      const answer = json(failure.status, failure.body);
      failure = null;
      return answer;
    }
    if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) {
      return json(404, { detail: "Not Found" });
    }
    const path = url.pathname.slice(prefix.length);
    const authorized = headers.get("authorization") === `Bearer ${options.apiKey}`;

    if (method === "POST" && path === "/invoices") {
      if (!authorized) {
        // The setup guide has the owner switch anonymous invoices off.
        return json(403, { detail: "Anonymous invoice creation is disabled" });
      }
      if (body?.store_id !== options.storeId) {
        return json(404, { detail: "Object not found" });
      }
      sequence += 1;
      const id = `01JBITCARTINV${String(sequence).padStart(4, "0")}`;
      const invoice: BitcartInvoice = {
        id,
        store_id: options.storeId,
        // `format_decimal`: the currency's own digits, no grouping.
        price: Number(body.price).toFixed(2),
        currency: String(body.currency || "USD").toUpperCase(),
        status: "pending",
        exception_status: "none",
        // Relative to the request, like a real server: the sweep stops
        // reading an invoice whose watch window has passed.
        created: new Date().toISOString(),
        expiration: 15,
        time_left: 900,
        order_id: body.order_id ?? "",
        paid_date: null,
        paid_currency: null,
        tx_hashes: [],
      };
      invoices.set(id, invoice);
      return json(200, { ...invoice, notification_url: body.notification_url ?? "", redirect_url: body.redirect_url ?? "" });
    }

    const match = /^\/invoices\/([^/]+)(\/refunds)?$/.exec(path);
    if (!match) {
      return json(404, { detail: "Not Found" });
    }
    const invoice = invoices.get(decodeURIComponent(match[1]));
    if (!invoice) {
      return json(404, { detail: "Object not found" });
    }
    if (method === "GET" && !match[2]) {
      // Optional auth on Bitcart: a missing or wrong token still reads it.
      return json(200, invoice);
    }
    if (method === "POST" && match[2]) {
      if (!authorized) {
        return json(401, { detail: "Unauthorized" });
      }
      if (!PAID.has(String(invoice.status)) && invoice.status !== "refunded") {
        return json(422, { detail: "Can't refund unpaid invoice" });
      }
      return json(200, {
        id: `01JBITCARTREF${invoice.id.slice(-4)}`,
        amount: Number(body.amount),
        currency: body.currency,
        invoice_id: invoice.id,
        wallet_id: "01JBITCARTWALLET",
        destination: null,
        payout_id: null,
      });
    }
    return json(405, { detail: "Method Not Allowed" });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    invoices,
    setStatus: (invoiceId, status, exceptionStatus = "none") => {
      const invoice = invoices.get(invoiceId);
      if (invoice) {
        invoices.set(invoiceId, { ...invoice, status, exception_status: exceptionStatus });
      }
    },
    patch: (invoiceId, fields) => {
      const invoice = invoices.get(invoiceId);
      if (invoice) {
        invoices.set(invoiceId, { ...invoice, ...fields });
      }
    },
    failNext: (status, body = {}) => {
      failure = { status, body };
    },
  };
};
