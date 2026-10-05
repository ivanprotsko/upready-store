/**
 * Keeps an idle keep-alive socket of the backend open longer than the proxy in
 * front of it does (pass 3b N12: single 502 answers on the INTL instance).
 *
 * Node's http server drops an idle keep-alive socket after 5 s
 * (`keepAliveTimeout`); traefik keeps its side for 90 s by default. A request
 * the proxy writes to a socket Node has just closed comes back as 502. On the
 * RU host the proxy is this project's and closes first
 * (`--serverstransport.forwardingtimeouts.idleconntimeout=4s` in
 * `deploy/compose.ru-host.yml`, t-2026-10-04-44). On the INTL host the proxy is
 * shared and its static configuration is not ours, so the server has to be the
 * side that waits longer: 95 s against the proxy's 90 s.
 *
 * Why it is done this way. `medusa start` creates the server itself,
 * `http.createServer(...)` in `@medusajs/medusa/dist/commands/start.js`, and
 * takes no option for its timeouts. What the project runs before that call is
 * `medusa-config.ts`. So this wraps `http.createServer` there, once, and only
 * sets the two timeouts on the server it returns. `headersTimeout` has to stay
 * above `keepAliveTimeout`, as Node's documentation asks.
 *
 * `HTTP_KEEP_ALIVE_TIMEOUT_MS` sets another value for a host behind another
 * proxy; `0` leaves Node's own timeouts alone. The storefront gets the same
 * through Next's `KEEP_ALIVE_TIMEOUT` (`deploy/compose.mt.yml`). When the
 * framework learns to configure its server, delete this.
 */

export const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 95_000;

/** How far `headersTimeout` stays above `keepAliveTimeout`. */
const HEADERS_MARGIN_MS = 5_000;

type TimedServer = { keepAliveTimeout: number; headersTimeout: number };
type CreateServer = (...args: unknown[]) => TimedServer;

const WRAPPED = Symbol.for("upready.http-keep-alive");

export const keepAliveTimeoutMs = (raw: string | undefined = process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS): number => {
  if (raw === undefined || raw.trim() === "") return DEFAULT_KEEP_ALIVE_TIMEOUT_MS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_KEEP_ALIVE_TIMEOUT_MS;
};

export const installHttpKeepAlive = (): void => {
  const timeout = keepAliveTimeoutMs();
  if (timeout === 0) return;

  const http = require("http") as { createServer: CreateServer & { [WRAPPED]?: true } };
  if (http.createServer[WRAPPED]) return;

  const createServer = http.createServer;
  const wrapped = ((...args) => {
    const server = createServer(...args);
    server.keepAliveTimeout = timeout;
    server.headersTimeout = Math.max(server.headersTimeout, timeout + HEADERS_MARGIN_MS);
    return server;
  }) as CreateServer & { [WRAPPED]?: true };

  wrapped[WRAPPED] = true;
  http.createServer = wrapped;
};
