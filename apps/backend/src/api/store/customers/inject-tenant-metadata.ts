import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { resolveTenantFromPublishableKey } from "../tenant/resolve-tenant";

/**
 * `POST /store/customers` (t-2026-10-02-shop-aware-account-emails).
 *
 * There is no customer↔tenant link (unlike an order, which owns a sales
 * channel `resolveShopForOrder` can walk back to its tenant), so
 * `customer-created.ts` has nowhere else to learn which shop a buyer signed up
 * in. This request's publishable key is the one moment that shop is known:
 * the framework's own `/store` gate has already turned it into
 * `req.publishable_key_context` by the time this runs, the same context
 * `resolveTenantFromPublishableKey` reads for every other `/store/tenant/*`
 * route.
 *
 * The resolved id is merged into `metadata.tenant_id`, next to whatever
 * locale metadata the storefront already sends (`signup` in
 * `lib/data/customer.ts`), and any `tenant_id` the client itself sent is
 * dropped first: the shop here is the SERVER's word, never the caller's.
 *
 * A keyless or tenantless request (the platform's own key, a single-store
 * install) leaves `metadata` exactly as the client sent it — nothing to
 * attach, and the welcome letter keeps today's platform identity.
 *
 * Written onto BOTH `req.body` and `req.validatedBody`: the core route
 * (`@medusajs/medusa/api/store/customers/route.js`) reads `req.validatedBody`,
 * not `req.body`, and its own `validateAndTransformBody(StoreCreateCustomer)`
 * — registered by the core package's `store/customers/middlewares.js` — runs
 * BEFORE this one. The core package's source directory is scanned before this
 * project's (`middleware-file-loader.js`), so by the time this middleware
 * runs, `req.validatedBody` already exists and is what the handler actually
 * reads; `req.body` is kept in sync too, in case a future Medusa version
 * changes that order.
 */
export const injectCustomerTenantMetadata = async (
  req: MedusaStoreRequest<{ metadata?: Record<string, unknown> }>,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  let tenantId: string | null = null;

  try {
    tenantId = (await resolveTenantFromPublishableKey(req)).id;
  } catch (error) {
    if (!(error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND)) {
      next(error);
      return;
    }
  }

  if (!tenantId) {
    next();
    return;
  }

  const mergeTenantId = (metadata: Record<string, unknown> | undefined) => {
    const { tenant_id: _dropped, ...clientMetadata } = metadata ?? {};
    return { ...clientMetadata, tenant_id: tenantId };
  };

  const body = req.body ?? {};
  req.body = { ...body, metadata: mergeTenantId(body.metadata) };

  if (req.validatedBody) {
    req.validatedBody = { ...req.validatedBody, metadata: mergeTenantId(req.validatedBody.metadata) };
  }

  next();
};
