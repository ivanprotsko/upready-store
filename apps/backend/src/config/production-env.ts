/**
 * Fail-fast for the backend's security-relevant environment (audit 2026-09-23,
 * A-06/C-02, A-03).
 *
 * Outside production the starter defaults stay: `supersecret` secrets, CORS
 * from `.env`, a cookie without `Secure` (local stands are plain http). In
 * production a missing value used to fall back silently to a public default
 * (anyone could sign a session) or to `undefined` CORS; now the process refuses
 * to start and names every missing variable at once.
 *
 * Kept free of Medusa imports so `medusa-config.ts` and the unit test can both
 * load it.
 */

type Env = Record<string, string | undefined>;

export const REQUIRED_IN_PRODUCTION = [
  "JWT_SECRET",
  "COOKIE_SECRET",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
] as const;

export const DEV_SECRET = "supersecret";

export const isProduction = (env: Env = process.env): boolean => env.NODE_ENV === "production";

export const missingProductionEnv = (env: Env = process.env): string[] =>
  isProduction(env) ? REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim()) : [];

export const assertProductionEnv = (env: Env = process.env): void => {
  const missing = missingProductionEnv(env);

  if (missing.length > 0) {
    throw new Error(
      `Refusing to start in production without ${missing.join(", ")}: ` +
        "set them in the backend environment (see apps/backend/README.md).",
    );
  }
};

/**
 * The session cookie's `Secure` flag: always on in production unless
 * `COOKIE_SECURE=false` says otherwise explicitly, always off elsewhere.
 */
export const cookieSecure = (env: Env = process.env): boolean =>
  isProduction(env) ? env.COOKIE_SECURE !== "false" : false;
