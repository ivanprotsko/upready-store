import type { BtcpayInvoice } from "../client";

/**
 * A BTCPay Server reduced to the three Greenfield calls this integration makes
 * (ask-20261005-070255-438f), as a `fetch` replacement: the `fetchImpl` the
 * client takes and the provider's `clientOptions()` seam hands it. The routes
 * and shapes follow the v2.4.4 swagger (`btcpay/client.ts`), including the
 * store-scoped fallback paths of earlier versions when `legacyRoutes` is set.
 *
 * Not a spec file: the unit suite only picks up `*.unit.spec.ts`.
 */

export type MockCall = { method: string; path: string; authorization: string | null; body: unknown };

export type MockBtcpay = {
  fetchImpl: typeof fetch;
  calls: MockCall[];
  invoices: Map<string, BtcpayInvoice>;
  /** Sets what the server answers for an invoice from now on. */
  setStatus: (invoiceId: string, status: string, additionalStatus?: string) => void;
  /** The next request answers this HTTP status instead, once. */
  failNext: (status: number, body?: unknown) => void;
};

export const mockBtcpay = (options: {
  serverUrl: string;
  storeId: string;
  apiKey: string;
  legacyRoutes?: boolean;
}): MockBtcpay => {
  const calls: MockCall[] = [];
  const invoices = new Map<string, BtcpayInvoice>();
  let failure: { status: number; body: unknown } | null = null;
  let sequence = 0;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const path = url.pathname;
    calls.push({ method, path, authorization: headers.get("authorization"), body });

    if (failure) {
      const answer = json(failure.status, failure.body);
      failure = null;
      return answer;
    }
    if (`${url.origin}` !== new URL(options.serverUrl).origin) {
      return json(404, { code: "wrong-host" });
    }
    if (headers.get("authorization") !== `token ${options.apiKey}`) {
      return json(401, { code: "unauthenticated", message: "Authentication is required" });
    }

    const storeInvoices = `/api/v1/stores/${options.storeId}/invoices`;
    if (method === "POST" && path === storeInvoices) {
      sequence += 1;
      const id = `inv_${sequence}`;
      // Times relative to the moment of the request, like a real server's:
      // the sweep skips an invoice whose monitoring window has passed.
      const now = Math.floor(Date.now() / 1000);
      const invoice: BtcpayInvoice = {
        id,
        storeId: options.storeId,
        amount: String(body.amount),
        currency: String(body.currency),
        checkoutLink: `${options.serverUrl}/i/${id}`,
        status: "New",
        additionalStatus: "None",
        createdTime: now,
        expirationTime: now + 900,
        monitoringExpiration: now + 900 + 86_400,
        metadata: body.metadata ?? {},
      };
      invoices.set(id, invoice);
      return json(200, invoice);
    }

    const invoiceRoute = options.legacyRoutes
      ? new RegExp(`^${storeInvoices}/([^/]+)(/refund)?$`)
      : /^\/api\/v1\/invoices\/([^/]+)(\/refund)?$/;
    const match = invoiceRoute.exec(path);
    if (!match) {
      return json(404, { code: "not-found" });
    }
    const invoice = invoices.get(decodeURIComponent(match[1]));
    if (!invoice) {
      return json(404, { code: "invoice-not-found" });
    }
    if (method === "GET" && !match[2]) {
      return json(200, invoice);
    }
    if (method === "POST" && match[2]) {
      return json(200, {
        id: `pp_${invoice.id}`,
        name: body.name,
        amount: body.customAmount,
        currency: body.customCurrency,
        viewLink: `${options.serverUrl}/pull-payments/pp_${invoice.id}`,
      });
    }
    return json(405, { code: "method-not-allowed" });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    invoices,
    setStatus: (invoiceId, status, additionalStatus = "None") => {
      const invoice = invoices.get(invoiceId);
      if (invoice) {
        invoices.set(invoiceId, { ...invoice, status, additionalStatus });
      }
    },
    failNext: (status, body = {}) => {
      failure = { status, body };
    },
  };
};
