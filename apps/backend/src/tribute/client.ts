/**
 * Tribute Shop API client, READ/WRITE but framework-agnostic (t-cherk-22),
 * same shape as `src/pochta/client.ts` and `src/cdek/client.ts`: plain
 * functions, `fetchImpl` the one seam a test (or the provider's own unit
 * tests, against a mock Tribute server) replaces. Nothing here reads the
 * environment or a database — credentials are per tenant
 * (`src/tenant-secrets/tribute.ts`), passed in by the caller.
 *
 * Source of truth read 2026-10-02 (see `t-cherk-22/notes.md`): the OpenAPI
 * document at `https://tribute.tg/api/v1/openapi/shop/en` (the wiki pages at
 * `https://wiki.tribute.tg/for-shops/api/methods` only embed it). No sandbox
 * exists, so this client is verified here only against a mock server in unit
 * tests, never against a real Tribute account.
 */

export const TRIBUTE_API_BASE = "https://tribute.tg/api/v1";

export type TributeOrderStatus = "pending" | "prepaid" | "paid" | "failed";

export type TributeShopOrder = {
  uuid: string;
  status: TributeOrderStatus;
  paymentUrl: string;
  webappPaymentUrl: string;
  amount?: number;
  currency?: string;
};

export type TributeTransaction = {
  id: string;
  type: string;
  /** Major units (e.g. rubles), a double — unlike `amount` on an order, which is minor units. */
  amount: number;
  isRefunded: boolean;
  isRefundable: boolean;
};

export type TributeApiError = { error: string; message: string };

export class TributeClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, body: unknown) {
    const parsed = (body ?? {}) as Partial<TributeApiError>;
    super(parsed.message || `Tribute API error (HTTP ${status})`);
    this.name = "TributeClientError";
    this.status = status;
    this.code = parsed.error ?? null;
  }
}

export type CreateTributeOrderInput = {
  /** Integer, minor units (kopecks/cents) — see `toTributeMinorUnits`. */
  amount: number;
  currency: "rub" | "usd" | "eur";
  title: string;
  description: string;
  successUrl: string;
  failUrl: string;
  email?: string | null;
  customerId?: string | null;
  comment?: string | null;
  shopId?: string | null;
};

export type TributeClientOptions = {
  fetchImpl?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
};

const request = async <T>(
  apiKey: string,
  path: string,
  options: TributeClientOptions,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.apiBase ?? TRIBUTE_API_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchImpl(`${base}${path}`, {
      method: init.method,
      headers: {
        "Api-Key": apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new TributeClientError(response.status, parsed);
    }
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
};

/** `POST /shop/orders` — creates the order and its two payment URLs (browser + Mini App). */
export const createTributeOrder = (
  apiKey: string,
  input: CreateTributeOrderInput,
  options: TributeClientOptions = {},
): Promise<TributeShopOrder> =>
  request<TributeShopOrder>(apiKey, "/shop/orders", options, {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency,
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 300),
      successUrl: input.successUrl,
      failUrl: input.failUrl,
      period: "onetime",
      ...(input.email ? { email: input.email } : {}),
      ...(input.customerId ? { customerId: input.customerId.slice(0, 256) } : {}),
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.shopId ? { shopId: input.shopId } : {}),
    },
  });

/** `GET /shop/orders/{uuid}` — the full order, used for the status-polling fallback with an amount check. */
export const getTributeOrder = (
  apiKey: string,
  uuid: string,
  options: TributeClientOptions = {},
): Promise<TributeShopOrder> => request<TributeShopOrder>(apiKey, `/shop/orders/${uuid}`, options);

/** `GET /shop/orders/{uuid}/transactions` — needed to find the sell transaction id a refund targets. */
export const listTributeTransactions = (
  apiKey: string,
  uuid: string,
  options: TributeClientOptions = {},
): Promise<TributeTransaction[]> =>
  request<TributeTransaction[]>(apiKey, `/shop/orders/${uuid}/transactions`, options);

/**
 * `POST /shop/orders/{uuid}/transactions/{txId}/refund` — NO amount parameter:
 * Tribute only offers a full refund of one sell transaction, never a partial
 * one (confirmed in `t-cherk-22/notes.md`). Returns status `initiated`.
 */
export const refundTributeTransaction = (
  apiKey: string,
  uuid: string,
  transactionId: string,
  options: TributeClientOptions = {},
): Promise<{ status: string }> =>
  request<{ status: string }>(apiKey, `/shop/orders/${uuid}/transactions/${transactionId}/refund`, options, {
    method: "POST",
  });
