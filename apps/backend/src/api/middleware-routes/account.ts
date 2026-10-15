import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import {
  PostTenantSiteSchema,
  PutTenantHreflangSistersSchema,
  PostTenantSwitchShopSchema,
  PostTenantStaffCreateSchema,
  PostTenantStaffUpdateSchema,
  PostTenantUpdateMeSchema,
  PostTenantUpdatePasswordSchema,
} from "../tenants/validators";

/**
 * The owner's profile and password, her sites and sister sites, the shop
 * switcher and the shop's staff.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const accountRoutes: MiddlewareRoute[] = [
  // ---- tenant panel wave 2 (t-2026-09-11-mt-panel-wave-2). Each piece adds
  // its matchers under its own heading so the pieces merge without touching
  // one another's lines. Every route stays behind the "/tenants/*" authenticate
  // in `gates.ts`; validators/query-configs come from the Admin's own modules.
  // ---- piece 4: profile (/tenants/me, /tenants/me/password)
  {
    matcher: "/tenants/me",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantUpdateMeSchema)],
  },
  {
    matcher: "/tenants/me/password",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantUpdatePasswordSchema)],
  },
  // t-2026-09-24-n12: «Настройки → Сайты», the sites of one client and
  // «Создать сайт». GET takes no parameters.
  {
    matcher: "/tenants/sites",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantSiteSchema)],
  },
  // t-cherk-31: the owner's override list of sister sites that live outside
  // this database. GET takes no body.
  {
    matcher: "/tenants/hreflang-sisters",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantHreflangSistersSchema)],
  },
  // o25-platform-admin-all-shops: the shop switcher. GET takes no body; it
  // reads only what the caller's OWN token already grants.
  {
    matcher: "/tenants/me/switch",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantSwitchShopSchema)],
  },
  // t-2026-10-07-11: «Настройки → Сотрудники», the shop's own logins. The
  // `staff` permission is checked by `guardTenantAdmin` on "/tenants/*".
  {
    matcher: "/tenants/staff",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantStaffCreateSchema)],
  },
  {
    matcher: "/tenants/staff/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantStaffUpdateSchema)],
  },
];
