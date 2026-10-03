import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { allowsEmailLogin, allowsYandexLogin, readBuyerLoginMethod } from "./login-settings";
import { resolveTenantFromPublishableKeyHeader } from "../../store/tenant/resolve-tenant";

/**
 * Enforcement, not only UI (o25-login-methods): a shop that chose «Yandex ID
 * only» refuses email-and-password register/login/reset for ITS buyers, and a
 * shop that chose «email only» refuses `/auth/customer/yandex` for its own
 * buyers. Neither gate touches another shop, and neither ever fires for a
 * request that names no shop at all — a single-store deployment (no
 * publishable key, no `tenant` in the Yandex body) keeps today's behaviour
 * exactly, because there is no per-shop choice to enforce.
 *
 * Two different ways to learn WHICH shop, because the two flows carry it
 * differently (measured 2026-09-24):
 *
 * - `/auth/customer/emailpass*` is not behind the framework's own
 *   publishable-key gate (`_ApiLoader_applyStorePublishableKeyMiddleware`
 *   mounts only on `/store`, `@medusajs/framework/dist/http/router.js`), so
 *   `req.publishable_key_context` is never populated here. The storefront's
 *   SDK sends the key on every call regardless (`apps/storefront/src/lib/config.ts`),
 *   auth calls included, so the RAW header is read and resolved by hand.
 * - `/auth/customer/yandex` carries the shop as `body.tenant`, the handle the
 *   storefront's `/api/yandex-login` route already resolved from the Host
 *   header (`apps/storefront/src/app/api/yandex-login/route.ts`). That is the
 *   same value `YandexAuthService.authenticate` signs into the `state`
 *   (`modules/auth-yandex/services/yandex.ts`), so refusing it here means no
 *   state is ever minted for a disabled shop — the callback leg needs no gate
 *   of its own, because it can only be reached with a state this gate already
 *   let through.
 */

const resolveTenantMetadataFromPublishableKey = async (
  req: MedusaRequest,
): Promise<Record<string, unknown> | null> => {
  const tenant = await resolveTenantFromPublishableKeyHeader(req);
  return tenant?.metadata ?? null;
};

const resolveTenantMetadataFromHandle = async (
  req: MedusaRequest,
  handle: string,
): Promise<Record<string, unknown> | null> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "metadata"],
    filters: { handle: [handle] },
  });

  return (tenants[0]?.metadata as Record<string, unknown> | null) ?? null;
};

/**
 * `res.status(401)` directly, the same shape `blockArchivedTenantLogin` in
 * `archived-tenant-gate.ts` uses for a login-flow refusal: a `MedusaError`
 * thrown here would go through the framework's generic error handler instead,
 * which maps `NOT_ALLOWED` to 400 — the wrong status for "this credential is
 * refused", and inconsistent with the sibling gate this one is modelled on.
 */
const refuse = (res: MedusaResponse, message: string) => {
  res.status(401).json({ message });
};

/** `/auth/customer/emailpass`, `/register`, `/reset-password`, `/update` — every leg a buyer's own password touches. */
export const gateBuyerEmailpassAuth = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const metadata = await resolveTenantMetadataFromPublishableKey(req);
  if (!metadata) {
    next();
    return;
  }

  const method = readBuyerLoginMethod(metadata);
  if (!allowsEmailLogin(method)) {
    refuse(res, "This shop's buyers sign in with Yandex ID only; email and password are turned off.");
    return;
  }

  next();
};

/** `POST /auth/customer/yandex` — the ONE leg that mints the signed state; see the file doc comment above. */
export const gateBuyerYandexAuth = async (
  req: MedusaRequest<{ tenant?: unknown }>,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const handle = typeof req.body?.tenant === "string" ? req.body.tenant : null;
  if (!handle) {
    next();
    return;
  }

  const metadata = await resolveTenantMetadataFromHandle(req, handle);
  if (!metadata) {
    next();
    return;
  }

  const method = readBuyerLoginMethod(metadata);
  if (!allowsYandexLogin(method)) {
    refuse(res, "This shop's buyers sign in with email and password only; Yandex ID is turned off.");
    return;
  }

  next();
};
