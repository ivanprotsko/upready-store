import {
  allowedReturnUrl,
  issueSsoCode,
  parseReturnHosts,
  redeemSsoCode,
  SSO_CODE_TTL_SECONDS,
  type SsoCodeStore,
  type SsoGrant,
  type SsoLock,
} from "../school-sso";

/**
 * t-2026-10-08-36, part B: the code the school trades for the buyer's token.
 * Single use, 60 seconds, bound to the shop it was minted in, and minted only
 * for an address on a host `SCHOOL_SSO_RETURN_HOSTS` lists.
 */

const memoryStore = () => {
  const rows = new Map<string, { data: unknown; ttl?: number }>();
  const store: SsoCodeStore = {
    get: async <T>(key: string) => (rows.has(key) ? (rows.get(key)!.data as T) : null),
    set: async (key, data, ttl) => {
      rows.set(key, { data, ttl });
    },
    invalidate: async (key) => {
      rows.delete(key);
    },
  };
  return { store, rows };
};

/** One job per key at a time, like the locking module. */
const serialLock = (): SsoLock => {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, job: () => Promise<T>) => {
    const run = (tails.get(key) ?? Promise.resolve()).then(job);
    tails.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  };
};

const grant: SsoGrant = {
  customer_id: "cus_1",
  auth_identity_id: "authid_1",
  auth_provider: "yandex",
  tenant_id: "ten_olavka",
};

describe("school sign-in code", () => {
  it("is redeemed once, by the shop it was minted in", async () => {
    const { store } = memoryStore();
    const lock = serialLock();
    const code = await issueSsoCode(store, grant);

    expect(await redeemSsoCode(store, lock, code, "ten_olavka")).toEqual(grant);
    expect(await redeemSsoCode(store, lock, code, "ten_olavka")).toBeNull();
  });

  it("gives the grant to one of two exchanges racing for it", async () => {
    const { store } = memoryStore();
    const lock = serialLock();
    const code = await issueSsoCode(store, grant);

    const results = await Promise.all([
      redeemSsoCode(store, lock, code, "ten_olavka"),
      redeemSsoCode(store, lock, code, "ten_olavka"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("lives 60 seconds, in the cache's ttl and in its own clock", async () => {
    const { store, rows } = memoryStore();
    const lock = serialLock();
    const t0 = 1_760_000_000_000;

    const early = await issueSsoCode(store, grant, () => t0);
    const late = await issueSsoCode(store, grant, () => t0);

    expect(SSO_CODE_TTL_SECONDS).toBe(60);
    expect([...rows.values()].map((row) => row.ttl)).toEqual([60, 60]);

    expect(await redeemSsoCode(store, lock, early, "ten_olavka", () => t0 + 59_999)).toEqual(grant);
    expect(await redeemSsoCode(store, lock, late, "ten_olavka", () => t0 + 60_000)).toBeNull();
  });

  it("refuses a code another shop's key presents, and burns it", async () => {
    const { store } = memoryStore();
    const lock = serialLock();
    const code = await issueSsoCode(store, grant);

    expect(await redeemSsoCode(store, lock, code, "ten_other")).toBeNull();
    expect(await redeemSsoCode(store, lock, code, "ten_olavka")).toBeNull();
  });

  it("refuses a code it never issued", async () => {
    const { store } = memoryStore();

    expect(await redeemSsoCode(store, serialLock(), "made-up", "ten_olavka")).toBeNull();
  });

  it("stores the code's hash, never the code itself", async () => {
    const { store, rows } = memoryStore();
    const code = await issueSsoCode(store, grant);

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...rows.keys()].some((key) => key.includes(code))).toBe(false);
  });
});

describe("school sign-in return address", () => {
  const hosts = parseReturnHosts(" school.cherkashina.ru, Localhost:5173 ,,");

  it("reads the comma-separated list", () => {
    expect(hosts).toEqual(["school.cherkashina.ru", "localhost:5173"]);
    expect(parseReturnHosts(undefined)).toEqual([]);
  });

  it("allows an https address on a listed host", () => {
    expect(
      allowedReturnUrl("https://school.cherkashina.ru/auth/callback?next=%2Fcourses", hosts)?.pathname,
    ).toBe("/auth/callback");
    expect(allowedReturnUrl("https://SCHOOL.cherkashina.ru/auth/callback", hosts)).not.toBeNull();
    expect(allowedReturnUrl("http://localhost:5173/auth/callback", hosts)).not.toBeNull();
  });

  it.each([
    ["a host outside the list", "https://evil.example/auth/callback"],
    ["a listed host as a prefix", "https://school.cherkashina.ru.evil.example/auth/callback"],
    ["a sub-domain of a listed host", "https://x.school.cherkashina.ru/auth/callback"],
    ["plain http off localhost", "http://school.cherkashina.ru/auth/callback"],
    ["a user name in front of the host", "https://evil@school.cherkashina.ru/auth/callback"],
    ["another port of a listed host", "https://school.cherkashina.ru:8443/auth/callback"],
    ["a script address", "javascript:alert(1)//school.cherkashina.ru"],
    ["a relative path", "/auth/callback"],
  ])("refuses %s", (_label, returnTo) => {
    expect(allowedReturnUrl(returnTo, hosts)).toBeNull();
  });

  it("refuses everything when the list is empty", () => {
    expect(allowedReturnUrl("https://school.cherkashina.ru/auth/callback", [])).toBeNull();
  });
});
