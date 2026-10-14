/**
 * ApiShip API v1 client: the core request, the reference lists, the pickup
 * points and the calculator (t-2026-10-14-58). Orders, documents, statuses
 * and webhooks live in `./orders.ts` on the same core.
 *
 * Framework-agnostic on purpose, the way `src/cdek/client.ts` is: the
 * fulfillment provider, the panel routes, the store routes and the unit tests
 * drive the same functions, and `fetchImpl` is the one seam a test replaces.
 * Nothing here reads a database; every call takes the credentials it needs,
 * because the token is per shop (`src/tenant-secrets/apiship.ts`).
 *
 * Contract facts, measured against the test contour `api.dev.apiship.ru` on
 * 14.10.2026 with the public account from docs.apiship.ru (and against the
 * live API on 16.09.2026 for the header):
 *
 * - `Authorization: <token>` BARE. `Bearer <token>` answers 401.
 * - `POST /users/login {login, password}` answers `{ token }`.
 * - Every list answers `{ rows: [...], meta: { total, offset, limit } }` and
 *   takes `filter=field=value;other=[1,2]` (`docs/api/query-filter`); the type
 *   lists (`/lists/pickupTypes`, …) answer a bare array.
 * - `POST /calculator` answers `{ deliveryToDoor: [{providerKey, tariffs}],
 *   deliveryToPoint: [...] }` with HTTP 200 even when every `tariffs` is empty;
 *   a carrier that is not connected in the cabinet is simply absent.
 * - An error body is `{ code, message, description?, errors?: [{field, message}] }`.
 */

/** ApiShip's own production base. The test contour (`http://api.dev.apiship.ru/v1`) wants its own token. */
export const APISHIP_BASE_URL = process.env.APISHIP_BASE_URL ?? "https://api.apiship.ru/v1";

export type ApishipCredentials = {
  /** The shop's token from its `apiship` slot. */
  token: string;
  /** API base without a trailing slash; the deployment's `APISHIP_BASE_URL` by default. */
  base?: string;
};

export type ApishipClientOptions = {
  fetchImpl?: typeof fetch;
  /** Milliseconds before a single call is abandoned. */
  timeoutMs?: number;
  /** Pauses before each 5xx retry; injected so a test does not wait on a clock. */
  retryDelaysMs?: number[];
};

export type ApishipFieldError = { field?: string; message?: string };

export class ApishipError extends Error {
  readonly status: number | null;
  /** ApiShip's own code, e.g. `040000`; `null` when the body carried none. */
  readonly code: string | null;
  readonly description: string | null;
  readonly fieldErrors: ApishipFieldError[];
  /** The API path that answered, e.g. `/calculator`. */
  readonly path: string;

  constructor(
    message: string,
    options: {
      status?: number | null;
      code?: string | null;
      description?: string | null;
      fieldErrors?: ApishipFieldError[];
      path: string;
    },
  ) {
    super(message);
    this.name = "ApishipError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.description = options.description ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
    this.path = options.path;
  }

  /** «ApiShip /orders answered 400 040000: Ошибка валидации — recipient.phone: …», for a log line or a toast. */
  get detail(): string {
    const fields = this.fieldErrors
      .filter((entry) => entry.message)
      .map((entry) => (entry.field ? `${entry.field}: ${entry.message}` : entry.message))
      .join("; ");
    return [this.message, this.description, fields].filter(Boolean).join(" — ");
  }
}

/* ------------------------------------------------------------------ core */

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * How many times a 5xx is retried, and how long the pauses are. Same shape as
 * the CDEK client: a transient failure of the aggregator must not read to the
 * buyer as «this shop does not deliver here». A 4xx is never retried: it is
 * ApiShip saying the request itself is wrong.
 */
const RETRY_DELAYS_MS = [400, 1200];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RequestInit_ = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
};

const baseOf = (credentials: ApishipCredentials): string =>
  (credentials.base ?? APISHIP_BASE_URL).replace(/\/$/, "");

const buildUrl = (base: string, path: string, query?: RequestInit_["query"]): string => {
  const url = new URL(`${base}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(name, String(value));
  }
  return url.toString();
};

type ErrorBody = {
  code?: string | number;
  message?: string;
  description?: string;
  errors?: ApishipFieldError[];
};

/**
 * One request. A 5xx is retried per {@link RETRY_DELAYS_MS}; a 4xx is raised
 * at once as an {@link ApishipError} carrying ApiShip's own code and texts.
 * The token is sent bare and never appears in an error message.
 */
export const apishipRequest = async <T>(
  credentials: ApishipCredentials,
  path: string,
  init: RequestInit_ = {},
  options: ApishipClientOptions = {},
): Promise<T> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = baseOf(credentials);
  const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS;

  const attempt = async (): Promise<{ status: number; ok: boolean; text: string }> => {
    const response = await fetchImpl(buildUrl(base, path, init.query), {
      method: init.method ?? "GET",
      headers: {
        Authorization: credentials.token,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    return { status: response.status, ok: response.ok, text: await response.text() };
  };

  let result = await attempt();
  for (let retry = 0; result.status >= 500 && retry < delays.length; retry += 1) {
    await sleep(delays[retry]);
    result = await attempt();
  }

  let parsed: unknown = null;
  if (result.text) {
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = null;
    }
  }

  if (!result.ok) {
    const body = (parsed ?? {}) as ErrorBody;
    const code = body.code === undefined || body.code === null ? null : String(body.code);
    throw new ApishipError(
      `ApiShip ${path} answered ${result.status}${code ? ` ${code}` : ""}${body.message ? `: ${body.message}` : ""}`,
      {
        status: result.status,
        code,
        description: body.description ?? null,
        fieldErrors: Array.isArray(body.errors) ? body.errors : [],
        path,
      },
    );
  }

  if (parsed === null && result.text) {
    throw new ApishipError(`ApiShip ${path} answered a body that is not JSON`, {
      status: result.status,
      path,
    });
  }
  return parsed as T;
};

/** `POST /users/login` — the token for a login/password pair. Used for the test contour's public account only. */
export const loginApiship = async (
  input: { login: string; password: string; base?: string },
  options: ApishipClientOptions = {},
): Promise<string> => {
  const answer = await apishipRequest<{ token?: string }>(
    { token: "", base: input.base },
    "/users/login",
    { method: "POST", body: { login: input.login, password: input.password } },
    options,
  );
  if (!answer?.token) {
    throw new ApishipError("ApiShip /users/login answered no token", { status: 200, path: "/users/login" });
  }
  return answer.token;
};

/* ----------------------------------------------------------------- lists */

export type ApishipListMeta = { total: number; offset: number; limit: number };
type ListAnswer<T> = { rows?: T[]; meta?: Partial<ApishipListMeta> };

/**
 * `filter=` as ApiShip's query filter wants it: `field=value;other=[1,2]`.
 * A value with `;` or `=` inside would change the meaning, so it is refused.
 */
export const apishipFilter = (
  fields: Record<string, string | number | Array<string | number> | null | undefined>,
): string =>
  Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => {
      const render = (one: string | number) => {
        const text = String(one);
        if (/[;=\[\]]/.test(text)) {
          throw new ApishipError(`filter value for ${name} carries a reserved character`, { path: "/lists" });
        }
        return text;
      };
      return Array.isArray(value)
        ? `${name}=[${value.map(render).join(",")}]`
        : `${name}=${render(value as string | number)}`;
    })
    .join(";");

const listAll = async <T>(
  credentials: ApishipCredentials,
  path: string,
  query: Record<string, string | number | undefined>,
  options: ApishipClientOptions,
): Promise<{ rows: T[]; total: number }> => {
  const answer = await apishipRequest<ListAnswer<T>>(credentials, path, { query }, options);
  const rows = Array.isArray(answer?.rows) ? answer.rows : [];
  return { rows, total: Number(answer?.meta?.total ?? rows.length) || rows.length };
};

export type ApishipConnection = {
  id: string;
  providerKey: string;
  name: string | null;
  isUseBaseConnect: number | null;
  /** `connectParams.test` of the carrier's connection, when the cabinet set one. */
  test: boolean | null;
  created: string | null;
};

/**
 * `GET /connections` — the carriers the cabinet has connected. The answer's
 * `connectParams` hold the carrier's own login and password; only its `test`
 * flag is read, nothing else of it leaves this function.
 */
export const listConnections = async (
  credentials: ApishipCredentials,
  options: ApishipClientOptions = {},
): Promise<ApishipConnection[]> => {
  const { rows } = await listAll<Record<string, unknown>>(
    credentials,
    "/connections",
    { limit: 100, offset: 0 },
    options,
  );
  return rows.map((row) => {
    const params = (row.connectParams ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      providerKey: String(row.providerKey ?? ""),
      name: typeof row.name === "string" && row.name ? row.name : null,
      isUseBaseConnect: typeof row.isUseBaseConnect === "number" ? row.isUseBaseConnect : null,
      test: typeof params.test === "boolean" ? params.test : params.test === "true" ? true : params.test === "false" ? false : null,
      created: typeof row.created === "string" ? row.created : null,
    };
  });
};

export type ApishipProvider = { key: string; name: string; description: string | null };

/** `GET /lists/providers` — every carrier ApiShip knows, connected or not. */
export const listProviders = async (
  credentials: ApishipCredentials,
  options: ApishipClientOptions = {},
): Promise<ApishipProvider[]> => {
  const { rows } = await listAll<Record<string, unknown>>(
    credentials,
    "/lists/providers",
    { limit: 500, offset: 0 },
    options,
  );
  return rows.map((row) => ({
    key: String(row.key ?? ""),
    name: String(row.name ?? row.key ?? ""),
    description: typeof row.description === "string" && row.description ? row.description : null,
  }));
};

export type ApishipTariff = {
  id: number;
  providerKey: string;
  name: string;
  aliasName: string | null;
  description: string | null;
  weightMin: number | null;
  weightMax: number | null;
  /** 1 from the door, 2 from a point, `null` both. */
  pickupType: number | null;
  /** 1 to the door, 2 to a point, `null` both. */
  deliveryType: number | null;
};

/** `GET /lists/tariffs` — the tariff catalogue, optionally of one carrier. */
export const listTariffs = async (
  credentials: ApishipCredentials,
  input: { providerKey?: string } = {},
  options: ApishipClientOptions = {},
): Promise<ApishipTariff[]> => {
  const { rows } = await listAll<Record<string, unknown>>(
    credentials,
    "/lists/tariffs",
    {
      limit: 1000,
      offset: 0,
      filter: input.providerKey ? apishipFilter({ providerKey: input.providerKey }) : undefined,
    },
    options,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    providerKey: String(row.providerKey ?? ""),
    name: String(row.name ?? ""),
    aliasName: typeof row.aliasName === "string" && row.aliasName ? row.aliasName : null,
    description: typeof row.description === "string" && row.description ? row.description : null,
    weightMin: typeof row.weightMin === "number" ? row.weightMin : null,
    weightMax: typeof row.weightMax === "number" ? row.weightMax : null,
    pickupType: typeof row.pickupType === "number" ? row.pickupType : null,
    deliveryType: typeof row.deliveryType === "number" ? row.deliveryType : null,
  }));
};

/* ---------------------------------------------------------------- points */

/** `type` of a point: 1 pickup point, 2 parcel locker, 3 Russian Post office, 4 terminal (`GET /lists/pointTypes`). */
export type ApishipPointType = 1 | 2 | 3 | 4;

export type ApishipPoint = {
  id: number;
  providerKey: string;
  code: string;
  name: string;
  /** The full address as the carrier gave it. */
  address: string;
  postIndex: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  cityGuid: string | null;
  street: string | null;
  house: string | null;
  lat: number | null;
  lng: number | null;
  timetable: string | null;
  phone: string | null;
  /** 1 accepts parcels, 2 hands them out, 3 both. */
  availableOperation: number | null;
  type: ApishipPointType | null;
  description: string | null;
  fittingRoom: boolean | null;
  paymentCard: boolean | null;
  paymentCash: boolean | null;
  limits: {
    maxWeight: number | null;
    minWeight: number | null;
    maxSizeA: number | null;
    maxSizeB: number | null;
    maxSizeC: number | null;
    maxSizeSum: number | null;
  } | null;
  enabled: boolean | null;
};

const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : value === 1 || value === "1" ? true : value === 0 || value === "0" ? false : null;
const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export const toApishipPoint = (row: Record<string, unknown>): ApishipPoint => {
  const limits = (row.limits ?? null) as Record<string, unknown> | null;
  const type = num(row.type);
  return {
    id: Number(row.id),
    providerKey: String(row.providerKey ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? row.code ?? ""),
    address: String(row.address ?? ""),
    postIndex: text(row.postIndex),
    countryCode: text(row.countryCode),
    region: text(row.region),
    city: text(row.city),
    cityGuid: text(row.cityGuid),
    street: text(row.street),
    house: text(row.house),
    lat: num(row.lat),
    lng: num(row.lng),
    timetable: text(row.timetable),
    phone: text(row.phone),
    availableOperation: num(row.availableOperation),
    type: type === 1 || type === 2 || type === 3 || type === 4 ? type : null,
    description: text(row.description),
    fittingRoom: bool(row.fittingRoom),
    paymentCard: bool(row.paymentCard),
    paymentCash: bool(row.paymentCash),
    limits: limits
      ? {
          maxWeight: num(limits.maxWeight),
          minWeight: num(limits.minWeight),
          maxSizeA: num(limits.maxSizeA),
          maxSizeB: num(limits.maxSizeB),
          maxSizeC: num(limits.maxSizeC),
          maxSizeSum: num(limits.maxSizeSum),
        }
      : null,
    enabled: bool(row.enabled),
  };
};

export type ListPointsInput = {
  providerKey: string;
  city?: string;
  cityGuid?: string;
  ids?: number[];
  code?: string;
  types?: ApishipPointType[];
  /** Default `[2, 3]`: the points that hand parcels out. */
  availableOperation?: number[];
  limit?: number;
  offset?: number;
};

/**
 * `GET /lists/points` — a carrier's points, usually of one city. Measured on the
 * test contour: `filter=city=Санкт-Петербург;providerKey=cdek;availableOperation=[2,3]`
 * answers 282 rows with `meta.total`. Only connected carriers answer rows.
 */
export const listPoints = async (
  credentials: ApishipCredentials,
  input: ListPointsInput,
  options: ApishipClientOptions = {},
): Promise<{ points: ApishipPoint[]; total: number }> => {
  const { rows, total } = await listAll<Record<string, unknown>>(
    credentials,
    "/lists/points",
    {
      limit: Math.min(1000, Math.max(1, input.limit ?? 500)),
      offset: Math.max(0, input.offset ?? 0),
      filter: apishipFilter({
        providerKey: input.providerKey,
        city: input.city?.trim() || undefined,
        cityGuid: input.cityGuid,
        id: input.ids?.length ? input.ids : undefined,
        code: input.code,
        type: input.types?.length ? input.types : undefined,
        availableOperation: input.availableOperation ?? [2, 3],
      }),
    },
    options,
  );
  return { points: rows.map(toApishipPoint), total };
};

/** One point by its ApiShip id, or `null` when the carrier no longer lists it. */
export const getPoint = async (
  credentials: ApishipCredentials,
  input: { providerKey: string; id: number },
  options: ApishipClientOptions = {},
): Promise<ApishipPoint | null> => {
  const { points } = await listPoints(
    credentials,
    { providerKey: input.providerKey, ids: [input.id], availableOperation: [1, 2, 3], limit: 1 },
    options,
  );
  return points.find((point) => point.id === input.id) ?? null;
};

/* ------------------------------------------------------------ calculator */

export type ApishipCalculatorAddress = {
  countryCode: string;
  city?: string;
  cityGuid?: string;
  region?: string;
  index?: string;
  addressString?: string;
  lat?: number;
  lng?: number;
};

export type ApishipCalculatorPlace = { weight: number; length: number; width: number; height: number };

export type ApishipCalculatorRequest = {
  from: ApishipCalculatorAddress;
  to: ApishipCalculatorAddress;
  places: ApishipCalculatorPlace[];
  providerKeys?: string[];
  pickupTypes?: number[];
  deliveryTypes?: number[];
  pointOutId?: number;
  pointInId?: number;
  tariffIds?: number[];
  assessedCost?: number;
  codCost?: number;
  includeFees?: boolean;
  timeout?: number;
  pickupDate?: string;
};

export type ApishipCalculatorTariff = {
  tariffId: number;
  tariffName: string;
  tariffProviderId: string | null;
  deliveryCost: number;
  deliveryCostOriginal: number | null;
  feesIncluded: boolean | null;
  insuranceFee: number | null;
  cashServiceFee: number | null;
  daysMin: number | null;
  daysMax: number | null;
  calendarDaysMin: number | null;
  calendarDaysMax: number | null;
  workDaysMin: number | null;
  workDaysMax: number | null;
  pickupTypes: number[];
  deliveryTypes: number[];
  /** Points this tariff can deliver to; only in `deliveryToPoint`. */
  pointIds: number[] | null;
};

export type ApishipCalculatorGroup = { providerKey: string; tariffs: ApishipCalculatorTariff[] };

export type ApishipCalculatorAnswer = {
  deliveryToDoor: ApishipCalculatorGroup[];
  deliveryToPoint: ApishipCalculatorGroup[];
};

const toTariff = (row: Record<string, unknown>): ApishipCalculatorTariff => ({
  tariffId: Number(row.tariffId),
  tariffName: String(row.tariffName ?? ""),
  tariffProviderId: row.tariffProviderId === undefined || row.tariffProviderId === null ? null : String(row.tariffProviderId),
  deliveryCost: Number(row.deliveryCost),
  deliveryCostOriginal: num(row.deliveryCostOriginal),
  feesIncluded: typeof row.feesIncluded === "boolean" ? row.feesIncluded : null,
  insuranceFee: num(row.insuranceFee),
  cashServiceFee: num(row.cashServiceFee),
  daysMin: num(row.daysMin),
  daysMax: num(row.daysMax),
  calendarDaysMin: num(row.calendarDaysMin),
  calendarDaysMax: num(row.calendarDaysMax),
  workDaysMin: num(row.workDaysMin),
  workDaysMax: num(row.workDaysMax),
  pickupTypes: Array.isArray(row.pickupTypes) ? row.pickupTypes.map(Number) : [],
  deliveryTypes: Array.isArray(row.deliveryTypes) ? row.deliveryTypes.map(Number) : [],
  pointIds: Array.isArray(row.pointIds) ? row.pointIds.map(Number) : null,
});

const toGroups = (value: unknown): ApishipCalculatorGroup[] =>
  (Array.isArray(value) ? value : []).map((group: Record<string, unknown>) => ({
    providerKey: String(group.providerKey ?? ""),
    tariffs: (Array.isArray(group.tariffs) ? group.tariffs : []).map(toTariff),
  }));

/**
 * `POST /calculator`. Weight in grams, sides in centimetres, money in roubles.
 * HTTP 200 with empty `tariffs` is a real answer («no tariff for this route»),
 * not an error, and the caller decides what that means.
 */
export const calculate = async (
  credentials: ApishipCredentials,
  input: ApishipCalculatorRequest,
  options: ApishipClientOptions = {},
): Promise<ApishipCalculatorAnswer> => {
  const answer = await apishipRequest<Record<string, unknown>>(
    credentials,
    "/calculator",
    { method: "POST", body: input },
    options,
  );
  return {
    deliveryToDoor: toGroups(answer?.deliveryToDoor),
    deliveryToPoint: toGroups(answer?.deliveryToPoint),
  };
};

/* ----------------------------------------------------------------- probe */

/** How long a probe may hang before it is reported as «не ответил». */
const PROBE_TIMEOUT_MS = 15_000;

export type ApishipProbe = {
  /** `true` only when ApiShip answered 2xx to an authenticated read. */
  ok: boolean;
  /** The HTTP status ApiShip answered with; `null` when the request never got one. */
  status: number | null;
  /** How many carrier connections the cabinet holds. `null` unless `ok`. */
  connections: number | null;
  /** The reason a probe failed, in the owner's language. `null` when `ok`. */
  error: string | null;
};

/**
 * Ask ApiShip whether this token is accepted (p01-settings-integrations-restructure).
 *
 * A network failure and a rejected token are DIFFERENT answers and never
 * collapse into one `false` (rule 20a): the caller gets the status ApiShip
 * answered with, or `status: null` plus the transport error. `ok` alone would
 * make «ApiShip is down» read as «your token is wrong», which sends the owner
 * to mint a second token for nothing.
 */
export const probeApishipToken = async (
  token: string,
  options: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ApishipProbe> => {
  const base = (options.baseUrl ?? APISHIP_BASE_URL).replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PROBE_TIMEOUT_MS);

  try {
    const response = await doFetch(`${base}/connections`, {
      method: "GET",
      headers: { Authorization: token, Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        connections: null,
        error:
          response.status === 401 || response.status === 403
            ? "ApiShip не принял токен."
            : `ApiShip ответил HTTP ${response.status}.`,
      };
    }

    // `rows` is the list shape every ApiShip list answers with. A body that is
    // not that shape still counts as an accepted token; the count is simply
    // unknown, and `null` says so rather than a zero that would read as «no
    // carriers».
    const body = (await response.json().catch(() => null)) as { rows?: unknown[] } | null;
    return {
      ok: true,
      status: response.status,
      connections: Array.isArray(body?.rows) ? body.rows.length : null,
      error: null,
    };
  } catch (error) {
    const reason = (error as Error)?.name === "AbortError" ? "ApiShip не ответил вовремя." : `Не удалось обратиться к ApiShip: ${(error as Error).message}`;
    return { ok: false, status: null, connections: null, error: reason };
  } finally {
    clearTimeout(timer);
  }
};
