/**
 * Russian Post client, READ ONLY (46df-pochta).
 *
 * Framework-agnostic, like `src/cdek/client.ts`: the fulfillment provider, the
 * store routes, the panel probe and the unit tests drive the same functions,
 * and `fetchImpl` is the one seam a test replaces. Nothing here reads the
 * environment or a database; every call takes the credentials it needs,
 * because they are per tenant (`src/tenant-secrets/pochta.ts`).
 *
 * NOTHING HERE CREATES A SHIPMENT. The calls are the delivery-point directory,
 * the post-office directory and two tariff calculators.
 *
 * Contract facts measured on 2026-09-29 with the application token of the
 * cherkashino shop (value never copied anywhere; probes in
 * `~/upready/memory/lead-upready-store/46df/pochta/probe/`):
 *
 * - `GET otpravka-api.pochta.ru/1.0/delivery-point/findAll` with
 *   `Authorization: AccessToken <token>` alone answers HTTP 200 and a bare
 *   ARRAY of 1035 points (1.09 MB, about 2.4 s). 970 of them are «Почта Еком»
 *   pickup points (`type-post-office: "PPVZ"`, indexes 98xxxx); the other 65
 *   carry no `type-post-office` and no `service-ids` and are sorting hubs, not
 *   places a buyer collects from. Every row has `latitude` / `longitude` as
 *   STRINGS.
 * - The same call without the header answers 401.
 * - `POST /1.0/tariff` and every `/postoffice/1.0/*` call answer 401 with the
 *   token alone (`1011 ILLEGAL_CREDENTIALS`, `1003 Authorization is Empty`):
 *   they also want `X-User-Authorization: Basic <base64(login:password)>`, the
 *   cabinet's user key.
 * - The public calculator `tariff.pochta.ru/v2/calculate/tariff/delivery?json`
 *   needs no key. `object=4030` («Посылка») Moscow to Saint Petersburg, 1 kg,
 *   answered `paynds: 44800` (kopecks, VAT included) and `delivery: { min: 2,
 *   max: 2 }`. To a 98xxxx index every retail object answers HTTP 400
 *   «Доставка … в ППВЗ не осуществляется»: those points take the contract ECOM
 *   product only, which the public calculator no longer prices.
 */

/** The «Отправка» API base. */
export const POCHTA_OTPRAVKA_BASE = "https://otpravka-api.pochta.ru";
/** The public tariff calculator, version 2. */
export const POCHTA_TARIFF_BASE = "https://tariff.pochta.ru/v2";

/** «Посылка» (retail parcel), the one object the public calculator prices to any office. */
export const PUBLIC_PARCEL_OBJECT = 4030;

export type PochtaCredentials = {
  /** Application token, sent as `Authorization: AccessToken <token>`. */
  token: string;
  /** Base64 of `login:password`, sent as `X-User-Authorization: Basic <key>`; `null` when the shop has none. */
  user_key: string | null;
};

export type PochtaClientOptions = {
  fetchImpl?: typeof fetch;
  /** Milliseconds before a single call is abandoned. */
  timeoutMs?: number;
  /** Pauses before each 5xx retry. Injected so a test does not wait on a real clock. */
  retryDelaysMs?: number[];
  /** Injected in tests so the directory cache expiry is deterministic. */
  now?: () => number;
  otpravkaBase?: string;
  tariffBase?: string;
};

export class PochtaError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, options: { status?: number | null; code?: string | null } = {}) {
    super(message);
    this.name = "PochtaError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
  }
}

/* ------------------------------------------------------------------ types */

/** One row of `/1.0/delivery-point/findAll`, the fields this code reads. */
export type PochtaDeliveryPointRaw = {
  id?: number;
  "delivery-point-index": string;
  "delivery-point-type"?: string;
  "type-post-office"?: string;
  "brand-name"?: string;
  "legal-short-name"?: string;
  address?: {
    index?: string;
    region?: string;
    place?: string;
    street?: string;
    house?: string;
  };
  latitude?: string | number;
  longitude?: string | number;
  "work-time"?: string[];
  getto?: string;
  "weight-limit"?: number;
  "card-payment"?: boolean;
  "cash-payment"?: boolean;
  closed?: boolean;
  "temporary-closed"?: boolean;
};

/**
 * One row of `/postoffice/1.0/nearby`. NOT MEASURED: the call needs the user
 * key, which no shop has given yet, so the field names follow the published
 * «Отправка» reference and the mapping reads every one of them defensively.
 */
export type PochtaPostOfficeRaw = {
  "postal-code"?: string;
  "address-source"?: string;
  settlement?: string;
  region?: string;
  latitude?: string | number;
  longitude?: string | number;
  "type-code"?: string;
  "is-closed"?: boolean;
  "is-temporary-closed"?: boolean;
  "working-hours"?: Array<{ "weekday-id"?: number; "begin-worktime"?: string; "end-worktime"?: string }>;
};

export type PochtaTariffQuote = {
  /** Rubles, VAT included. */
  amount: number;
  period_min: number;
  period_max: number;
};

/* ---------------------------------------------------------------- transport */

const RETRY_DELAYS_MS = [400, 1200];
const DEFAULT_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request. A 5xx or a transport failure is retried per
 * {@link RETRY_DELAYS_MS}; a 4xx never is, because it is the carrier's answer
 * about the request itself (a rejected key, an index it does not serve).
 */
const request = async (
  url: string,
  init: RequestInit,
  options: PochtaClientOptions,
): Promise<{ status: number; body: unknown }> => {
  const doFetch = options.fetchImpl ?? fetch;
  const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (response.status >= 500 && attempt < delays.length) {
        lastError = new PochtaError(`Почта России ответила HTTP ${response.status}`, { status: response.status });
        await sleep(delays[attempt]);
        continue;
      }
      return { status: response.status, body };
    } catch (error) {
      lastError = error;
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const reason =
    (lastError as Error)?.name === "AbortError"
      ? "Почта России не ответила вовремя"
      : `Не удалось обратиться к Почте России: ${(lastError as Error)?.message ?? "нет ответа"}`;
  throw new PochtaError(reason, { status: (lastError as PochtaError)?.status ?? null });
};

const otpravkaHeaders = (credentials: PochtaCredentials, withUser: boolean): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `AccessToken ${credentials.token}`,
    Accept: "application/json;charset=UTF-8",
    "Content-Type": "application/json;charset=UTF-8",
  };
  if (withUser && credentials.user_key) {
    headers["X-User-Authorization"] = `Basic ${credentials.user_key}`;
  }
  return headers;
};

/** The carrier's `{ code, sub-code, desc }` error, as one line without any account data. */
const describeError = (status: number, body: unknown): PochtaError => {
  const payload = (body ?? {}) as { code?: unknown; "sub-code"?: unknown; desc?: unknown };
  const code = [payload.code, payload["sub-code"]].filter(Boolean).join(" ") || null;
  const text =
    status === 401 || status === 403
      ? "Почта России не приняла ключ"
      : `Почта России ответила HTTP ${status}`;
  return new PochtaError(code ? `${text} (${code})` : text, { status, code });
};

/* --------------------------------------------------------- delivery points */

const DIRECTORY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The directory is one 1 MB answer that changes a few times a day, while a
 * checkout asks for it on every city search and every quote. One copy per
 * token per process, for six hours; the key is the token itself so two shops
 * never share an answer their own token did not fetch.
 */
const directoryCache = new Map<string, { at: number; points: PochtaDeliveryPointRaw[] }>();
const inflight = new Map<string, Promise<PochtaDeliveryPointRaw[]>>();

/** Drops the cached directory; tests and the panel's «Проверить подключение» use it. */
export const forgetPochtaDirectory = (token?: string): void => {
  if (token) {
    directoryCache.delete(token);
    inflight.delete(token);
    return;
  }
  directoryCache.clear();
  inflight.clear();
};

export const listDeliveryPoints = async (
  credentials: PochtaCredentials,
  options: PochtaClientOptions & { fresh?: boolean } = {},
): Promise<PochtaDeliveryPointRaw[]> => {
  const now = options.now ?? Date.now;
  const cached = directoryCache.get(credentials.token);
  if (!options.fresh && cached && now() - cached.at < DIRECTORY_TTL_MS) {
    return cached.points;
  }
  const running = inflight.get(credentials.token);
  if (running) return running;

  const base = (options.otpravkaBase ?? POCHTA_OTPRAVKA_BASE).replace(/\/$/, "");
  const job = (async () => {
    const { status, body } = await request(
      `${base}/1.0/delivery-point/findAll`,
      { method: "GET", headers: otpravkaHeaders(credentials, false) },
      options,
    );
    if (status !== 200) throw describeError(status, body);
    if (!Array.isArray(body)) {
      throw new PochtaError("Почта России вернула справочник пунктов в неизвестном виде", { status });
    }
    const points = body as PochtaDeliveryPointRaw[];
    directoryCache.set(credentials.token, { at: now(), points });
    return points;
  })();
  inflight.set(credentials.token, job);
  try {
    return await job;
  } finally {
    inflight.delete(credentials.token);
  }
};

/* ------------------------------------------------------------ post offices */

/**
 * Post offices around a point. Needs the user key; without it the call is not
 * made at all (it would only collect a 401).
 */
export const listNearbyPostOffices = async (
  credentials: PochtaCredentials,
  query: { lat: number; lng: number; top?: number },
  options: PochtaClientOptions = {},
): Promise<PochtaPostOfficeRaw[]> => {
  if (!credentials.user_key) return [];
  const base = (options.otpravkaBase ?? POCHTA_OTPRAVKA_BASE).replace(/\/$/, "");
  const search = new URLSearchParams({
    latitude: String(query.lat),
    longitude: String(query.lng),
    top: String(query.top ?? 30),
    filter: "ALL",
  });
  const { status, body } = await request(
    `${base}/postoffice/1.0/nearby?${search.toString()}`,
    { method: "GET", headers: otpravkaHeaders(credentials, true) },
    options,
  );
  if (status !== 200) throw describeError(status, body);
  return Array.isArray(body) ? (body as PochtaPostOfficeRaw[]) : [];
};

/* ----------------------------------------------------------------- tariffs */

/**
 * The contract tariff of the «Отправка» API. ECOM to a «Почта Еком» point,
 * «Посылка» to a post office. NOT MEASURED (needs the user key); the request
 * and answer fields follow the published reference, `total-rate` and
 * `total-vat` in kopecks, `delivery-time` in days.
 */
export const otpravkaTariff = async (
  credentials: PochtaCredentials,
  input: { from_index: string; to_index: string; weight_g: number; kind: "pvz" | "office" },
  options: PochtaClientOptions = {},
): Promise<PochtaTariffQuote> => {
  if (!credentials.user_key) {
    throw new PochtaError("Для тарифа по договору нужен ключ пользователя Почты России");
  }
  const base = (options.otpravkaBase ?? POCHTA_OTPRAVKA_BASE).replace(/\/$/, "");
  const payload: Record<string, unknown> =
    input.kind === "pvz"
      ? {
          "index-from": input.from_index,
          "delivery-point-index": input.to_index,
          "mail-category": "ORDINARY",
          "mail-type": "ECOM",
          "dimension-type": "M",
          mass: input.weight_g,
        }
      : {
          "index-from": input.from_index,
          "index-to": input.to_index,
          "mail-category": "ORDINARY",
          "mail-type": "POSTAL_PARCEL",
          mass: input.weight_g,
          fragile: false,
        };
  const { status, body } = await request(
    `${base}/1.0/tariff`,
    { method: "POST", headers: otpravkaHeaders(credentials, true), body: JSON.stringify(payload) },
    options,
  );
  if (status !== 200) throw describeError(status, body);
  const answer = (body ?? {}) as {
    "total-rate"?: number;
    "total-vat"?: number;
    "delivery-time"?: { "min-days"?: number; "max-days"?: number };
  };
  const kopecks = Number(answer["total-rate"] ?? 0) + Number(answer["total-vat"] ?? 0);
  if (!kopecks) throw new PochtaError("Почта России не вернула тариф", { status });
  const max = Number(answer["delivery-time"]?.["max-days"] ?? 0);
  const min = Number(answer["delivery-time"]?.["min-days"] ?? max);
  return { amount: kopecks / 100, period_min: min, period_max: max };
};

/**
 * The public calculator: no key, retail prices. Answers HTTP 400 with an
 * `errors` list for a route it does not serve, which becomes a thrown error
 * carrying the carrier's own first sentence.
 */
export const publicTariff = async (
  input: { from_index: string; to_index: string; weight_g: number; object?: number },
  options: PochtaClientOptions = {},
): Promise<PochtaTariffQuote> => {
  const base = (options.tariffBase ?? POCHTA_TARIFF_BASE).replace(/\/$/, "");
  const search = new URLSearchParams({
    object: String(input.object ?? PUBLIC_PARCEL_OBJECT),
    from: input.from_index,
    to: input.to_index,
    weight: String(Math.max(1, Math.round(input.weight_g))),
    pack: "10",
  });
  // `json` is a bare flag in this API (`?json&object=…`), not a key=value pair.
  const { status, body } = await request(
    `${base}/calculate/tariff/delivery?json&${search.toString()}`,
    { method: "GET", headers: { Accept: "application/json" } },
    options,
  );
  const answer = (body ?? {}) as {
    paynds?: number;
    delivery?: { min?: number; max?: number };
    errors?: Array<{ msg?: string; code?: number }>;
  };
  if (status !== 200 || !answer.paynds) {
    const first = answer.errors?.[0]?.msg ?? `HTTP ${status}`;
    throw new PochtaError(`Тарификатор Почты России: ${first}`, {
      status,
      code: answer.errors?.[0]?.code ? String(answer.errors[0].code) : null,
    });
  }
  const max = Number(answer.delivery?.max ?? 0);
  const min = Number(answer.delivery?.min ?? max);
  return { amount: Number(answer.paynds) / 100, period_min: min, period_max: max };
};

/* ------------------------------------------------------------------- probe */

export type PochtaProbe = {
  /** `true` when the token opened the delivery-point directory. */
  ok: boolean;
  /** HTTP status of the directory call; `null` when the request never got one. */
  status: number | null;
  /** «Почта Еком» points the directory holds. `null` unless `ok`. */
  points: number | null;
  /** The user key's own verdict; `null` when no user key is stored. */
  user_key: { ok: boolean; status: number | null; error: string | null } | null;
  /** Why the token probe failed, in the owner's language. `null` when `ok`. */
  error: string | null;
};

/**
 * «Проверить подключение»: the directory with the token, then (when a user key
 * is stored) one contract tariff Moscow to Saint Petersburg. Three answers per
 * credential, never two: accepted, rejected with a status, or no answer.
 */
export const probePochta = async (
  credentials: PochtaCredentials,
  options: PochtaClientOptions & { from_index?: string } = {},
): Promise<PochtaProbe> => {
  let result: PochtaProbe;
  try {
    const points = await listDeliveryPoints(credentials, { ...options, fresh: true });
    result = {
      ok: true,
      status: 200,
      points: points.filter((point) => point["type-post-office"] === "PPVZ").length,
      user_key: null,
      error: null,
    };
  } catch (error) {
    const status = (error as PochtaError).status ?? null;
    result = {
      ok: false,
      status,
      points: null,
      user_key: null,
      error: status === 401 || status === 403 ? "Почта России не приняла токен." : (error as Error).message,
    };
  }

  if (credentials.user_key) {
    try {
      await otpravkaTariff(
        credentials,
        { from_index: options.from_index || "101000", to_index: "190000", weight_g: 1000, kind: "office" },
        options,
      );
      result.user_key = { ok: true, status: 200, error: null };
    } catch (error) {
      const status = (error as PochtaError).status ?? null;
      result.user_key = {
        ok: false,
        status,
        error:
          status === 401 || status === 403
            ? "Почта России не приняла ключ пользователя."
            : (error as Error).message,
      };
    }
  }
  return result;
};
