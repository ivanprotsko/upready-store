import {
  MP_DEFAULT_BACKOFF_MS,
  MP_MAX_ATTEMPTS,
  MP_MAX_BACKOFF_MS,
  backoffFrom,
  retryAfterMs,
  sleep,
} from "../marketplace/backoff";
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

/**
 * The 429 policy is the SHARED one (`modules/marketplace/backoff.ts`,
 * w16-mp-scheduler-ops). It used to be written out here and again in the
 * other transport, with the same three numbers and the same two helpers in
 * both files; the scheduler would have made a third copy. The numbers did
 * not change when they moved: three attempts, one wait capped at 30 s, 2 s
 * growing with the attempt when the marketplace names no window of its own.
 */

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

/**
 * A WB answer that is not a 2xx. Carries the status and the redacted body.
 *
 * `retryAfterMs` is set only for a 429 that named its own window, and it is
 * what lets a run tell "WB is rate-limiting us, come back at HH:MM" from "the
 * import is broken" (w03). WB's limits are part of the product on a base
 * token — questions and feedbacks share five requests an hour — so a run that
 * hits one is WAITING, not failing, and the owner must not read it as damage.
 */
export class WbApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly retryAfterMs: number | null;

  constructor(endpointId: string, status: number, body: string, retryAfterMs: number | null = null) {
    super(`WB ${endpointId} answered ${status}: ${body.slice(0, 500)}`);
    this.name = "WbApiError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
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

  while (attempt < MP_MAX_ATTEMPTS) {
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
        const wait = attempt < MP_MAX_ATTEMPTS ? backoffFrom(response.headers, attempt) : null;

        if (wait !== null) {
          failure = `429, retrying in ${wait} ms`;
          await journalCall(options, entry, path, status, Date.now() - startedAt, failure, logger);
          logger.warn(
            `[wb] ${entry.method} ${entry.host}${path} -> 429, attempt ${attempt}/${MP_MAX_ATTEMPTS}, ` +
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
              `this client waits inside one run (${MP_MAX_BACKOFF_MS / 1000} s). Run this kind again later.]`,
          asked,
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
        `[wb] ${entry.method} ${entry.host}${path} failed on attempt ${attempt}/${MP_MAX_ATTEMPTS}: ` +
          `${message} (Authorization: ***)`,
      );
      if (attempt >= MP_MAX_ATTEMPTS) {
        break;
      }
      await sleep(Math.min(MP_DEFAULT_BACKOFF_MS * attempt, MP_MAX_BACKOFF_MS));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`WB ${entry.id} failed after ${MP_MAX_ATTEMPTS} attempts.`);
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
