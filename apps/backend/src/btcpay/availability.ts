/**
 * Whether this deployment may take cryptocurrency at all
 * (ask-20261005-070255-438f, the lead's review of PR #272).
 *
 * One codebase serves both instances, and nothing at runtime says which one a
 * process is. On the RU instance accepting cryptocurrency for goods is
 * forbidden (282-FZ Art. 1 part 6, `docs/instances/RULES.md` §2), so BTCPay
 * must not exist there: no panel card, no checkout method, no webhook that
 * pays an order. x402 (t-2026-10-03-33) obeys the same switch everywhere: its
 * panel card, checkout method, session middleware and agent purchase route. The switch is the environment's: `PAYMENTS_CRYPTO_AVAILABLE`
 * turns BTCPay on only when it is exactly `true`, and an instance that never
 * sets it never offers it. `deploy/instances/ru.json` forbids the variable, so
 * `instance-check.mjs` fails a RU deploy that sets it to anything.
 *
 * Read on every call rather than once at boot, so a test can flip it around a
 * request the way the HTTP suite does.
 */
export const CRYPTO_PAYMENTS_FLAG = "PAYMENTS_CRYPTO_AVAILABLE";

export const cryptoPaymentsAvailable = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env[CRYPTO_PAYMENTS_FLAG] === "true";

/** The sentence every refusal gives, so the panel, the log and the webhook say the same thing. */
export const CRYPTO_PAYMENTS_UNAVAILABLE_REASON =
  "Cryptocurrency payments are not available on this instance (PAYMENTS_CRYPTO_AVAILABLE is not true).";
