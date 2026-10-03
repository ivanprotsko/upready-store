import type { MedusaRequest } from "@medusajs/framework/http";
import { resolveTenantFromPublishableKeyHeader } from "../resolve-tenant";

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
