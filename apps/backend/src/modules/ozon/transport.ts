import {
  resolveEndpoint,
  OzonWriteForbiddenError,
  type OzonReadEndpoint,
} from "./endpoints";

/**
 * The ONLY file in this repository that performs network I/O towards Ozon
 * (w11-ozon-readonly-client). `__tests__/transport-single-call-site.unit.spec.ts`
 * scans the application sources and fails if a second one appears.
 *
 * Read-only by construction, not by configuration:
 *
 * - the public surface is `ozonRead(endpointId, options)`. A caller names a
 *   registry entry. It cannot pass a method, a host, a URL or a header;
 * - the method comes from the entry, and the registry can hold nothing but the
 *   POSTs Ozon's own documentation calls reads (`endpoints.ts`), with a
 *   deny-list of known mutations failing module load on top;
 * - an unregistered id throws `OzonWriteForbiddenError` before any socket opens;
 * - nothing else is exported: no `fetch`, no client instance, no base URL, no
 *   "raw request" helper. There is no escape hatch to find.
 *
 * So a key that carries write rights still cannot write: the code has nowhere
 * to put a write. That matters more on Ozon than on Wildberries, because on
 * Ozon the verb hides the difference — `POST /v3/product/list` reads and
 * `POST /v1/review/comment/create` publishes a comment under a customer's
 * review in the shop's name.
 */

/**
 * Default ceiling on one request, including reading the response body. The
 * same 15 s the Wildberries client starts from; an endpoint that measurably
 * needs longer overrides it with `timeoutMs` in the registry.
 */
export const OZON_TIMEOUT_MS = 15_000;

/** 429 is retried this many times in total (the first try included). */
const MAX_ATTEMPTS = 3;

/** Upper bound on one backoff, so a hostile Retry-After cannot park the job. */
const MAX_BACKOFF_MS = 30_000;

/** Used when a 429 carries no usable Retry-After. */
const DEFAULT_BACKOFF_MS = 2_000;

/**
 * Ozon's own ceiling, saved page line 245: "Вы можете отправить не больше 50
 * запросов в секунду на все методы с одного Client ID." Kept as a minimum
 * spacing between two requests of one Client-Id rather than a token bucket:
 * a sync is sequential, and the honest thing to enforce is the documented
 * number, not a cleverer one nobody measured.
 */
export const OZON_MAX_RPS = 50;
const MIN_GAP_MS = Math.ceil(1000 / OZON_MAX_RPS);

/** The credential pair. Both halves are secrets; neither is ever logged. */
export type OzonCredentials = {
  /** `Client-Id` header. Identifies the cabinet. */
  clientId: string;
  /** `Api-Key` header. Lives 3 months, see `access.roles`. */
  apiKey: string;
};

/** What the caller may vary. Never the method, never the host. */
export type OzonReadOptions = {
  credentials: OzonCredentials;
  /** Values for the `:name` placeholders of the entry's path. */
  params?: Record<string, string | number>;
  /** Query string parameters. `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Request body. Ozon reads take theirs in a body; `{}` when there is none. */
  body?: unknown;
  /** The tenant whose key this is, for the journal. */
  tenantId?: string | null;
  /** The `ozon_sync_run` this call belongs to, for the journal. */
  syncRunId?: string | null;
  /** Appends one `ozon_api_call` row. Failures here never fail the read. */
  journal?: (entry: OzonApiCallRecord) => Promise<void> | void;
  /** Structured log sink. Defaults to `console`; no secret is ever passed in. */
  logger?: Pick<Console, "info" | "warn">;
};

/** One row of the transport journal: proof of what left the process. */
export type OzonApiCallRecord = {
  tenant_id: string | null;
  sync_run_id: string | null;
  endpoint_id: string;
  host: string;
  method: "GET" | "POST";
  path: string;
  status: number | null;
  ms: number;
  error: string | null;
  /** `false` here always: this file only ever makes real calls. */
  is_fixture: boolean;
  fetched_at: Date;
};

export type OzonReadResult<T = unknown> = {
  status: number;
  data: T;
  endpoint: OzonReadEndpoint;
};

/** An Ozon answer that is not a 2xx. Carries the status and the body. */
export class OzonApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(endpointId: string, status: number, body: string) {
    super(`Ozon ${endpointId} answered ${status}: ${body.slice(0, 500)}`);
    this.name = "OzonApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Substitutes `:name` placeholders. An unfilled placeholder is a programming
 * error and throws rather than reaching Ozon as a literal `:postingNumber`,
 * which would be a request to a path nobody reviewed.
 */
const buildPath = (
  entry: OzonReadEndpoint,
  params: Record<string, string | number> = {},
): string => {
  const path = entry.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} needs path parameter ${name}, which was not supplied.`,
      );
    }
    return encodeURIComponent(String(value));
  });

  if (path.includes(":")) {
    throw new OzonWriteForbiddenError(`Ozon endpoint ${entry.id} has an unresolved path placeholder.`);
  }

  return path;
};

const buildQuery = (query: OzonReadOptions["query"]): string => {
  if (!query) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

/**
 * How long Ozon wants us to wait, in milliseconds, or `null` when it did not
 * say. `Retry-After` is the standard header (seconds or an HTTP date,
 * RFC 9110). `x-ratelimit-reset` is read as a fallback because the Wildberries
 * client measured a marketplace sending only that name; whether Ozon does the
 * same is unknown until a live 429 arrives, and reading a header that is
 * absent costs nothing.
 */
const retryAfterMs = (headers: Headers): number | null => {
  const seconds = (raw: string | null): number | null => {
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) {
      return value * 1000;
    }
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(date - Date.now(), 0) : null;
  };

  return seconds(headers.get("retry-after")) ?? seconds(headers.get("x-ratelimit-reset"));
};

/**
 * The backoff for one 429, or `null` when waiting it out is not this process's
 * job. `/v1/analytics/data` alone is capped at one request per minute, so a
 * 429 there can ask for longer than a sync may sleep; beyond the ceiling the
 * read fails with the wait NAMED, so the operator learns when the data can be
 * fetched instead of watching a silent process.
 */
const backoffFrom = (headers: Headers, attempt: number): number | null => {
  const asked = retryAfterMs(headers);
  if (asked === null) {
    return Math.min(DEFAULT_BACKOFF_MS * attempt, MAX_BACKOFF_MS);
  }
  return asked > MAX_BACKOFF_MS ? null : asked;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * When each Client-Id last sent anything, and when each (Client-Id, endpoint)
 * pair last ran. Process-local: one sync runs in one process, and a shared
 * budget across processes is a thing to measure before it is built, not to
 * pretend at (rule 32a).
 */
const lastCallAt = new Map<string, number>();

const spacingFor = (entry: OzonReadEndpoint, clientId: string): number => {
  const now = Date.now();
  const waits: number[] = [];

  const globalKey = `client:${clientId}`;
  const sinceGlobal = now - (lastCallAt.get(globalKey) ?? 0);
  if (sinceGlobal < MIN_GAP_MS) {
    waits.push(MIN_GAP_MS - sinceGlobal);
  }

  if (entry.minIntervalMs) {
    const methodKey = `client:${clientId}|${entry.id}`;
    const sinceMethod = now - (lastCallAt.get(methodKey) ?? 0);
    if (sinceMethod < entry.minIntervalMs) {
      waits.push(entry.minIntervalMs - sinceMethod);
    }
  }

  return waits.length ? Math.max(...waits) : 0;
};

const markCall = (entry: OzonReadEndpoint, clientId: string): void => {
  const now = Date.now();
  lastCallAt.set(`client:${clientId}`, now);
  if (entry.minIntervalMs) {
    lastCallAt.set(`client:${clientId}|${entry.id}`, now);
  }
};

/** Test seam: a run must not inherit the spacing state of the previous one. */
export const resetRateLimiter = (): void => {
  lastCallAt.clear();
};

/**
 * The one Ozon read. `endpointId` names an entry of `OZON_READ_ENDPOINTS`; the
 * method, host and path come from that entry and from nowhere else.
 */
export const ozonRead = async <T = unknown>(
  endpointId: string,
  options: OzonReadOptions,
): Promise<OzonReadResult<T>> => {
  const entry = resolveEndpoint(endpointId);
  const logger = options.logger ?? console;

  const clientId = options.credentials?.clientId ?? "";
  const apiKey = options.credentials?.apiKey ?? "";

  if (!clientId || !apiKey) {
    throw new OzonWriteForbiddenError(
      `Ozon endpoint ${entry.id} was called without both Client-Id and Api-Key.`,
    );
  }

  const path = buildPath(entry, options.params);
  const url = `https://${entry.host}${path}${buildQuery(options.query)}`;

  const headers: Record<string, string> = {
    "Client-Id": clientId,
    "Api-Key": apiKey,
    Accept: "application/json",
  };
  if (entry.method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const spacing = spacingFor(entry, clientId);
  if (spacing > 0) {
    logger.info(
      `[ozon] ${entry.id}: waiting ${spacing} ms for the documented rate limit ` +
        `(${OZON_MAX_RPS}/s per Client-Id` +
        `${entry.minIntervalMs ? `, ${entry.minIntervalMs} ms for this method` : ""})`,
    );
    await sleep(spacing);
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const startedAt = Date.now();
    let status: number | null = null;
    let failure: string | null = null;

    try {
      markCall(entry, clientId);
      const response = await fetch(url, {
        method: entry.method,
        headers,
        body: entry.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
        signal: AbortSignal.timeout(entry.timeoutMs ?? OZON_TIMEOUT_MS),
      });

      status = response.status;
      const text = await response.text();

      if (response.status === 429) {
        const wait = attempt < MAX_ATTEMPTS ? backoffFrom(response.headers, attempt) : null;

        if (wait !== null) {
          failure = `429, retrying in ${wait} ms`;
          await journalCall(options, entry, path, status, Date.now() - startedAt, failure, logger);
          logger.warn(
            `[ozon] ${entry.method} ${entry.host}${path} -> 429, attempt ${attempt}/${MAX_ATTEMPTS}, ` +
              `waiting ${wait} ms (Client-Id: ***, Api-Key: ***)`,
          );
          await sleep(wait);
          continue;
        }

        const asked = retryAfterMs(response.headers);
        failure =
          asked === null
            ? "429 after every attempt"
            : `429, Ozon asks for ${Math.round(asked / 1000)} s`;
        await journalCall(options, entry, path, status, Date.now() - startedAt, failure, logger);
        throw new OzonApiError(
          entry.id,
          429,
          asked === null
            ? text
            : `${text} [Ozon asks to retry in ${Math.round(asked / 1000)} s, which is longer than ` +
              `this client waits inside one run (${MAX_BACKOFF_MS / 1000} s). Run this kind again later.]`,
        );
      }

      const ms = Date.now() - startedAt;

      if (!response.ok) {
        failure = `HTTP ${response.status}`;
        await journalCall(options, entry, path, status, ms, failure, logger);
        throw new OzonApiError(entry.id, response.status, text);
      }

      await journalCall(options, entry, path, status, ms, null, logger);
      logger.info(
        `[ozon] ${entry.method} ${entry.host}${path} -> ${response.status} in ${ms} ms ` +
          "(Client-Id: ***, Api-Key: ***)",
      );

      return {
        status: response.status,
        data: (text ? JSON.parse(text) : null) as T,
        endpoint: entry,
      };
    } catch (error) {
      if (error instanceof OzonApiError) {
        throw error;
      }
      lastError = error;
      const ms = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      await journalCall(options, entry, path, status, ms, message, logger);
      logger.warn(
        `[ozon] ${entry.method} ${entry.host}${path} failed on attempt ${attempt}/${MAX_ATTEMPTS}: ` +
          `${message} (Client-Id: ***, Api-Key: ***)`,
      );
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }
      await sleep(Math.min(DEFAULT_BACKOFF_MS * attempt, MAX_BACKOFF_MS));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Ozon ${entry.id} failed after ${MAX_ATTEMPTS} attempts.`);
};

/**
 * Appends the journal row. A journal that throws must not turn a successful
 * read into a failure, so the error is logged and swallowed here — but it is
 * logged, never silent (rule 20a).
 */
const journalCall = async (
  options: OzonReadOptions,
  entry: OzonReadEndpoint,
  path: string,
  status: number | null,
  ms: number,
  error: string | null,
  logger: Pick<Console, "info" | "warn">,
): Promise<void> => {
  if (!options.journal) {
    return;
  }
  try {
    await options.journal({
      tenant_id: options.tenantId ?? null,
      sync_run_id: options.syncRunId ?? null,
      endpoint_id: entry.id,
      host: entry.host,
      method: entry.method,
      path,
      status,
      ms,
      error,
      is_fixture: false,
      fetched_at: new Date(),
    });
  } catch (journalError) {
    const message = journalError instanceof Error ? journalError.message : String(journalError);
    logger.warn(`[ozon] could not write the transport journal for ${entry.id}: ${message}`);
  }
};
