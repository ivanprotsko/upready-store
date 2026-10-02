import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * `POST /store/customers/me` (the lead's security review of
 * t-2026-10-02-shop-aware-account-emails).
 *
 * `metadata.tenant_id` now decides which shop's name, Reply-To and domain a
 * customer's password-reset link carries (`password-reset-email.ts` reads it
 * off the customer's own stored row). Left writable through the buyer's own
 * "update my profile" call, any customer could point their OWN future reset
 * links at a shop of their choosing — including one whose owner then reads
 * the reset token straight off their site's own analytics (Metrika/GA sees
 * the full URL), the same leak this task closes on the read side.
 *
 * So any `tenant_id` the client sends here is dropped before it reaches the
 * core route, on both `req.body` and `req.validatedBody` (the core's own
 * `validateAndTransformBody(StoreUpdateCustomer)` already ran by the time
 * this runs — the same ordering `inject-tenant-metadata.ts` documents). The
 * value set at registration is left untouched: the core customer service
 * merges `metadata` on update (`@medusajs/utils`'s `mergeMetadata`) rather
 * than replacing it, so a key this call never mentions simply survives.
 */
export const stripCustomerTenantMetadata = (
  req: MedusaRequest<{ metadata?: Record<string, unknown> }>,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const dropTenantId = (metadata: Record<string, unknown>) => {
    const { tenant_id: _dropped, ...rest } = metadata;
    return rest;
  };

  const body = req.body;
  if (body?.metadata && "tenant_id" in body.metadata) {
    req.body = { ...body, metadata: dropTenantId(body.metadata) };
  }

  if (req.validatedBody?.metadata && "tenant_id" in req.validatedBody.metadata) {
    req.validatedBody = { ...req.validatedBody, metadata: dropTenantId(req.validatedBody.metadata) };
  }

  next();
};
