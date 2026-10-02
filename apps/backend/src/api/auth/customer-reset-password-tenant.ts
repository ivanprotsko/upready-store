import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { resolveTenantFromPublishableKeyHeader } from "../store/tenant/resolve-tenant";

/**
 * `POST /auth/customer/emailpass/reset-password` (t-2026-10-02-shop-aware-account-emails).
 *
 * `password-reset-email.ts` is the only place that ever turns this request
 * into a letter, and the `auth.password_reset` event it reads carries nothing
 * shop-shaped beyond whatever this call passes as `metadata`
 * (`generateResetPasswordTokenWorkflow` forwards it untouched onto the event,
 * `@medusajs/medusa/api/auth/[actor_type]/[auth_provider]/reset-password`).
 * This request is not under `/store`, so the framework's own publishable-key
 * gate never runs for it and `req.publishable_key_context` stays empty
 * (`login-method-gate.ts` hit the same wall first); the raw header is read by
 * hand instead.
 *
 * The resolved tenant id is merged into `metadata.tenant_id`, next to the
 * locale metadata the storefront already sends (`requestPasswordReset` in
 * `lib/data/customer.ts`), and any `tenant_id` the client sent is dropped
 * first: the shop here is the SERVER's word, never the caller's.
 *
 * A keyless or tenantless request (the platform's own key, a single-store
 * install) leaves `metadata` exactly as the client sent it — nothing to
 * attach, and the reset letter keeps today's platform identity.
 */
export const injectTenantIntoPasswordResetMetadata = async (
  req: MedusaRequest<{ metadata?: Record<string, unknown> }>,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const tenant = await resolveTenantFromPublishableKeyHeader(req);

  if (!tenant) {
    next();
    return;
  }

  const body = (req.body ?? {}) as { metadata?: Record<string, unknown> };
  const { tenant_id: _dropped, ...clientMetadata } = body.metadata ?? {};
  req.body = { ...body, metadata: { ...clientMetadata, tenant_id: tenant.id } };
  next();
};
