/**
 * ApiShip API v1, READ ONLY (p01-settings-integrations-restructure).
 *
 * One call: `GET /v1/connections`, the cheapest authenticated read ApiShip
 * has, used to answer one question — «does this shop's token work». Nothing
 * here quotes, ships or cancels anything, because the checkout does not go
 * through ApiShip: i02 measured the ApiShip calculator returning ZERO tariffs
 * for this account in all four location combinations, so shipping is quoted
 * against CDEK directly (`artifacts/docs/i02-apiship-cdek-shipping/decision.md`).
 *
 * MEASURED, not remembered (2026-09-16, real token from `~/upready/.env.keys`,
 * value never copied anywhere):
 *
 *   GET https://api.apiship.ru/v1/connections
 *     Authorization: <token>          -> HTTP 200
 *     Authorization: Bearer <token>   -> HTTP 401
 *
 * So the header carries the BARE token. The `Bearer ` form is the one a reader
 * would guess, and it is the one ApiShip rejects.
 */

/** ApiShip's own production base. The dev contour (`api.dev.apiship.ru`) wants its own token. */
export const APISHIP_BASE_URL = process.env.APISHIP_BASE_URL ?? "https://api.apiship.ru/v1";

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
 * Ask ApiShip whether this token is accepted.
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

    // `rows` is the list shape every ApiShip list answers with
    // (`probes/apiship-prod-connections.json`). A body that is not that shape
    // still counts as an accepted token; the count is simply unknown, and
    // `null` says so rather than a zero that would read as «no carriers».
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
