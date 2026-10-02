import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { injectCustomerTenantMetadata } from "../inject-tenant-metadata";

/**
 * t-2026-10-02-shop-aware-account-emails: `POST /store/customers` is the one
 * request that ever learns which shop a buyer signed up in, so this writes
 * the SERVER's own answer into `metadata.tenant_id` before the core route
 * validates the body — merged with whatever locale metadata the storefront
 * already sends, and never the client's own `tenant_id`, if it sent one.
 */

const buildRequest = (opts: {
  body?: Record<string, unknown>;
  channelIds?: string[];
  channels?: Array<{ id: string; tenant?: { id?: string } | null }>;
}) => {
  const graph = jest.fn(async ({ entity, filters }: { entity: string; filters: { id: string[] } }) => {
    if (entity === "sales_channel") {
      return { data: (opts.channels ?? []).filter((channel) => filters.id.includes(channel.id)) };
    }
    throw new Error(`unexpected query.graph entity ${entity}`);
  });

  const req = {
    body: opts.body,
    publishable_key_context: { sales_channel_ids: opts.channelIds ?? [] },
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaStoreRequest;

  return { req, graph };
};

const run = async (req: MedusaStoreRequest) => {
  const next = jest.fn() as unknown as MedusaNextFunction;
  await injectCustomerTenantMetadata(req, {} as MedusaResponse, next);
  return next;
};

describe("injectCustomerTenantMetadata", () => {
  it("merges the resolved tenant into metadata, keeping the client's own locale", async () => {
    const { req } = buildRequest({
      body: { email: "buyer@example.com", metadata: { locale: "ru" } },
      channelIds: ["sc_1"],
      channels: [{ id: "sc_1", tenant: { id: "ten_1" } }],
    });

    const next = await run(req);

    expect(req.body).toEqual({
      email: "buyer@example.com",
      metadata: { locale: "ru", tenant_id: "ten_1" },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("drops a client-supplied tenant_id in favour of the server's own", async () => {
    const { req } = buildRequest({
      body: { metadata: { tenant_id: "ten_attacker" } },
      channelIds: ["sc_1"],
      channels: [{ id: "sc_1", tenant: { id: "ten_1" } }],
    });

    await run(req);

    expect((req.body as { metadata: Record<string, unknown> }).metadata).toEqual({ tenant_id: "ten_1" });
  });

  it("leaves the body untouched for a keyless or tenantless request", async () => {
    const { req } = buildRequest({ body: { metadata: { locale: "en" } }, channelIds: [] });
    const originalBody = req.body;

    const next = await run(req);

    expect(req.body).toBe(originalBody);
    expect(next).toHaveBeenCalledWith();
  });

  it("leaves the body untouched when the channel belongs to no tenant", async () => {
    const { req } = buildRequest({
      body: { metadata: { locale: "en" } },
      channelIds: ["sc_1"],
      channels: [{ id: "sc_1", tenant: null }],
    });
    const originalBody = req.body;

    await run(req);

    expect(req.body).toBe(originalBody);
  });

  it("writes metadata even when the request carries no body of its own", async () => {
    const { req } = buildRequest({
      channelIds: ["sc_1"],
      channels: [{ id: "sc_1", tenant: { id: "ten_1" } }],
    });

    await run(req);

    expect(req.body).toEqual({ metadata: { tenant_id: "ten_1" } });
  });
});
