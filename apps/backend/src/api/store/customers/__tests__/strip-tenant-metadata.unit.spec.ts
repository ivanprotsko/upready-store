import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { stripCustomerTenantMetadata } from "../strip-tenant-metadata";

/**
 * The lead's security review of t-2026-10-02-shop-aware-account-emails:
 * `metadata.tenant_id` decides where a customer's password-reset link
 * points, so `POST /store/customers/me` (the buyer's own "update my
 * profile" call) must never be able to set it.
 */

type Body = { metadata?: Record<string, unknown> };

const run = (req: MedusaRequest<Body>) => {
  const next = jest.fn() as unknown as MedusaNextFunction;
  stripCustomerTenantMetadata(req, {} as MedusaResponse, next);
  return next;
};

describe("stripCustomerTenantMetadata", () => {
  it("drops a client-supplied tenant_id from req.body, keeping the rest of metadata", () => {
    const req = {
      body: { metadata: { tenant_id: "ten_attacker", locale: "ru" } },
    } as unknown as MedusaRequest<Body>;

    const next = run(req);

    expect(req.body).toEqual({ metadata: { locale: "ru" } });
    expect(next).toHaveBeenCalledWith();
  });

  it("drops a client-supplied tenant_id from req.validatedBody too", () => {
    const req = {
      body: { metadata: { tenant_id: "ten_attacker" } },
      validatedBody: { metadata: { tenant_id: "ten_attacker", first_name: "Oksana" } },
    } as unknown as MedusaRequest<Body>;

    run(req);

    expect(req.validatedBody).toEqual({ metadata: { first_name: "Oksana" } });
  });

  it("leaves a request with no tenant_id untouched", () => {
    const req = { body: { metadata: { locale: "en" } } } as unknown as MedusaRequest<Body>;
    const originalBody = req.body;

    const next = run(req);

    expect(req.body).toBe(originalBody);
    expect(next).toHaveBeenCalledWith();
  });

  it("leaves a request with no metadata at all untouched", () => {
    const req = { body: { first_name: "Oksana" } } as unknown as MedusaRequest<Body>;
    const originalBody = req.body;

    run(req);

    expect(req.body).toBe(originalBody);
  });
});
