import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { deriveKey, encryptJson } from "../crypto";
import { readRobokassaSecretPublic } from "../robokassa";

/**
 * 46df A-02: a wrong `INTEGRATION_ENCRYPTION_KEY` (a changed platform secret, or a database
 * restored on a different one) must not take the whole storefront down — `GET
 * /storefront/by-host` and `GET /store/payment-providers` read Robokassa's secret through THIS
 * function, which turns a decrypt failure into "not connected" plus one `warn` log line, instead
 * of letting the throw reach the route (the real failure this repro: `decryptJson` calling
 * `Decipheriv.final` on a blob encrypted with a different key throws
 * "Unsupported state or unable to authenticate data").
 */

const ENV_KEY = "INTEGRATION_ENCRYPTION_KEY";

const fakePg = (row: Record<string, unknown> | undefined): Knex => {
  const builder = {
    select: () => builder,
    where: () => builder,
    whereNull: () => builder,
    first: () => Promise.resolve(row),
  };
  return (() => builder) as unknown as Knex;
};

const withEnvKey = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const previous = process.env[ENV_KEY];
  process.env[ENV_KEY] = key;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  }
};

describe("readRobokassaSecretPublic", () => {
  it("a row encrypted under a DIFFERENT key: returns null, logs exactly one warn, never throws", async () => {
    const payload = encryptJson({ merchant_login: "DEMO" }, deriveKey("key-A-at-write-time"));
    const pg = fakePg({
      id: "tis_1",
      tenant_id: "ten_1",
      payload,
      is_test: false,
      is_enabled: true,
    });
    const warn = jest.fn();

    const result = await withEnvKey("key-B-on-this-stand", () =>
      readRobokassaSecretPublic(pg, "ten_1", { warn }),
    );

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ten_1");
    expect(warn.mock.calls[0][0]).not.toContain("key-A-at-write-time");
    expect(warn.mock.calls[0][0]).not.toContain("key-B-on-this-stand");
  });

  it("a row that decrypts fine: returns the secret, never calls warn (the fix does not change the happy path)", async () => {
    const key = deriveKey("same-key");
    const payload = encryptJson(
      {
        merchant_login: "DEMO",
        password1: "p1",
        password2: "p2",
        test_password1: "t1",
        test_password2: "t2",
        hash_algorithm: "sha256",
      },
      key,
    );
    const pg = fakePg({
      id: "tis_2",
      tenant_id: "ten_2",
      payload,
      is_test: false,
      is_enabled: true,
    });
    const warn = jest.fn();

    const result = await withEnvKey("same-key", () => readRobokassaSecretPublic(pg, "ten_2", { warn }));

    expect(result?.credentials.merchant_login).toBe("DEMO");
    expect(warn).not.toHaveBeenCalled();
  });

  it("no row at all: returns null, never calls warn (same as before this fix)", async () => {
    const pg = fakePg(undefined);
    const warn = jest.fn();

    const result = await readRobokassaSecretPublic(pg, "ten_3", { warn });

    expect(result).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
