import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import {
  AdminGetTenantsParams,
  DeleteAdminTenantParams,
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
  PostAdminTenantUpdateSchema,
} from "../admin/tenants/validators";
import { PostAdminPlatformPricingSchema } from "../../modules/platform-pricing/schema";

/**
 * The platform staff's own API under `/admin`, for tenant management and the
 * pricing page.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const platformAdminRoutes: MiddlewareRoute[] = [
  // `/admin/tenants*` (contract §3): the platform staff's own tenant
  // management API. Auth is the framework's default `/admin/*` middleware
  // (actor type `user`), applied automatically to every custom route under
  // it; only validation is added here. `{}` as the second argument to
  // `validateAndTransformQuery` is deliberate: these schemas are this
  // route's own (not one of the Admin's generated list/retrieve configs),
  // so there is no `QueryConfig` to hand it beyond an empty one.
  {
    matcher: "/admin/tenants",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(AdminGetTenantsParams, {})],
  },
  {
    matcher: "/admin/tenants",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAdminTenantCreateSchema)],
  },
  {
    matcher: "/admin/tenants/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAdminTenantUpdateSchema)],
  },
  {
    matcher: "/admin/tenants/:id",
    method: ["DELETE"],
    middlewares: [validateAndTransformQuery(DeleteAdminTenantParams, {})],
  },
  {
    matcher: "/admin/tenants/:id/admins",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAdminTenantAdminCreateSchema)],
  },
  {
    matcher: "/admin/tenants/:id/admins/:adminId",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAdminTenantAdminUpdateSchema)],
  },
  // t-2026-09-25-08: the platform pricing page. Staff auth is the default
  // `/admin/*` middleware; the body is the whole page, checked by the one
  // schema the public read (`GET /platform/pricing`, no entry here: no auth,
  // no key, nothing to validate) parses the stored row with.
  {
    matcher: "/admin/platform-pricing",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostAdminPlatformPricingSchema)],
  },
];
