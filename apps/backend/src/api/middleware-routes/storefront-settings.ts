import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import {
  PostTenantDomainSchema,
  PostTenantHandleSchema,
  PostTenantRedirectSchema,
  PutTenantRedirectSchema,
  PutTenantBrandingSchema,
  PutTenantLoginSettingsSchema,
  PutTenantSeoVerificationSchema,
  PutTenantAnalyticsSchema,
} from "../tenants/validators";
import {
  gateBuyerEmailpassAuth,
  gateBuyerYandexAuth,
} from "../tenants/login-settings/login-method-gate";
import { adminUploadPostMiddlewares } from "./shared";

/**
 * Storefront by host and the settings beside it. They are custom domains, the
 * shop's address, redirects, search verification, analytics, branding, and the
 * buyer login methods with their gates.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const storefrontSettingsRoutes: MiddlewareRoute[] = [
  // ---- piece 9: storefront by host (/tenants/domains/**, /storefront/by-host)
  // `GET /storefront/by-host` takes no middleware entry on purpose: it reads
  // one query parameter and normalises it itself (`api/storefront/by-host/hosts.ts`),
  // and it must stay reachable with NO headers at all — it is the call that
  // hands the storefront its publishable key.
  {
    matcher: "/tenants/domains",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantDomainSchema)],
  },
  // The shop's own address (t-2026-09-12-tenant-address-canonical). Same shape
  // as the handle either creation route accepts; the reservations are checked
  // by the route.
  {
    matcher: "/tenants/handle",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantHandleSchema)],
  },
  // t11-seo-redirects: the tenant's own redirect table
  // (`/tenants/redirects/**`, read by the storefront at
  // `/store/tenant/redirects` behind the framework's own publishable-key
  // gate, no middleware needed there). `GET` and `DELETE` take no body.
  {
    matcher: "/tenants/redirects",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantRedirectSchema)],
  },
  {
    // b10-panel-gaps: editing one rule in place, so the owner's screen can fix
    // a target without dropping the rule and re-typing its source path.
    matcher: "/tenants/redirects/:id",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantRedirectSchema)],
  },
  {
    matcher: "/tenants/seo-verification",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantSeoVerificationSchema)],
  },
  // t17-analytics: the shop's own Yandex Metrica / GA4 ids, plus the
  // read-only sales summary computed from the tenant's own orders
  // (`GET /tenants/analytics/summary`, no body to validate).
  {
    matcher: "/tenants/analytics",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantAnalyticsSchema)],
  },
  // t16-owner-branding: logo/favicon/og-image/primary-colour/footer-credit.
  // The upload route reuses the same multipart middlewares as
  // `/tenants/uploads` (`adminUploadPostMiddlewares`, from `shared.ts`).
  {
    matcher: "/tenants/branding",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantBrandingSchema)],
  },
  {
    matcher: "/tenants/branding/upload",
    method: ["POST"],
    middlewares: adminUploadPostMiddlewares,
  },
  // o25-login-methods: email/Yandex ID/both, per shop.
  {
    matcher: "/tenants/login-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantLoginSettingsSchema)],
  },
  // Enforcement, not only UI (o25-login-methods, see the doc comment in
  // `login-method-gate.ts` for why each flow is resolved differently). Both
  // gates run BEFORE Medusa's own auth handler for the same route, the same
  // shape `blockArchivedTenantLogin` uses on `/auth/tenant/emailpass` in `gates.ts`.
  {
    matcher: "/auth/customer/emailpass",
    method: ["POST"],
    middlewares: [gateBuyerEmailpassAuth],
  },
  {
    matcher: "/auth/customer/emailpass/register",
    method: ["POST"],
    middlewares: [gateBuyerEmailpassAuth],
  },
  {
    matcher: "/auth/customer/emailpass/reset-password",
    method: ["POST"],
    middlewares: [gateBuyerEmailpassAuth],
  },
  {
    matcher: "/auth/customer/emailpass/update",
    method: ["POST"],
    middlewares: [gateBuyerEmailpassAuth],
  },
  {
    matcher: "/auth/customer/yandex",
    method: ["POST"],
    middlewares: [gateBuyerYandexAuth],
  },
];
