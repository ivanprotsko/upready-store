/**
 * Bitcart Merchants API client (ask-20261005-070255-438f, stage 2), the same
 * shape as `src/btcpay/client.ts`: plain functions, `fetchImpl` the one seam a
 * test replaces with a mock server. Nothing here reads the environment or a
 * database; the shop's server, store and key are passed in by the caller
 * (`src/tenant-secrets/bitcart.ts`).
 *
 * Source of truth, read 2026-10-05 from the `bitcart/bitcart` repository,
 * branch master at e3bf1016: `api/views/invoices.py` (routes),
 * `api/schemas/invoices.py` and `api/schemas/refunds.py` (bodies),
 * `api/invoices.py` (statuses), `api/utils/authorization.py` (the
 * `Authorization: Bearer <token>` header). Verified only against mock servers
 * in this repository's tests, never against a real Bitcart.
 *
 * Three facts the callers depend on:
 *
 * - `GET /invoices/{id}` needs no token at all on Bitcart (the CRUD router's
 *   `auth_config` makes `get` optional), so anyone can read an invoice by its
 *   id. The token is sent anyway, and the caller checks the invoice's
 *   `store_id` against the shop's own store before it believes a word.
 * - The invoice's checkout page and a refund's claim page live in Bitcart's
 *   ADMIN app (`bitcart-admin`, `pages/i/_id.vue` and `pages/refunds/_id.vue`),
 *   not on the API, and the API does not report the admin's address. That is
 *   why a shop saves both addresses.
 * - `price` comes back as a plain decimal string in the invoice currency,
 *   formatted with no grouping separator (`currency_table.format_decimal`).
 */

export type BitcartInvoiceStatus =
  | "pending"
  | "paid"
  | "unconfirmed"
  | "confirmed"
  | "expired"
  | "invalid"
  | "complete"
  | "refunded";
export type BitcartExceptionStatus = "none" | "paid_partial" | "paid_over" | "failed_confirm";

/** The subset of Bitcart's `DisplayInvoice` this integration reads. */
export type BitcartInvoice = {
  id: string;
  store_id: string | null;
  /** Decimal string in `currency`, e.g. `"25.50"`. */
  price: string;
  /** ISO 4217, upper case. */
  currency: string;
  status: BitcartInvoiceStatus | string;
  exception_status?: BitcartExceptionStatus | string | null;
  /** ISO time the invoice was created. */
  created?: string | null;
  /** Minutes the invoice stays payable after `created`. */
  expiration?: number | null;
  /** Seconds left before it expires, as the server counted them when it answered. */
  time_left?: number | null;
  order_id?: string | null;
  paid_date?: string | null;
  paid_currency?: string | null;
  tx_hashes?: string[] | null;
};

/** The subset of Bitcart's `DisplayRefund` a refund answers with. */
export type BitcartRefund = {
  id: string;
  amount?: number | string;
  currency?: string;
  invoice_id?: string;
};

export type BitcartConnection = {
  /** The API's origin plus optional path prefix (`/api` in one-domain mode), no trailing slash. */
  serverUrl: string;
  storeId: string;
  apiKey: string;
};

/** The connection for a shop's stored store (`ResolvedBitcartSecret`, `src/tenant-secrets/bitcart.ts`). */
export const bitcartConnectionOf = (secret: {
  credentials: { server_url: string; store_id: string; api_key: string };
}): BitcartConnection => ({
  serverUrl: secret.credentials.server_url,
  storeId: secret.credentials.store_id,
  apiKey: secret.credentials.api_key,
});

/** The buyer's checkout page for an invoice, on the shop's Bitcart admin app. */
export const bitcartCheckoutLink = (adminUrl: string, invoiceId: string): string =>
  `${adminUrl}/i/${encodeURIComponent(invoiceId)}`;

/** The page where the buyer enters the address a refund is paid to, on the same admin app. */
export const bitcartRefundLink = (adminUrl: string, refundId: string): string =>
  `${adminUrl}/refunds/${encodeURIComponent(refundId)}`;

export type CreateBitcartInvoiceInput = {
  /** Decimal string with the currency's own number of digits (`toBitcartPrice`). */
  price: string;
  /** ISO 4217, upper case. */
  currency: string;
  /** Shown to the owner in Bitcart; the payment session id, since no order exists yet. */
  orderId: string;
  /** Where Bitcart POSTs `{ id, status }` on every status change. Absent: no notification. */
  notificationUrl?: string | null;
  /** Where the checkout page's «return to store» leads. */
  redirectUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type RefundBitcartInvoiceInput = {
  /** Decimal string in `currency`. */
  amount: string;
  /** ISO 4217, upper case: the invoice's own currency. */
  currency: string;
  /** Bitcart builds the emailed claim link on it, so the shop's admin address. */
  adminHost: string;
};

export type BitcartClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * A non-2xx answer. The message names the HTTP status only: FastAPI's
 * `detail` is free text the owner's server controls, and the panel or a log
 * would repeat it.
 */
export class BitcartClientError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Bitcart answered HTTP ${status}`);
    this.name = "BitcartClientError";
    this.status = status;
  }
}

const request = async <T>(
  connection: BitcartConnection,
  path: string,
  options: BitcartClientOptions,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchImpl(`${connection.serverUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      redirect: "error",
    });

    const text = await response.text();
    if (!response.ok) {
      throw new BitcartClientError(response.status);
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      return {} as T;
    }
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * `POST /invoices`. Sent with the shop's token, so it works on a store that
 * refuses anonymous invoices (`allow_anonymous_invoice_creation` off, which
 * the setup guide asks the owner to do).
 */
export const createBitcartInvoice = (
  connection: BitcartConnection,
  input: CreateBitcartInvoiceInput,
  options: BitcartClientOptions = {},
): Promise<BitcartInvoice> =>
  request<BitcartInvoice>(connection, "/invoices", options, {
    method: "POST",
    body: {
      price: input.price,
      currency: input.currency,
      store_id: connection.storeId,
      order_id: input.orderId,
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });

/** `GET /invoices/{id}`. */
export const getBitcartInvoice = (
  connection: BitcartConnection,
  invoiceId: string,
  options: BitcartClientOptions = {},
): Promise<BitcartInvoice> =>
  request<BitcartInvoice>(connection, `/invoices/${encodeURIComponent(invoiceId)}`, options);

/**
 * `POST /invoices/{id}/refunds`. Creates a refund request in the invoice's
 * currency and, when the store has email set up and the buyer left an address
 * on the checkout page, Bitcart mails the buyer its claim link. The buyer
 * enters an address there; the payout that follows waits in Bitcart for the
 * owner, who approves it and sends the coins from their own wallet. The token
 * needs `invoice_management` and `payout_management`.
 *
 * Bitcart joins the emailed link as `urljoin(admin_host, "/refunds/{id}")`
 * (`api/services/crud/refunds.py`), which drops a path prefix: where the admin
 * lives under `/admin` (one-domain mode) that email points one level too high,
 * exactly as it does when the owner refunds from Bitcart's own admin. The
 * link the provider keeps (`bitcartRefundLink`) carries the prefix.
 */
export const refundBitcartInvoice = (
  connection: BitcartConnection,
  invoiceId: string,
  input: RefundBitcartInvoiceInput,
  options: BitcartClientOptions = {},
): Promise<BitcartRefund> =>
  request<BitcartRefund>(connection, `/invoices/${encodeURIComponent(invoiceId)}/refunds`, options, {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency,
      admin_host: input.adminHost,
      send_email: true,
    },
  });
