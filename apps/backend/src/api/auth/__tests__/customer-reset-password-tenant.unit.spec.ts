import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { injectTenantIntoPasswordResetMetadata } from "../customer-reset-password-tenant";

/**
 * t-2026-10-02-shop-aware-account-emails: `POST /auth/customer/emailpass/reset-password`
 * is not under `/store`, so the only way to learn which shop asked is the raw
 * publishable-key header. The resolved tenant id rides to `password-reset-email.ts`
 * on `metadata.tenant_id`, next to the client's own locale.
 */

const buildRequest = (opts: {
  body?: Record<string, unknown>;
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
    body: opts.body,
    get: (name: string) => (name === "x-publishable-api-key" ? opts.header : undefined),
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaRequest<{ metadata?: Record<string, unknown> }>;

  return { req };
};

const run = async (req: MedusaRequest<{ metadata?: Record<string, unknown> }>) => {
  const next = jest.fn() as unknown as MedusaNextFunction;
  await injectTenantIntoPasswordResetMetadata(req, {} as MedusaResponse, next);
  return next;
};

describe("injectTenantIntoPasswordResetMetadata", () => {
  it("merges the resolved tenant into metadata, keeping the client's own locale", async () => {
    const { req } = buildRequest({
      body: { identifier: "buyer@example.com", metadata: { locale: "ru" } },
      header: "pk_shop1",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: { id: "ten_1" } }],
    });

    const next = await run(req);

    expect(req.body).toEqual({
      identifier: "buyer@example.com",
      metadata: { locale: "ru", tenant_id: "ten_1" },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("drops a client-supplied tenant_id in favour of the server's own", async () => {
    const { req } = buildRequest({
      body: { metadata: { tenant_id: "ten_attacker" } },
      header: "pk_shop1",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: { id: "ten_1" } }],
    });

    await run(req);

    expect(req.body?.metadata).toEqual({ tenant_id: "ten_1" });
  });

  it("leaves the body untouched with no publishable-key header", async () => {
    const { req } = buildRequest({ body: { metadata: { locale: "en" } } });
    const originalBody = req.body;

    const next = await run(req);

    expect(req.body).toBe(originalBody);
    expect(next).toHaveBeenCalledWith();
  });

  it("leaves the body untouched for the platform's own key (no tenant behind it)", async () => {
    const { req } = buildRequest({
      body: { metadata: { locale: "en" } },
      header: "pk_platform",
      apiKeys: [{ id: "key_1", sales_channels_link: [{ sales_channel_id: "sc_1" }] }],
      channels: [{ id: "sc_1", tenant: null }],
    });
    const originalBody = req.body;

    await run(req);

    expect(req.body).toBe(originalBody);
  });
});
