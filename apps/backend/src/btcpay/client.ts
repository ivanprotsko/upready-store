/**
 * BTCPay Server Greenfield API client (ask-20261005-070255-438f), the same
 * shape as `src/tribute/client.ts`: plain functions, `fetchImpl` the one seam a
 * test replaces with a mock server. Nothing here reads the environment or a
 * database; the shop's server, store and key are passed in by the caller
 * (`src/tenant-secrets/btcpay.ts`).
 *
 * Source of truth, read 2026-10-05: the Greenfield swagger templates of the
 * BTCPay Server repository at tag v2.4.4,
 * `BTCPayServer/wwwroot/swagger/v1/swagger.template.invoices.json` and
 * `swagger.template.pull-payments.json`. Verified only against mock servers in
 * this repository's tests, never against a real BTCPay Server.
 *
 * One route change matters here. Up to v2.3 an invoice lived under its store,
 * `/api/v1/stores/{storeId}/invoices/{invoiceId}`. From v2.4.0 the swagger
 * lists it as `/api/v1/invoices/{invoiceId}` ("the store is resolved
 * automatically from the invoice"). Creating an invoice stays store-scoped in
 * both. So reading and refunding try the v2.4 path first and fall back to the
 * store-scoped one on a 404, which serves either server version; the caller
 * then checks the invoice's `storeId` against the shop's own store.
 */

export type BtcpayInvoiceStatus = "New" | "Processing" | "Expired" | "Invalid" | "Settled";
export type BtcpayAdditionalStatus = "None" | "PaidLate" | "PaidPartial" | "Marked" | "Invalid" | "PaidOver";

/** The subset of Greenfield's `InvoiceData` this integration reads. Times are unix seconds. */
export type BtcpayInvoice = {
  id: string;
  storeId: string;
  /** Decimal string in `currency`, e.g. `"25.00"`. */
  amount: string;
  currency: string;
  checkoutLink: string;
  status: BtcpayInvoiceStatus | string;
  additionalStatus?: BtcpayAdditionalStatus | string | null;
  createdTime?: number;
  expirationTime?: number;
  monitoringExpiration?: number;
  metadata?: Record<string, unknown> | null;
};

/** The subset of Greenfield's `PullPaymentData` a refund answers with. */
export type BtcpayPullPayment = {
  id: string;
  amount?: string;
  currency?: string;
  /** The page where the buyer enters the address the refund is paid to. */
  viewLink?: string;
};

export type BtcpayConnection = {
  /** Origin plus optional path prefix, no trailing slash (`normalizeBtcpayServerUrl`). */
  serverUrl: string;
  storeId: string;
  apiKey: string;
};

/** The connection for a shop's stored store (`ResolvedBtcpaySecret`, `src/tenant-secrets/btcpay.ts`). */
export const btcpayConnectionOf = (secret: {
  credentials: { server_url: string; store_id: string; api_key: string };
}): BtcpayConnection => ({
  serverUrl: secret.credentials.server_url,
  storeId: secret.credentials.store_id,
  apiKey: secret.credentials.api_key,
});

export type CreateBtcpayInvoiceInput = {
  /** Decimal string with the currency's own number of digits (`toBtcpayAmount`). */
  amount: string;
  /** ISO 4217, upper case. */
  currency: string;
  metadata: Record<string, unknown>;
  checkout: {
    redirectURL?: string;
    redirectAutomatically?: boolean;
    defaultLanguage?: string;
  };
};

/** `RefundInvoiceRequest`, `refundVariant: "Custom"`: an amount in a currency of our choosing. */
export type RefundBtcpayInvoiceInput = {
  name?: string;
  description?: string;
  customAmount: string;
  customCurrency: string;
};

export type BtcpayClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * A non-2xx answer. The message names the HTTP status and, when the server
 * sent one, Greenfield's short error `code`; never the response text, which
 * the owner's server controls and the panel or a log would repeat.
 */
export class BtcpayClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, body: unknown) {
    const raw = (body ?? {}) as { code?: unknown };
    const code = typeof raw.code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(raw.code) ? raw.code : null;
    super(`BTCPay Server answered HTTP ${status}${code ? ` (${code})` : ""}`);
    this.name = "BtcpayClientError";
    this.status = status;
    this.code = code;
  }
}

const request = async <T>(
  connection: BtcpayConnection,
  path: string,
  options: BtcpayClientOptions,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchImpl(`${connection.serverUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `token ${connection.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      redirect: "error",
    });

    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      throw new BtcpayClientError(response.status, parsed);
    }
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
};

const storePath = (connection: BtcpayConnection) =>
  `/api/v1/stores/${encodeURIComponent(connection.storeId)}`;

/** Tries the v2.4 path, then the store-scoped one when the first answers 404. */
const withStoreFallback = async <T>(
  connection: BtcpayConnection,
  suffix: string,
  options: BtcpayClientOptions,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> => {
  try {
    return await request<T>(connection, `/api/v1${suffix}`, options, init);
  } catch (error) {
    if (error instanceof BtcpayClientError && error.status === 404) {
      return request<T>(connection, `${storePath(connection)}${suffix}`, options, init);
    }
    throw error;
  }
};

/** `POST /api/v1/stores/{storeId}/invoices` — the invoice and its checkout page. */
export const createBtcpayInvoice = (
  connection: BtcpayConnection,
  input: CreateBtcpayInvoiceInput,
  options: BtcpayClientOptions = {},
): Promise<BtcpayInvoice> =>
  request<BtcpayInvoice>(connection, `${storePath(connection)}/invoices`, options, {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency,
      metadata: input.metadata,
      checkout: input.checkout,
    },
  });

/** `GET /api/v1/invoices/{invoiceId}` (v2.4), else the store-scoped path. */
export const getBtcpayInvoice = (
  connection: BtcpayConnection,
  invoiceId: string,
  options: BtcpayClientOptions = {},
): Promise<BtcpayInvoice> =>
  withStoreFallback<BtcpayInvoice>(connection, `/invoices/${encodeURIComponent(invoiceId)}`, options, {
    method: "GET",
  });

/**
 * `POST /api/v1/invoices/{invoiceId}/refund` (v2.4), else the store-scoped
 * path. Creates a pull payment; the buyer claims it on `viewLink` with an
 * address of their own, and the owner sends the money from their wallet.
 * `refundVariant` is always `Custom`, priced in the invoice's own currency, so
 * the refund is exactly the amount the panel asked for.
 */
export const refundBtcpayInvoice = (
  connection: BtcpayConnection,
  invoiceId: string,
  input: RefundBtcpayInvoiceInput,
  options: BtcpayClientOptions = {},
): Promise<BtcpayPullPayment> =>
  withStoreFallback<BtcpayPullPayment>(connection, `/invoices/${encodeURIComponent(invoiceId)}/refund`, options, {
    method: "POST",
    body: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      refundVariant: "Custom",
      customAmount: input.customAmount,
      customCurrency: input.customCurrency,
    },
  });
