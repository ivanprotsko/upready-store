import { buildCredentials } from "../marketplace-keys";
import type { CredentialField, MarketplaceAdapter } from "../../../modules/marketplace/contract";
import { MARKETPLACES } from "../../../modules/marketplace/registry";
import { validateAdapterShape } from "../../../modules/marketplace/guards";
import { TENANT_INTEGRATION_PROVIDERS } from "../../../modules/tenant/models/tenant-integration-secret";

/**
 * w24-integration-keys-self-service, the parts that need no database.
 *
 * The HTTP spec proves the wiring against a live engine; this file holds the
 * two things that are cheaper to check here and would otherwise be checked by
 * a reviewer: what a save does with a field the owner left empty, and whether
 * an adapter's declared slot can actually hold a row.
 */

const field = (over: Partial<CredentialField>): CredentialField => ({
  name: "api_key",
  label: "Токен",
  secret: true,
  hint: "hint",
  docUrl: "https://example.test/docs",
  ...over,
});

describe("buildCredentials", () => {
  const ozonFields = [
    field({ name: "client_id", label: "Client-Id", secret: false }),
    field({ name: "api_key", label: "Api-Key", secret: true }),
  ];

  it("keeps a stored SECRET the owner left empty", () => {
    const { credentials, missing } = buildCredentials(ozonFields, { client_id: "old", api_key: "stored-key" }, {
      client_id: "new-cabinet",
    });
    expect(missing).toEqual([]);
    expect(credentials).toEqual({ client_id: "new-cabinet", api_key: "stored-key" });
  });

  it("requires a NON-secret field every time: there is nothing to keep secret about it", () => {
    const { missing } = buildCredentials(ozonFields, { client_id: "old", api_key: "stored-key" }, {
      api_key: "fresh",
    });
    expect(missing.map((entry) => entry.name)).toEqual(["client_id"]);
  });

  it("reports a first save with nothing typed as missing, not as an empty credential", () => {
    const { credentials, missing } = buildCredentials(ozonFields, {}, {});
    expect(credentials).toEqual({});
    expect(missing.map((entry) => entry.label)).toEqual(["Client-Id", "Api-Key"]);
  });

  it("trims what was typed: a pasted key carries spaces and a newline more often than not", () => {
    const { credentials } = buildCredentials([field({})], {}, { api_key: "  token-value\n" });
    expect(credentials).toEqual({ api_key: "token-value" });
  });

  it("treats whitespace as nothing typed rather than as a value that overwrites the key", () => {
    const { credentials, missing } = buildCredentials([field({})], { api_key: "stored" }, {
      api_key: "   ",
    });
    expect(missing).toEqual([]);
    expect(credentials).toEqual({ api_key: "stored" });
  });
});

describe("every registered adapter can actually store what it declares", () => {
  it.each(MARKETPLACES.map((adapter) => [adapter.id, adapter] as const))(
    "%s declares a slot the column's CHECK constraint accepts",
    (_id, adapter) => {
      expect(TENANT_INTEGRATION_PROVIDERS).toContain(adapter.credentialSlot);
    },
  );

  it.each(MARKETPLACES.map((adapter) => [adapter.id, adapter] as const))(
    "%s fills its READ slot and never a write one",
    (_id, adapter) => {
      expect(adapter.credentialSlot).not.toMatch(/(^|_)write$/);
    },
  );

  it("declares the fields each marketplace actually authenticates with", () => {
    const names = Object.fromEntries(
      MARKETPLACES.map((adapter) => [
        adapter.id,
        adapter.credentialFields.map((entry) => entry.name),
      ]),
    );
    // WB issues one JWT carrying the whole access bitmask; Ozon needs the
    // cabinet id beside the key. These are the payload shapes
    // `tenant-secrets/wildberries.ts` and `tenant-secrets/ozon.ts` read back.
    expect(names).toEqual({ wb: ["api_key"], ozon: ["client_id", "api_key"] });
  });

  it("refuses an adapter that points its owner-facing form at a write slot", () => {
    const wb = MARKETPLACES.find((adapter) => adapter.id === "wb") as MarketplaceAdapter;
    expect(() =>
      validateAdapterShape({ ...wb, credentialSlot: "wildberries_write" }),
    ).toThrow(/WRITE/);
  });

  it("refuses an adapter with no field to type into", () => {
    const wb = MARKETPLACES.find((adapter) => adapter.id === "wb") as MarketplaceAdapter;
    expect(() => validateAdapterShape({ ...wb, credentialFields: [] })).toThrow(
      /credentialFields/,
    );
  });
});
