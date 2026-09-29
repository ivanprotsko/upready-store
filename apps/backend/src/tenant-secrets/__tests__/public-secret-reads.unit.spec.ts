import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { deriveKey, encryptJson } from "../crypto";
import { readCdekSecretPublic } from "../cdek";
import { readPochtaSecretPublic } from "../pochta";

/**
 * 46df A-02: the buyer-facing CDEK and Russian Post routes read the shop's
 * secret through these wrappers, the same shape as `readRobokassaSecretPublic`.
 * A row encrypted under another `INTEGRATION_ENCRYPTION_KEY` reads as "not
 * connected" with one `warn` naming the tenant, instead of a 500.
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

const row = (provider: string, payload: string) => ({
  id: "tis_1",
  tenant_id: "ten_1",
  provider,
  payload,
  is_test: false,
  is_enabled: true,
});

describe.each([
  { name: "readCdekSecretPublic", provider: "cdek", read: readCdekSecretPublic, value: { account: "acc" } },
  { name: "readPochtaSecretPublic", provider: "pochta", read: readPochtaSecretPublic, value: { token: "tok" } },
])("$name", ({ provider, read, value }) => {
  it("a row encrypted under a DIFFERENT key: returns null, logs one warn with the tenant id and no key, never throws", async () => {
    const pg = fakePg(row(provider, encryptJson(value, deriveKey("key-A-at-write-time"))));
    const warn = jest.fn();

    const result = await withEnvKey("key-B-on-this-stand", () => read(pg, "ten_1", { warn }));

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ten_1");
    expect(warn.mock.calls[0][0]).not.toContain("key-A-at-write-time");
    expect(warn.mock.calls[0][0]).not.toContain("key-B-on-this-stand");
    expect(warn.mock.calls[0][0]).not.toContain(Object.values(value)[0]);
  });

  it("a row that decrypts: returns the secret, never calls warn", async () => {
    const pg = fakePg(row(provider, encryptJson(value, deriveKey("same-key"))));
    const warn = jest.fn();

    const result = await withEnvKey("same-key", () => read(pg, "ten_1", { warn }));

    expect(result?.tenant_id).toBe("ten_1");
    expect(warn).not.toHaveBeenCalled();
  });

  it("no row: returns null, never calls warn", async () => {
    const warn = jest.fn();

    expect(await read(fakePg(undefined), "ten_1", { warn })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
