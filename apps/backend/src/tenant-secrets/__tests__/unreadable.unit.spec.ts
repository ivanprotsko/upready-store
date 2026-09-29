import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { deriveKey, encryptJson, ENCRYPTION_KEY_ENV } from "../crypto";
import { readRobokassaSecret } from "../robokassa";
import { forgetTenantSecretSlot, tryReadTenantSecret } from "../unreadable";

/**
 * 46df D1: a `tenant_integration_secret` row encrypted under another
 * `INTEGRATION_ENCRYPTION_KEY` (every stand made from the live snapshot) made
 * the panel's reads throw. These tests encrypt a row with one key, read it
 * under another, and use the real reader, so the failure is the one the stand
 * showed and not a stand-in.
 */

type Row = {
  id: string;
  tenant_id: string;
  provider: string;
  payload: string;
  is_test: boolean;
  is_enabled: boolean;
  deleted_at: Date | null;
};

/** The one query shape the readers use: `where(object).whereNull(column).first()`. */
const fakePg = (rows: Row[]) =>
  ((table: string) => {
    expect(table).toBe("tenant_integration_secret");
    let found = rows;
    const chain = {
      select: () => chain,
      where: (filter: Record<string, unknown>) => {
        found = found.filter((row) =>
          Object.entries(filter).every(([key, value]) => row[key as keyof Row] === value),
        );
        return chain;
      },
      whereNull: (column: keyof Row) => {
        found = found.filter((row) => row[column] === null);
        return chain;
      },
      first: async () => found[0],
    };
    return chain;
  }) as unknown as Knex;

const credentials = {
  merchant_login: "DEMO",
  password1: "live-one",
  password2: "live-two",
  test_password1: "test-one",
  test_password2: "test-two",
  hash_algorithm: "sha256",
};

const rowUnder = (passphrase: string, over: Partial<Row> = {}): Row => ({
  id: "tis_46df_robokassa",
  tenant_id: "ten_46df",
  provider: "robokassa",
  payload: encryptJson(credentials, deriveKey(passphrase)),
  is_test: true,
  is_enabled: true,
  deleted_at: null,
  ...over,
});

const previousKey = process.env[ENCRYPTION_KEY_ENV];

beforeEach(() => {
  process.env[ENCRYPTION_KEY_ENV] = "stand-key";
});

afterAll(() => {
  if (previousKey === undefined) {
    delete process.env[ENCRYPTION_KEY_ENV];
  } else {
    process.env[ENCRYPTION_KEY_ENV] = previousKey;
  }
});

describe("tryReadTenantSecret", () => {
  it("turns a row encrypted under another key into `unreadable`, with one warning and no payload in it", async () => {
    const row = rowUnder("live-key", { is_test: false, is_enabled: false });
    const pg = fakePg([row]);
    const warn = jest.fn();

    // The reader on its own is exactly what took the panel down.
    await expect(readRobokassaSecret(pg, "ten_46df", { includeDisabled: true })).rejects.toThrow();

    const tried = await tryReadTenantSecret(
      pg,
      "ten_46df",
      "robokassa",
      () => readRobokassaSecret(pg, "ten_46df", { includeDisabled: true }),
      { warn },
    );

    expect(tried).toEqual({
      secret: null,
      unreadable: { id: row.id, provider: "robokassa", is_test: false, is_enabled: false },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain(row.id);
    expect(message).not.toContain(row.payload);
    expect(message).not.toContain("live-two");
  });

  it("passes a readable row through untouched", async () => {
    const pg = fakePg([rowUnder("stand-key")]);

    const tried = await tryReadTenantSecret(pg, "ten_46df", "robokassa", () =>
      readRobokassaSecret(pg, "ten_46df", { includeDisabled: true }),
    );

    expect(tried.unreadable).toBeNull();
    expect(tried.secret?.credentials.test_password2).toBe("test-two");
  });

  it("answers an absent row with nothing, not with `unreadable`", async () => {
    const pg = fakePg([rowUnder("live-key", { deleted_at: new Date() })]);

    const tried = await tryReadTenantSecret(pg, "ten_46df", "robokassa", () =>
      readRobokassaSecret(pg, "ten_46df", { includeDisabled: true }),
    );

    expect(tried).toEqual({ secret: null, unreadable: null });
  });

  it("rethrows a failure that is not the payload: the row decrypts, so something else broke", async () => {
    const pg = fakePg([rowUnder("stand-key")]);
    const outage = new Error("connection terminated");

    await expect(
      tryReadTenantSecret(pg, "ten_46df", "robokassa", async () => {
        throw outage;
      }),
    ).rejects.toBe(outage);
  });

  it("stays loud when the deployment has no key at all", async () => {
    delete process.env[ENCRYPTION_KEY_ENV];
    const pg = fakePg([rowUnder("live-key")]);

    await expect(
      tryReadTenantSecret(pg, "ten_46df", "robokassa", () =>
        readRobokassaSecret(pg, "ten_46df", { includeDisabled: true }),
      ),
    ).rejects.toThrow(ENCRYPTION_KEY_ENV);
  });
});

describe("forgetTenantSecretSlot", () => {
  it("soft-deletes an unreadable row by id without decrypting it", async () => {
    const row = rowUnder("live-key");
    const store = { softDeleteTenantIntegrationSecrets: jest.fn(async () => undefined) };

    const removed = await forgetTenantSecretSlot(fakePg([row]), store, "ten_46df", "robokassa");

    expect(removed).toEqual({ id: row.id, deleted: true });
    expect(store.softDeleteTenantIntegrationSecrets).toHaveBeenCalledWith([row.id]);
  });

  it("reports nothing deleted when the shop has no row", async () => {
    const store = { softDeleteTenantIntegrationSecrets: jest.fn(async () => undefined) };

    const removed = await forgetTenantSecretSlot(fakePg([]), store, "ten_46df", "robokassa");

    expect(removed).toEqual({ id: null, deleted: false });
    expect(store.softDeleteTenantIntegrationSecrets).not.toHaveBeenCalled();
  });
});
