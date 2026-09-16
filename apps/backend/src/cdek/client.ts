/**
 * CDEK API v2 client (i02-apiship-cdek-shipping).
 *
 * Framework-agnostic on purpose: the fulfillment provider, the store routes and
 * the unit tests all drive the same functions, and `fetchImpl` is the one seam a
 * test replaces. Nothing here reads the environment or a database; every call
 * takes the credentials it needs, because they are per tenant
 * (`src/tenant-secrets/cdek.ts`).
 *
 * Contract facts measured against the live API on 2026-09-16 (both contours,
 * responses saved in `artifacts/docs/i02-apiship-cdek-shipping/probes/`):
 *
 * - `POST /oauth/token?parameters` with `grant_type=client_credentials` in a
 *   form body returns `{ access_token, expires_in: 3599, scope: "location:all
 *   order:all payment:all" }`. The query string `?parameters` is part of the
 *   documented path and the call fails without it.
 * - `POST /calculator/tarifflist` answers `{ tariff_codes: [{ tariff_code,
 *   tariff_name, delivery_mode, delivery_sum, period_min, period_max,
 *   calendar_min, calendar_max, delivery_date_range }] }` — 42 rows Moscow to
 *   Saint Petersburg on the live contour, 17 on the sandbox.
 * - `GET /deliverypoints` answers a bare ARRAY (not an envelope), 203 points for
 *   Saint Petersburg on the live contour, every one of them carrying
 *   `location.latitude` / `location.longitude`.
 * - `GET /location/cities` answers a bare array too; `code` is the numeric city
 *   id every other call wants.
 * - An order call answers `{ entity: { uuid }, requests: [{ state, errors }] }`
 *   and the order is created ASYNCHRONOUSLY: `state` is `ACCEPTED` first and the
 *   real number appears on a later `GET /orders/{uuid}`.
 */

export type CdekCredentials = {
  /** API base without a trailing slash, e.g. `https://api.cdek.ru/v2`. */
  base: string;
  account: string;
  password: string;
};

export type CdekClientOptions = {
  fetchImpl?: typeof fetch;
  /** Milliseconds before a single call is abandoned. */
  timeoutMs?: number;
  /** Injected in tests so token expiry is deterministic. */
  now?: () => number;
};

export class CdekError extends Error {
  readonly status: number | null;
  readonly cdekErrors: Array<{ code: string; message: string }>;

  constructor(
    message: string,
    options: { status?: number | null; errors?: Array<{ code: string; message: string }> } = {},
  ) {
    super(message);
    this.name = "CdekError";
    this.status = options.status ?? null;
    this.cdekErrors = options.errors ?? [];
  }
}

/* ------------------------------------------------------------------ types */

export type CdekTariff = {
  tariff_code: number;
  tariff_name: string;
  tariff_description?: string | null;
  /** 1 door-door, 2 door-warehouse, 3 warehouse-door, 4 warehouse-warehouse, 6 door-postamat, 7 warehouse-postamat. */
  delivery_mode: number;
  delivery_sum: number;
  period_min: number;
  period_max: number;
  calendar_min?: number;
  calendar_max?: number;
  delivery_date_range?: { min: string; max: string } | null;
};

export type CdekPackage = {
  /** Grams. CDEK wants grams here, unlike the parcel dimensions which are centimetres. */
  weight: number;
  length?: number;
  width?: number;
  height?: number;
};

export type CdekTariffListInput = {
  from_location: CdekLocation;
  to_location: CdekLocation;
  packages: CdekPackage[];
  /** 1 «интернет-магазин», 2 «доставка». The shop contract is type 1. */
  type?: number;
  currency?: number;
  lang?: string;
};

export type CdekLocation = {
  code?: number;
  city?: string;
  postal_code?: string;
  country_code?: string;
  address?: string;
};

export type CdekPoint = {
  code: string;
  name: string;
  uuid?: string;
  type?: string;
  owner_code?: string;
  work_time?: string;
  address_comment?: string | null;
  nearest_metro_station?: string | null;
  phones?: Array<{ number: string }>;
  location?: {
    country_code?: string;
    region?: string;
    city?: string;
    city_code?: number;
    postal_code?: string;
    address?: string;
    address_full?: string;
    longitude?: number;
    latitude?: number;
  };
  is_handout?: boolean;
  is_dressing_room?: boolean;
  have_cashless?: boolean;
  have_cash?: boolean;
  allowed_cod?: boolean;
  weight_max?: number | null;
};

export type CdekCity = {
  code: number;
  city: string;
  region?: string;
  region_code?: number;
  country_code?: string;
  postal_codes?: string[];
  longitude?: number;
  latitude?: number;
};

export type CdekOrderRequestState = {
  request_uuid?: string;
  type: string;
  state: string;
  date_time: string;
  errors?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
};

export type CdekOrderAck = {
  entity?: { uuid?: string };
  requests?: CdekOrderRequestState[];
};

export type CdekOrderInfo = {
  entity?: {
    uuid?: string;
    cdek_number?: string;
    number?: string;
    statuses?: Array<{ code: string; name: string; date_time: string }>;
    delivery_detail?: Record<string, unknown>;
  };
  requests?: CdekOrderRequestState[];
};

/* ----------------------------------------------------------------- token */

type TokenEntry = { token: string; expires_at: number };

/**
 * Access tokens live ~1 hour and every call needs one, so they are cached per
 * (base, account) for the life of the process. The key deliberately excludes the
 * password: a rotated password keeps the same key, which is why the cache is
 * dropped on the first 401 (`request` below) rather than trusted blindly.
 */
const tokenCache = new Map<string, TokenEntry>();

const tokenKey = (credentials: CdekCredentials) => `${credentials.base}::${credentials.account}`;

/** Exported for tests and for the panel's «check the credentials» button. */
export const forgetCdekToken = (credentials: CdekCredentials): void => {
  tokenCache.delete(tokenKey(credentials));
};

export const authenticate = async (
  credentials: CdekCredentials,
  options: CdekClientOptions = {},
): Promise<string> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const key = tokenKey(credentials);
  const cached = tokenCache.get(key);
  if (cached && cached.expires_at > now()) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.account,
    client_secret: credentials.password,
  }).toString();

  const res = await fetchImpl(`${credentials.base}/oauth/token?parameters`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new CdekError(`CDEK auth failed (${res.status})`, { status: res.status });
  }
  let parsed: { access_token?: string; expires_in?: number };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CdekError("CDEK auth returned a body that is not JSON", { status: res.status });
  }
  if (!parsed.access_token) {
    throw new CdekError("CDEK auth returned no access_token", { status: res.status });
  }
  // A minute of slack so a token never expires mid-request.
  const ttl = Math.max(60, (parsed.expires_in ?? 3600) - 60) * 1000;
  tokenCache.set(key, { token: parsed.access_token, expires_at: now() + ttl });
  return parsed.access_token;
};

/* --------------------------------------------------------------- request */

type RequestInit_ = {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

const buildUrl = (base: string, path: string, query?: RequestInit_["query"]): string => {
  const url = new URL(`${base}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(name, String(value));
  }
  return url.toString();
};

/**
 * One request with one retry: CDEK answers 401 both for an expired token and for
 * a token issued against a password that has since been rotated, and the two are
 * indistinguishable in the body, so the single retry drops the cached token and
 * asks for a new one. A second 401 is a real credentials problem and is raised.
 */
const request = async <T>(
  credentials: CdekCredentials,
  path: string,
  init: RequestInit_ = {},
  options: CdekClientOptions = {},
): Promise<T> => {
  const fetchImpl = options.fetchImpl ?? fetch;

  const attempt = async (token: string) => {
    const res = await fetchImpl(buildUrl(credentials.base, path, init.query), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 25000),
    });
    return { res, text: await res.text() };
  };

  let token = await authenticate(credentials, options);
  let { res, text } = await attempt(token);
  if (res.status === 401) {
    forgetCdekToken(credentials);
    token = await authenticate(credentials, options);
    ({ res, text } = await attempt(token));
  }

  if (!res.ok) {
    throw new CdekError(`CDEK ${path} answered ${res.status}`, {
      status: res.status,
      errors: extractErrors(text),
    });
  }
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CdekError(`CDEK ${path} returned a body that is not JSON`, { status: res.status });
  }
};

/**
 * CDEK reports a rejected call with HTTP 200 as readily as with 4xx: the errors
 * sit inside `requests[].errors`. Both shapes are read here so a caller never has
 * to decide which one it got.
 */
const extractErrors = (text: string): Array<{ code: string; message: string }> => {
  try {
    const parsed = JSON.parse(text) as {
      errors?: Array<{ code: string; message: string }>;
      requests?: Array<{ errors?: Array<{ code: string; message: string }> }>;
    };
    const own = parsed.errors ?? [];
    const nested = (parsed.requests ?? []).flatMap((entry) => entry.errors ?? []);
    return [...own, ...nested];
  } catch {
    return [];
  }
};

/** Raises when an order-shaped answer carries `state: "INVALID"` under HTTP 200. */
export const assertOrderAccepted = (ack: CdekOrderAck, what: string): void => {
  const invalid = (ack.requests ?? []).filter((entry) => entry.state === "INVALID");
  if (!invalid.length) return;
  const errors = invalid.flatMap((entry) => entry.errors ?? []);
  throw new CdekError(
    `CDEK rejected ${what}: ${errors.map((e) => `${e.code} ${e.message}`).join("; ") || "no reason given"}`,
    { errors },
  );
};

/* ----------------------------------------------------------------- calls */

export const listTariffs = async (
  credentials: CdekCredentials,
  input: CdekTariffListInput,
  options: CdekClientOptions = {},
): Promise<CdekTariff[]> => {
  const body = {
    type: input.type ?? 1,
    currency: input.currency ?? 1,
    lang: input.lang ?? "rus",
    from_location: input.from_location,
    to_location: input.to_location,
    packages: input.packages,
  };
  const answer = await request<{ tariff_codes?: CdekTariff[]; errors?: unknown }>(
    credentials,
    "/calculator/tarifflist",
    { method: "POST", body },
    options,
  );
  return answer.tariff_codes ?? [];
};

export const listDeliveryPoints = async (
  credentials: CdekCredentials,
  query: {
    city_code?: number;
    postal_code?: string;
    country_code?: string;
    region_code?: number;
    type?: "PVZ" | "POSTAMAT" | "ALL";
    /** Only points that can hand a parcel out. */
    is_handout?: boolean;
    weight_max?: number;
    size?: number;
    page?: number;
    lang?: string;
  },
  options: CdekClientOptions = {},
): Promise<CdekPoint[]> => {
  const answer = await request<CdekPoint[] | { items?: CdekPoint[] }>(
    credentials,
    "/deliverypoints",
    { query: { lang: "rus", ...query } },
    options,
  );
  if (Array.isArray(answer)) return answer;
  return answer?.items ?? [];
};

export const listCities = async (
  credentials: CdekCredentials,
  query: { city?: string; postal_code?: string; country_codes?: string; size?: number; lang?: string },
  options: CdekClientOptions = {},
): Promise<CdekCity[]> => {
  const answer = await request<CdekCity[] | { items?: CdekCity[] }>(
    credentials,
    "/location/cities",
    { query: { lang: "rus", size: 10, ...query } },
    options,
  );
  if (Array.isArray(answer)) return answer;
  return answer?.items ?? [];
};

export type CdekCreateOrderInput = {
  /** The shop's own order number, shown in the CDEK dashboard. */
  number: string;
  tariff_code: number;
  comment?: string;
  /** Required for a door delivery; omitted for a pickup point. */
  to_location?: CdekLocation;
  /** Required for a pickup delivery; the point's `code`. */
  delivery_point?: string;
  /** Required when the shop hands the parcel over at its own address. */
  from_location?: CdekLocation;
  shipment_point?: string;
  sender?: { name?: string; company?: string; phones?: Array<{ number: string }> };
  recipient: { name: string; phones: Array<{ number: string }>; email?: string };
  packages: Array<{
    number: string;
    weight: number;
    length?: number;
    width?: number;
    height?: number;
    comment?: string;
    items?: Array<{
      name: string;
      ware_key: string;
      payment: { value: number };
      cost: number;
      weight: number;
      amount: number;
    }>;
  }>;
};

export const createOrder = async (
  credentials: CdekCredentials,
  input: CdekCreateOrderInput,
  options: CdekClientOptions = {},
): Promise<CdekOrderAck> => {
  const ack = await request<CdekOrderAck>(credentials, "/orders", { method: "POST", body: input }, options);
  assertOrderAccepted(ack, `order ${input.number}`);
  return ack;
};

export const getOrder = async (
  credentials: CdekCredentials,
  uuid: string,
  options: CdekClientOptions = {},
): Promise<CdekOrderInfo> => request<CdekOrderInfo>(credentials, `/orders/${uuid}`, {}, options);

export const deleteOrder = async (
  credentials: CdekCredentials,
  uuid: string,
  options: CdekClientOptions = {},
): Promise<CdekOrderAck> =>
  request<CdekOrderAck>(credentials, `/orders/${uuid}`, { method: "DELETE" }, options);

export type CdekWebhookType = "ORDER_STATUS" | "PRINT_FORM" | "DOWNLOAD_PHOTO" | "PREALERT_CLOSED";

export const listWebhooks = async (
  credentials: CdekCredentials,
  options: CdekClientOptions = {},
): Promise<Array<{ uuid: string; url: string; type: string }>> => {
  const answer = await request<Array<{ uuid: string; url: string; type: string }>>(
    credentials,
    "/webhooks",
    {},
    options,
  );
  return Array.isArray(answer) ? answer : [];
};

export const registerWebhook = async (
  credentials: CdekCredentials,
  input: { url: string; type: CdekWebhookType },
  options: CdekClientOptions = {},
): Promise<CdekOrderAck> =>
  request<CdekOrderAck>(credentials, "/webhooks", { method: "POST", body: input }, options);

export const deleteWebhook = async (
  credentials: CdekCredentials,
  uuid: string,
  options: CdekClientOptions = {},
): Promise<CdekOrderAck> =>
  request<CdekOrderAck>(credentials, `/webhooks/${uuid}`, { method: "DELETE" }, options);
