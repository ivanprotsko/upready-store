/**
 * The shop, read over its own HTTP API and never over its database.
 *
 * Two surfaces, both GET only:
 *
 *   - the Store API (`/store/*`), public, with the publishable key that
 *     `GET /storefront/by-host` hands every storefront;
 *   - the shop panel API (`/tenants/*`), scoped to one shop by the login's
 *     token. Only the login itself is a POST, and it writes nothing.
 *
 * Any other method or path is refused here, before a request leaves, so a
 * tool cannot change the shop even by mistake. The one write of stage 3, a
 * changeset, has its own client (`changesets.ts`) and only borrows the login.
 */
import type { Config } from "../config.ts";

export type FetchFn = typeof fetch;
/** A list value is sent as the parameter repeated, the way Medusa reads `?product_id=a&product_id=b`. */
export type Query = Record<string, string | number | string[] | undefined>;

export interface ShopApi {
  /** `GET /store/...` with the shop's publishable key and locale. */
  store(path: string, query?: Query): Promise<unknown>;
  /** `GET /tenants/...` as the shop login from the environment. */
  owner(path: string, query?: Query): Promise<unknown>;
  /** The region whose countries hold `SHOP_COUNTRY`, for prices. */
  regionId(): Promise<string | null>;
}

export class ShopApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function buildUrl(base: string, path: string, query: Query = {}): string {
  const url = new URL(path, `${base}/`);
  for (const [key, raw] of Object.entries(query)) {
    if (Array.isArray(raw)) for (const item of raw) url.searchParams.append(key, item);
    else if (raw !== undefined && raw !== "") url.searchParams.set(key, String(raw));
  }
  return url.toString();
}

interface Fetchers {
  /** Store API and `/storefront/by-host`. */
  store: FetchFn;
  /** `/auth/tenant/emailpass` and `/tenants/*`. */
  owner: FetchFn;
}

export class HttpShopApi implements ShopApi {
  readonly #shop: Config["shop"];
  readonly #fetch: Fetchers;
  #publishableKey: Promise<string> | null = null;
  #region: Promise<string | null> | null = null;
  #token: string | null = null;

  constructor(shop: Config["shop"], fetchers: Fetchers) {
    this.#shop = shop;
    this.#fetch = fetchers;
  }

  async store(path: string, query: Query = {}): Promise<unknown> {
    if (!path.startsWith("/store/")) throw new Error(`Not a Store API path: ${path}`);
    const key = await this.#key();
    return this.#getJson(this.#fetch.store, buildUrl(this.#shop.apiUrl, path, query), {
      "x-publishable-api-key": key,
      "x-medusa-locale": this.#shop.locale,
    });
  }

  async owner(path: string, query: Query = {}): Promise<unknown> {
    if (!path.startsWith("/tenants/")) throw new Error(`Not a shop panel API path: ${path}`);
    const url = buildUrl(this.#shop.apiUrl, path, query);
    try {
      return await this.#getJson(this.#fetch.owner, url, { authorization: `Bearer ${await this.#login()}` });
    } catch (err) {
      // A token outlives nothing on a redeploy: log in again once, then give up.
      if (!(err instanceof ShopApiError) || err.status !== 401) throw err;
      this.#token = null;
      return this.#getJson(this.#fetch.owner, url, { authorization: `Bearer ${await this.#login()}` });
    }
  }

  /**
   * The login's token, for the changeset client and nothing else. `fresh`
   * drops the cached one first, after a 401.
   */
  bearer(fresh = false): Promise<string> {
    if (fresh) this.#token = null;
    return this.#login();
  }

  regionId(): Promise<string | null> {
    this.#region ??= this.#findRegion().catch((err: unknown) => {
      this.#region = null;
      throw err;
    });
    return this.#region;
  }

  async #findRegion(): Promise<string | null> {
    const body = (await this.store("/store/regions", { limit: 500, fields: "id,*countries" })) as {
      regions?: { id: string; countries?: { iso_2?: string }[] }[];
    };
    const country = this.#shop.country;
    const region = body.regions?.find((r) => r.countries?.some((c) => c.iso_2 === country));
    return region?.id ?? body.regions?.[0]?.id ?? null;
  }

  #key(): Promise<string> {
    this.#publishableKey ??= (async () => {
      const url = buildUrl(this.#shop.apiUrl, "/storefront/by-host", { host: this.#shop.host });
      const body = (await this.#getJson(this.#fetch.store, url, {})) as { publishable_key?: string };
      if (!body.publishable_key) throw new ShopApiError(`No shop answers on ${this.#shop.host}`, 404);
      return body.publishable_key;
    })().catch((err: unknown) => {
      this.#publishableKey = null;
      throw err;
    });
    return this.#publishableKey;
  }

  async #login(): Promise<string> {
    if (this.#token) return this.#token;
    const login = this.#shop.login;
    if (!login) throw new ShopApiError("SHOP_LOGIN_EMAIL and SHOP_LOGIN_PASSWORD are not set", 401);
    const res = await this.#fetch.owner(buildUrl(this.#shop.apiUrl, "/auth/tenant/emailpass"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(login),
    });
    if (!res.ok) throw new ShopApiError(`Shop login failed (${res.status})`, res.status);
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new ShopApiError("Shop login answered without a token", 502);
    this.#token = body.token;
    return body.token;
  }

  async #getJson(fetchFn: FetchFn, url: string, headers: Record<string, string>): Promise<unknown> {
    const res = await fetchFn(url, { method: "GET", headers: { accept: "application/json", ...headers } });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ShopApiError(`GET ${new URL(url).pathname} answered ${res.status}: ${detail.slice(0, 160)}`, res.status);
    }
    return res.json();
  }
}
