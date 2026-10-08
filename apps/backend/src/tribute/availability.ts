/**
 * Whether this deployment may offer Tribute at all (t-cherk-22, part A).
 *
 * One codebase serves both instances, and nothing at runtime says which one a
 * process is. Tribute is INTL-only (`docs/instances/RULES.md` §2,
 * `deploy/instances/ru.json` lists `tribute` under `providers.payment.forbidden`),
 * so on the RU instance it must not exist: no panel card, no checkout method,
 * no payment session. The switch is the environment's, the shape of
 * `btcpay/availability.ts`: `TRIBUTE_AVAILABLE` turns Tribute on only when it
 * is exactly `true`, and an instance that never sets it never offers it. The
 * name starts with `TRIBUTE_` on purpose: `ru.json` forbids every variable
 * with that prefix, so `instance-check.mjs` fails a RU deploy that sets it.
 *
 * Read on every call rather than once at boot, so a test can flip it around a
 * request.
 */
export const TRIBUTE_FLAG = "TRIBUTE_AVAILABLE";

export const tributeAvailable = (env: NodeJS.ProcessEnv = process.env): boolean => env[TRIBUTE_FLAG] === "true";

/** The sentence every refusal gives, so the panel and the log say the same thing. */
export const TRIBUTE_UNAVAILABLE_REASON = "Tribute is not available on this instance (TRIBUTE_AVAILABLE is not true).";
