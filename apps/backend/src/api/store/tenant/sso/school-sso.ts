import { createHash, randomBytes } from "node:crypto";

/**
 * One sign-in for the shop and its school (t-2026-10-08-36, part B). The shop
 * attests the buyer, the school has no login of its own:
 *
 *   1. the storefront, holding the buyer's session, asks
 *      `POST /store/tenant/sso/code` for a code bound to that buyer, this
 *      shop and a `return_to` on a host `SCHOOL_SSO_RETURN_HOSTS` lists;
 *   2. the browser carries the code to the school's `/auth/callback`;
 *   3. the school's server trades it at `POST /store/tenant/sso/exchange`,
 *      with this shop's publishable key, for the buyer's token.
 *
 * The code is the only secret in the URL, so it is single use, lives 60
 * seconds and is stored under its SHA-256 rather than as itself. Redeeming
 * burns it on the first attempt whatever the outcome, so a code another shop's
 * key tried is gone for the school too.
 *
 * Free of Medusa imports, so the unit test drives it with plain fakes.
 */

export const SSO_CODE_TTL_SECONDS = 60;

/** What a code stands for, kept until it is redeemed or expires. */
export type SsoGrant = {
  customer_id: string;
  auth_identity_id: string;
  /** The provider the buyer signed in with, for the token's `user_metadata`. */
  auth_provider: string | null;
  tenant_id: string;
};

type StoredGrant = SsoGrant & { expires_at: number };

/** The subset of Medusa's cache module (`ICacheService`) this needs. */
export type SsoCodeStore = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
};

/** Runs `job` while holding `key`, so two redeems of one code never interleave. */
export type SsoLock = <T>(key: string, job: () => Promise<T>) => Promise<T>;

/** `SCHOOL_SSO_RETURN_HOSTS`, comma separated, as lower-case hosts. */
export const parseReturnHosts = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

/**
 * `return_to` when it may receive a code, `null` otherwise. The host, with its
 * port when it is not the default one, has to be on the list. The scheme is
 * https, or http on localhost for development only, and the address carries no
 * user name or password.
 */
export const allowedReturnUrl = (returnTo: string, hosts: string[]): URL | null => {
  let url: URL;

  try {
    url = new URL(returnTo);
  } catch {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return null;
  }

  return hosts.includes(url.host.toLowerCase()) ? url : null;
};

const keyFor = (code: string): string =>
  `school-sso:code:${createHash("sha256").update(code).digest("hex")}`;

/** A new code for `grant`, stored for `SSO_CODE_TTL_SECONDS`. */
export const issueSsoCode = async (
  store: SsoCodeStore,
  grant: SsoGrant,
  now: () => number = Date.now,
): Promise<string> => {
  const code = randomBytes(32).toString("base64url");
  const stored: StoredGrant = { ...grant, expires_at: now() + SSO_CODE_TTL_SECONDS * 1000 };

  await store.set(keyFor(code), stored, SSO_CODE_TTL_SECONDS);

  return code;
};

/**
 * The grant behind `code` for the shop `tenantId`, or `null`. `null` covers an
 * unknown code, a used one, one past its 60 seconds (checked here as well as
 * by the cache's own ttl) and one issued for another shop.
 */
export const redeemSsoCode = async (
  store: SsoCodeStore,
  lock: SsoLock,
  code: string,
  tenantId: string,
  now: () => number = Date.now,
): Promise<SsoGrant | null> => {
  const key = keyFor(code);

  return lock(key, async () => {
    const stored = await store.get<StoredGrant>(key);

    if (!stored) {
      return null;
    }

    await store.invalidate(key);

    if (stored.expires_at <= now() || stored.tenant_id !== tenantId) {
      return null;
    }

    return {
      customer_id: stored.customer_id,
      auth_identity_id: stored.auth_identity_id,
      auth_provider: stored.auth_provider,
      tenant_id: stored.tenant_id,
    };
  });
};
