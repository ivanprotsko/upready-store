import {
  resolveEndpoint,
  WbWriteForbiddenError,
  type WbReadEndpoint,
} from "./endpoints";

/**
 * The ONLY file in this repository that performs network I/O towards
 * Wildberries (w01-wb-readonly-client). `__tests__/transport-single-call-site.unit.spec.ts`
 * scans the three app sources and fails if a second one appears.
 *
 * Read-only by construction, not by configuration:
 *
 * - the public surface is `wbRead(endpointId, options)`. A caller names a
 *   registry entry. It cannot pass a method, a host, a URL or a header;
 * - the method comes from the entry, and the registry can hold nothing but GET
 *   and the POSTs WB's own documentation calls reads (`endpoints.ts`);
 * - an unregistered id throws `WbWriteForbiddenError` before any socket opens;
 * - nothing else is exported: no `fetch`, no client instance, no base URL, no
 *   "raw request" helper. There is no escape hatch to find.
 *
 * So a key that carries write rights by mistake still cannot write: the code
 * has nowhere to put a write.
 */

/**
 * Default ceiling on one request, including reading the response body. An
 * endpoint whose body is measurably larger overrides it with `timeoutMs`
 * (see `statistics.orders` in `endpoints.ts`).
 */
export const WB_TIMEOUT_MS = 15_000;

/** 429 is retried this many times in total (the first try included). */
const MAX_ATTEMPTS = 3;

/** Upper bound on one backoff, so a hostile Retry-After cannot park the job. */
const MAX_BACKOFF_MS = 30_000;

/** Used when a 429 carries no usable Retry-After. */
const DEFAULT_BACKOFF_MS = 2_000;

/** What the caller may vary. Never the method, never the host. */
export type WbReadOptions = {
  /** The API key of the shop this read is for. Never logged, never journalled. */
  token: string;
  /** Values for the `:name` placeholders of the entry's path. */
  params?: Record<string, string | number>;
  /** Query string parameters. `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Request body, for a POST read only. */
  body?: unknown;
  /** The tenant whose key this is, for the journal. */
  tenantId?: string | null;
  /** The `wb_sync_run` this call belongs to, for the journal. */
  syncRunId?: string | null;
  /** Appends one `wb_api_call` row. Failures here never fail the read. */
  journal?: (entry: WbApiCallRecord) => Promise<void> | void;
  /** Structured log sink. Defaults to `console`; the token is never passed in. */
  logger?: Pick<Console, "info" | "warn">;
};

/** One row of the transport journal: proof of what left the process. */
export type WbApiCallRecord = {
  tenant_id: string | null;
  sync_run_id: string | null;
  endpoint_id: string;
  host: string;
  method: "GET" | "POST";
  path: string;
  status: number | null;
  ms: number;
  error: string | null;
  fetched_at: Date;
};

export type WbReadResult<T = unknown> = {
  status: number;
  data: T;
  endpoint: WbReadEndpoint;
};

/** A WB answer that is not a 2xx. Carries the status and the redacted body. */
export class WbApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(endpointId: string, status: number, body: string) {
    super(`WB ${endpointId} answered ${status}: ${body.slice(0, 500)}`);
    this.name = "WbApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Substitutes `:name` placeholders. An unfilled placeholder is a programming
 * error and throws rather than reaching WB as a literal `:warehouseId`, which
 * would be a request to a path nobody reviewed.
 */
const buildPath = (entry: WbReadEndpoint, params: Record<string, string | number> = {}): string => {
  const path = entry.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") {
      throw new WbWriteForbiddenError(
        `WB endpoint ${entry.id} needs path parameter ${name}, which was not supplied.`,
      );
    }
    return encodeURIComponent(String(value));
  });

  if (path.includes(":")) {
    throw new WbWriteForbiddenError(`WB endpoint ${entry.id} has an unresolved path placeholder.`);
  }

  return path;
};

const buildQuery = (query: WbReadOptions["query"]): string => {
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
 * How long WB wants us to wait, in milliseconds, or `null` when it did not say.
 *
 * `Retry-After` is the standard header (seconds or an HTTP date, RFC 9110),
 * but WB does not send it for every category. Measured on 2026-09-16 against
 * `feedbacks-api` with a base token, a 429 carries instead:
 *
 *     x-ratelimit-limit: 1
 *     x-ratelimit-remaining: 0
 *     x-ratelimit-reset: 573
 *     x-ratelimit-retry: 573
 *
 * and the body says "retry after the period specified in the X-RateLimit-Retry
 * header". So all three names are read, in that order of preference.
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

  return (
    seconds(headers.get("retry-after")) ??
    seconds(headers.get("x-ratelimit-retry")) ??
    seconds(headers.get("x-ratelimit-reset"))
  );
};

/**
 * The backoff for one 429, or `null` when waiting it out is not this process's
 * job: WB's own answer can be ten minutes away (573 s measured on a base
 * token), and a sync that sleeps that long is a hung sync. Beyond the ceiling
 * the read fails with the wait named, so the operator learns WHEN the data can
 * be fetched instead of watching a silent process.
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
 * The one WB read. `endpointId` names an entry of `WB_READ_ENDPOINTS`; the
 * method, host and path come from that entry and from nowhere else.
 */
export const wbRead = async <T = unknown>(
  endpointId: string,
  options: WbReadOptions,
): Promise<WbReadResult<T>> => {
  const entry = resolveEndpoint(endpointId);
  const logger = options.logger ?? console;

  if (!options.token) {
    throw new WbWriteForbiddenError(`WB endpoint ${entry.id} was called without a key.`);
  }

  if (entry.method === "GET" && options.body !== undefined) {
    throw new WbWriteForbiddenError(
      `WB endpoint ${entry.id} is a GET and takes no body. A body on a GET is how a write gets ` +
        "smuggled past a reviewer; it is refused here.",
    );
  }

  const path = buildPath(entry, options.params);
  const url = `https://${entry.host}${path}${buildQuery(options.query)}`;

  const headers: Record<string, string> = {
    Authorization: options.token,
    Accept: "application/json",
  };
  if (entry.method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const startedAt = Date.now();
    let status: number | null = null;
    let failure: string | null = null;

    try {
      const response = await fetch(url, {
        method: entry.method,
        headers,
        body: entry.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
        signal: AbortSignal.timeout(entry.timeoutMs ?? WB_TIMEOUT_MS),
      });

      status = response.status;
      const text = await response.text();

      if (response.status === 429) {
        const wait = attempt < MAX_ATTEMPTS ? backoffFrom(response.headers, attempt) : null;

        if (wait !== null) {
          failure = `429, retrying in ${wait} ms`;
          await journalCall(options, entry, path, status, Date.now() - startedAt, failure, logger);
          logger.warn(
            `[wb] ${entry.method} ${entry.host}${path} -> 429, attempt ${attempt}/${MAX_ATTEMPTS}, ` +
              `waiting ${wait} ms (Authorization: ***)`,
          );
          await sleep(wait);
          continue;
        }

        const asked = retryAfterMs(response.headers);
        failure =
          asked === null
            ? "429 after every attempt"
            : `429, WB asks for ${Math.round(asked / 1000)} s`;
        await journalCall(options, entry, path, status, Date.now() - startedAt, failure, logger);
        throw new WbApiError(
          entry.id,
          429,
          asked === null
            ? text
            : `${text} [WB asks to retry in ${Math.round(asked / 1000)} s, which is longer than ` +
              `this client waits inside one run (${MAX_BACKOFF_MS / 1000} s). Run this kind again later.]`,
        );
      }

      const ms = Date.now() - startedAt;

      if (!response.ok) {
        failure = `HTTP ${response.status}`;
        await journalCall(options, entry, path, status, ms, failure, logger);
        throw new WbApiError(entry.id, response.status, text);
      }

      await journalCall(options, entry, path, status, ms, null, logger);
      logger.info(
        `[wb] ${entry.method} ${entry.host}${path} -> ${response.status} in ${ms} ms ` +
          "(Authorization: ***)",
      );

      return {
        status: response.status,
        data: (text ? JSON.parse(text) : null) as T,
        endpoint: entry,
      };
    } catch (error) {
      if (error instanceof WbApiError) {
        throw error;
      }
      lastError = error;
      const ms = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      await journalCall(options, entry, path, status, ms, message, logger);
      logger.warn(
        `[wb] ${entry.method} ${entry.host}${path} failed on attempt ${attempt}/${MAX_ATTEMPTS}: ` +
          `${message} (Authorization: ***)`,
      );
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }
      await sleep(Math.min(DEFAULT_BACKOFF_MS * attempt, MAX_BACKOFF_MS));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`WB ${entry.id} failed after ${MAX_ATTEMPTS} attempts.`);
};

/**
 * Appends the journal row. A journal that throws must not turn a successful
 * read into a failure, so the error is logged and swallowed here — but it is
 * logged, never silent (rule 20a).
 */
const journalCall = async (
  options: WbReadOptions,
  entry: WbReadEndpoint,
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
      fetched_at: new Date(),
    });
  } catch (journalError) {
    const message = journalError instanceof Error ? journalError.message : String(journalError);
    logger.warn(`[wb] could not write the transport journal for ${entry.id}: ${message}`);
  }
};
