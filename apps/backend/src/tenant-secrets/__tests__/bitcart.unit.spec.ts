import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { deriveKey, encryptJson } from "../crypto";
import {
  maskBitcartSettings,
  missingBitcartFields,
  normalizeBitcartUrl,
  readBitcartSecret,
  type ResolvedBitcartSecret,
} from "../bitcart";

/**
 * ask-20261005-070255-438f, stage 2: the shop's Bitcart store as stored. Four
 * values, one of them secret; both addresses follow BTCPay's address rules,
 * because the backend calls the API and sends buyers to the admin app.
 */

const ROW: ResolvedBitcartSecret = {
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: true,
  credentials: {
    server_url: "https://pay.example.com/api",
    admin_url: "https://pay.example.com/admin",
    store_id: "01JSTORE1",
    api_key: "bitcart-token-1234",
  },
};

describe("normalizeBitcartUrl", () => {
  const production = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  const development = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

  it("keeps an https origin with Bitcart's one-domain prefixes, without the trailing slash", () => {
    expect(normalizeBitcartUrl("https://pay.example.com/api/", production)).toBe("https://pay.example.com/api");
    expect(normalizeBitcartUrl(" https://pay.example.com/admin ", production)).toBe("https://pay.example.com/admin");
    expect(normalizeBitcartUrl("https://admin.example.com", production)).toBe("https://admin.example.com");
  });

  it("refuses plain http for a public host, and loopback or private literals in production", () => {
    expect(normalizeBitcartUrl("http://pay.example.com/api", development)).toBeNull();
    expect(normalizeBitcartUrl("http://127.0.0.1:8000", production)).toBeNull();
    expect(normalizeBitcartUrl("https://10.0.0.5/api", production)).toBeNull();
    expect(normalizeBitcartUrl("http://127.0.0.1:8000", development)).toBe("http://127.0.0.1:8000");
  });

  it("refuses credentials, a query, a fragment and garbage", () => {
    expect(normalizeBitcartUrl("https://user:pass@pay.example.com/api", production)).toBeNull();
    expect(normalizeBitcartUrl("https://pay.example.com/api?x=1", production)).toBeNull();
    expect(normalizeBitcartUrl("https://pay.example.com/admin#i", production)).toBeNull();
    expect(normalizeBitcartUrl("not a url", production)).toBeNull();
  });
});

describe("masking and completeness", () => {
  it("shows both addresses and the store, and the token only as set/last4", () => {
    const masked = maskBitcartSettings(ROW);

    expect(masked).toEqual({
      id: "tis_1",
      provider: "bitcart",
      is_enabled: true,
      server_url: "https://pay.example.com/api",
      admin_url: "https://pay.example.com/admin",
      store_id: "01JSTORE1",
      api_key: { set: true, last4: "1234" },
    });
    expect(JSON.stringify(masked)).not.toContain("bitcart-token");
  });

  it("names the fields still empty, the admin address included", () => {
    expect(missingBitcartFields(ROW.credentials)).toEqual([]);
    expect(missingBitcartFields({ ...ROW.credentials, admin_url: "", api_key: "" })).toEqual(["admin_url", "api_key"]);
  });
});

describe("readBitcartSecret", () => {
  const ENV_KEY = "INTEGRATION_ENCRYPTION_KEY";
  const previous = process.env[ENV_KEY];

  afterAll(() => {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });

  const fakePg = (row: Record<string, unknown> | undefined, seen: Record<string, unknown>[]): Knex => {
    const builder = {
      select: () => builder,
      where: (filter: Record<string, unknown>) => {
        seen.push(filter);
        return builder;
      },
      whereNull: () => builder,
      first: () => Promise.resolve(row),
    };
    return (() => builder) as unknown as Knex;
  };

  it("reads the `bitcart` slot, and a switched-off row only when asked to", async () => {
    process.env[ENV_KEY] = "unit-key";
    const payload = encryptJson(ROW.credentials, deriveKey("unit-key"));
    const seen: Record<string, unknown>[] = [];
    const pg = fakePg({ id: "tis_1", tenant_id: "ten_1", provider: "bitcart", payload, is_enabled: false }, seen);

    expect(await readBitcartSecret(pg, "ten_1")).toBeNull();
    const read = await readBitcartSecret(pg, "ten_1", { includeDisabled: true });

    expect(seen[0]).toEqual({ tenant_id: "ten_1", provider: "bitcart" });
    expect(read).toEqual({ ...ROW, is_enabled: false });
  });
});
