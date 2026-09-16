/**
 * THE ONE 429 POLICY of this repository (w16-mp-scheduler-ops, spec 2.6).
 *
 * WHY IT MOVED HERE. The policy was written twice, once in
 * `modules/wb/transport.ts` and once in `modules/ozon/transport.ts`, with the
 * same three constants and the same two helpers in both files. Two copies of
 * one decision drift, and the scheduler this task adds would have made a
 * THIRD copy — a retry loop one level above the transport, with its own idea
 * of how long a wait may be. So the policy is named once and imported by
 * everything that waits out a 429 (rule 20: the class, not the call site).
 *
 * The numbers themselves are unchanged and stay the ones the two transports
 * were accepted with. What the marketplaces document:
 *
 *   Wildberries — token bucket, 300 requests/minute with a burst of 20 for a
 *   personal Marketplace token, a 4XX answer counting as TEN requests. A 429
 *   carries `X-Ratelimit-Retry`, `X-Ratelimit-Reset` and `X-Ratelimit-Limit`;
 *   every other answer carries `X-Ratelimit-Remaining`
 *   (`artifacts/docs/w01-wb-readonly-client/docs/dev.wildberries.ru-ru-api-information.txt`).
 *   Measured against `feedbacks-api` on a base token, a 429 sent
 *   `x-ratelimit-retry: 573` and no `Retry-After` at all.
 *
 *   Ozon — no more than 50 requests per second on all methods from one
 *   Client-Id, and `/v1/analytics/data` no more than once per minute
 *   (`artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt`).
 *   Which header its 429 carries is unknown until a live one arrives, so all
 *   three names are read here: reading a header that is absent costs nothing,
 *   and a marketplace-specific reader is the drift this file exists to remove.
 */

/** A 429 is retried this many times in total, the first try included. */
export const MP_MAX_ATTEMPTS = 3;

/**
 * Upper bound on ONE wait, so a marketplace asking for ten minutes cannot park
 * the process. Beyond it the read fails with the wait NAMED, which is how the
 * operator learns WHEN the data can be fetched instead of watching silence.
 */
export const MP_MAX_BACKOFF_MS = 30_000;

/** Used when a 429 carries no usable wait of its own. Grows with the attempt. */
export const MP_DEFAULT_BACKOFF_MS = 2_000;

/**
 * The upper bound on the waiting a single retry chain may do, in ms.
 *
 * `MP_MAX_ATTEMPTS` tries means at most `MP_MAX_ATTEMPTS - 1` waits, each
 * capped at `MP_MAX_BACKOFF_MS`. The scheduler's backoff test asserts the
 * total against this number rather than against a literal, so raising the cap
 * cannot silently loosen the bound the test claims to check.
 */
export const MP_MAX_TOTAL_BACKOFF_MS = MP_MAX_BACKOFF_MS * (MP_MAX_ATTEMPTS - 1);

/**
 * Seconds or an HTTP date (RFC 9110) as milliseconds, or `null` when the value
 * is missing or unreadable. A past date reads as zero rather than as a
 * negative wait.
 */
const asMs = (raw: string | null | undefined): number | null => {
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

/**
 * How long the marketplace wants us to wait, in milliseconds, or `null` when
 * it did not say.
 *
 * `Retry-After` is the standard name and is preferred; `X-Ratelimit-Retry` is
 * what Wildberries actually sends and what its own 429 body names;
 * `X-Ratelimit-Reset` is the last resort.
 */
export const retryAfterMs = (headers: Headers): number | null =>
  asMs(headers.get("retry-after")) ??
  asMs(headers.get("x-ratelimit-retry")) ??
  asMs(headers.get("x-ratelimit-reset"));

/**
 * The wait for one 429 given what the marketplace asked for, or `null` when
 * waiting it out is not this process's job.
 *
 * `askedMs` is the marketplace's own number (`retryAfterMs` above, or the
 * `retryAt` an adapter reported on a `rate_limited` outcome). `null` means it
 * named nothing, and the wait then grows with the attempt.
 *
 * A number ABOVE the ceiling returns `null` on purpose. Wildberries answered
 * 10 524 s on a base token's statistics category, and a sync that sleeps three
 * hours is a hung sync: the run ends, says when the window opens, and the
 * scheduler comes back on its own interval.
 */
export const backoffForMs = (askedMs: number | null, attempt: number): number | null => {
  if (askedMs === null) {
    return Math.min(MP_DEFAULT_BACKOFF_MS * attempt, MP_MAX_BACKOFF_MS);
  }
  return askedMs > MP_MAX_BACKOFF_MS ? null : askedMs;
};

/** `backoffForMs` over a response's own headers. The transports' entry point. */
export const backoffFrom = (headers: Headers, attempt: number): number | null =>
  backoffForMs(retryAfterMs(headers), attempt);

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
