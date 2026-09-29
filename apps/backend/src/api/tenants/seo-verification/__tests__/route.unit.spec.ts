import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * A-18 (46df audit): saving the SEO verification tags never told the
 * storefront its cache was stale — `tenants/home/route.ts` already sends
 * `notifyStorefrontRevalidate` for the same `tenant.home` clearing (theme,
 * composition), this route never did, for no reason the audit could find.
 *
 * Whether that clearing actually reaches `getSeoVerification()` before its
 * own 60s in-memory host cache (`lib/tenant/resolve.ts` on the storefront)
 * expires is a separate, bigger question this task does not answer — see the
 * report. This test proves only the acceptance asked for: the call happens,
 * naming this tenant, after the write lands.
 */

jest.mock("../../../../storefront-revalidate", () => ({
  notifyStorefrontRevalidate: jest.fn().mockResolvedValue(200),
}));

const { notifyStorefrontRevalidate } = jest.requireMock(
  "../../../../storefront-revalidate",
) as { notifyStorefrontRevalidate: jest.Mock };

jest.mock("../../tenant-scope", () => ({
  getTenantScope: jest.fn().mockResolvedValue({
    id: "tenant_1",
    name: "Acme",
    handle: "acme",
    sales_channel_id: null,
  }),
}));

import { PUT } from "../route";

const fakeReq = (body: Record<string, unknown>, tenantModuleService: unknown) =>
  ({
    scope: { resolve: () => tenantModuleService },
    validatedBody: body,
  }) as unknown as AuthenticatedMedusaRequest<Record<string, unknown>>;

const fakeRes = () => {
  const res = { json: jest.fn() };
  return res as unknown as MedusaResponse & { json: jest.Mock };
};

describe("PUT /tenants/seo-verification", () => {
  beforeEach(() => {
    notifyStorefrontRevalidate.mockClear();
  });

  it("notifies the storefront to revalidate this tenant after the write lands", async () => {
    const tenantModuleService = {
      retrieveTenant: jest.fn().mockResolvedValue({
        id: "tenant_1",
        handle: "acme",
        metadata: {},
      }),
      updateTenants: jest.fn().mockResolvedValue({
        id: "tenant_1",
        handle: "acme",
        metadata: { seo_verification: { yandex: "abc123", google: null } },
      }),
    };

    const req = fakeReq({ yandex: "abc123" }, tenantModuleService);
    const res = fakeRes();

    await PUT(req, res);

    expect(tenantModuleService.updateTenants).toHaveBeenCalledTimes(1);
    expect(notifyStorefrontRevalidate).toHaveBeenCalledTimes(1);
    expect(notifyStorefrontRevalidate).toHaveBeenCalledWith({
      type: "tenant.home",
      handle: "acme",
    });
    // The write itself answers first — the revalidation call names the tenant
    // the write actually landed on, not a value read before it.
    const [writeOrder] = tenantModuleService.updateTenants.mock.invocationCallOrder;
    const [notifyOrder] = notifyStorefrontRevalidate.mock.invocationCallOrder;
    expect(notifyOrder).toBeGreaterThan(writeOrder);
  });

  it("still answers the saved tags even if the storefront never responds", async () => {
    notifyStorefrontRevalidate.mockResolvedValueOnce(null);

    const tenantModuleService = {
      retrieveTenant: jest.fn().mockResolvedValue({ id: "tenant_1", handle: "acme", metadata: {} }),
      updateTenants: jest.fn().mockResolvedValue({
        id: "tenant_1",
        handle: "acme",
        metadata: { seo_verification: { yandex: "abc123", google: null } },
      }),
    };

    const req = fakeReq({ yandex: "abc123" }, tenantModuleService);
    const res = fakeRes();

    await PUT(req, res);

    expect(res.json).toHaveBeenCalledWith({
      seo_verification: { yandex: "abc123", google: null },
    });
  });
});
