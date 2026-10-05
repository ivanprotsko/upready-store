import type { MedusaRequest, MedusaStoreRequest } from "@medusajs/framework/http";
import { listGroupTenantIds, resolveTenantFromPublishableKeyHeader } from "../resolve-tenant";

/**
 * t-2026-10-02-shop-aware-account-emails: `/auth/customer/*` sits outside the
 * framework's own `/store` publishable-key gate (`req.publishable_key_context`
 * is never populated there), so this is the one resolver that reads the raw
 * header by hand — used both by the reset-password tenant injector and,
 * through `login-method-gate.ts`, by the buyer login-method gate.
 */

const buildRequest = (opts: {
  header?: string;
  apiKeys?: Array<{ id: string; sales_channels_link?: Array<{ sales_channel_id?: string }> }>;
  channels?: Array<{ id: string; tenant?: { id?: string; metadata?: Record<string, unknown> | null } | null }>;
}) => {
  const graph = jest.fn(async ({ entity, filters }: { entity: string; filters: { id: string[] } }) => {
    if (entity === "api_key") {
      return { data: opts.apiKeys ?? [] };
    }
    if (entity === "sales_channel") {
      return { data: (opts.channels ?? []).filter((channel) => filters.id.includes(channel.id)) };
    }
    throw new Error(`unexpected query.graph entity ${entity}`);
  });

  const req = {
    get: (name: string) => (name === "x-publishable-api-key" ? opts.header : undefined),
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaRequest;

  return { req, graph };
};

describe("resolveTenantFromPublishableKeyHeader", () => {
  it("resolves the tenant and its metadata behind a known key", async () => {
    const { req } = buildRequest({
      header: "pk_shop1",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: { id: "ten_1", metadata: { buyer_login_method: "email" } } }],
    });

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toEqual({
      id: "ten_1",
      metadata: { buyer_login_method: "email" },
    });
  });

  it("is null with no publishable-key header at all", async () => {
    const { req, graph } = buildRequest({});

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toBeNull();
    expect(graph).not.toHaveBeenCalled();
  });

  it("is null when the key is unknown", async () => {
    const { req } = buildRequest({ header: "pk_unknown", apiKeys: [] });

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toBeNull();
  });

  it("is null when the key owns no sales channel", async () => {
    const { req } = buildRequest({ header: "pk_shop1", apiKeys: [{ id: "key_1", sales_channels_link: [] }] });

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toBeNull();
  });

  it("is null when the channel belongs to no tenant — the platform's own key", async () => {
    const { req } = buildRequest({
      header: "pk_platform",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: null }],
    });

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toBeNull();
  });

  it("carries a null metadata through rather than throwing when the tenant has none", async () => {
    const { req } = buildRequest({
      header: "pk_shop1",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: { id: "ten_1", metadata: null } }],
    });

    await expect(resolveTenantFromPublishableKeyHeader(req)).resolves.toEqual({ id: "ten_1", metadata: null });
  });
});

/**
 * pass 3b N13: the tenants a storefront reads shared catalogue records for.
 * The route-level cases live in `product-categories/__tests__/route.unit.spec.ts`.
 */
describe("listGroupTenantIds", () => {
  type Row = { id: string; group?: { id: string } | null; metadata?: Record<string, unknown> | null };

  const buildStoreRequest = (tenants: Row[]) => {
    const graph = jest.fn(async ({ filters }: { entity: string; filters: { id?: string[]; group_id?: string[] } }) => ({
      data: tenants.filter((tenant) =>
        filters.id ? filters.id.includes(tenant.id) : (filters.group_id ?? []).includes(tenant.group?.id ?? ""),
      ),
    }));

    return { req: { scope: { resolve: () => ({ graph }) } } as unknown as MedusaStoreRequest, graph };
  };

  it("is the tenant alone, in one read, when it belongs to no group", async () => {
    const { req, graph } = buildStoreRequest([{ id: "ten_1", group: null }, { id: "ten_2", group: { id: "tgrp_1" } }]);

    await expect(listGroupTenantIds(req, "ten_1")).resolves.toEqual(["ten_1"]);
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it("puts the tenant first, then the live sites of its group", async () => {
    const { req } = buildStoreRequest([
      { id: "ten_owner", group: { id: "tgrp_1" } },
      { id: "ten_closed", group: { id: "tgrp_1" }, metadata: { archived_at: "2026-10-01T00:00:00.000Z" } },
      { id: "ten_sister", group: { id: "tgrp_1" } },
      { id: "ten_elsewhere", group: { id: "tgrp_2" } },
    ]);

    await expect(listGroupTenantIds(req, "ten_sister")).resolves.toEqual(["ten_sister", "ten_owner"]);
  });

  it("is the tenant alone when its own row cannot be read", async () => {
    const { req } = buildStoreRequest([]);

    await expect(listGroupTenantIds(req, "ten_gone")).resolves.toEqual(["ten_gone"]);
  });
});
