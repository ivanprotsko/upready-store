import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * A minimal in-memory sliding-window limit for the two unauthenticated doors a
 * script would hammer: the tenant login and the shop registration (audit
 * 2026-09-23, A-04). Ten requests per minute per client, then 429 with
 * `Retry-After`.
 *
 * In memory on purpose: one backend process serves each deployment, and a
 * limit that resets on restart still turns a password-guessing loop from
 * thousands of tries a minute into ten. A shared store (Redis) is the next
 * step once there is more than one process.
 */

type Env = Record<string, string | undefined>;

type ClientRequest = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null } | null;
};

/**
 * Who is asking. Behind a reverse proxy every request arrives from the proxy's
 * address, so the client is the FIRST hop of `X-Forwarded-For`, but only when
 * `TRUST_PROXY=1` says a proxy we control (traefik on the deployments) wrote
 * that header. Without it the header is the caller's own word and is ignored.
 */
export const clientKey = (req: ClientRequest, env: Env = process.env): string => {
  if (env.TRUST_PROXY === "1") {
    const header = req.headers["x-forwarded-for"];
    const value = Array.isArray(header) ? header[0] : header;
    const first = value?.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket?.remoteAddress ?? "unknown";
};

export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  /** Injectable for the tests. */
  now?: () => number;
  env?: Env;
};

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** The window itself, free of HTTP so the test can drive it directly. */
export const slidingWindow = ({ limit = 10, windowMs = 60_000, now = Date.now }: RateLimitOptions = {}) => {
  const hits = new Map<string, number[]>();

  const sweep = (at: number) => {
    for (const [key, stamps] of hits) {
      if (stamps[stamps.length - 1] <= at - windowMs) {
        hits.delete(key);
      }
    }
  };

  return {
    hit(key: string): RateLimitVerdict {
      const at = now();
      // Keeps the map bounded under a spray of distinct addresses.
      if (hits.size > 10_000) {
        sweep(at);
      }
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > at - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - at) / 1000)),
        };
      }
      recent.push(at);
      hits.set(key, recent);
      return { allowed: true };
    },
    size: () => hits.size,
  };
};

/** One limiter per route: each gets its own window. */
export const rateLimit = (options: RateLimitOptions = {}) => {
  const window = slidingWindow(options);

  return (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    // The HTTP integration suites register and log in far more than ten
    // shops a minute from one address; they test the routes, not the limit.
    if ((options.env ?? process.env).NODE_ENV === "test") {
      return next();
    }
    const verdict = window.hit(clientKey(req as unknown as ClientRequest, options.env));
    if (verdict.allowed) {
      return next();
    }
    res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
    res.status(429).json({
      type: "too_many_requests",
      message: `Too many attempts. Try again in ${verdict.retryAfterSeconds} s.`,
    });
  };
};
