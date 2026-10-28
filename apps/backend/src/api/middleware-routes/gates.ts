import {
  type MiddlewareRoute,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import { TENANT_ACTOR_TYPE } from "../../modules/tenant";
import { PostTenantCreateSchema } from "../tenants/validators";
import { blockArchivedTenantLogin } from "../tenants/archived-tenant-gate";
import { guardTenantAdmin } from "../tenants/tenant-admin-gate";
import { requireOwnerPasswordLength } from "../auth/password-length-gate";
import { guardRequestedFields } from "../field-guard";
import { allowStoreMetadataOnAnswer } from "../store-metadata";
import { keepPublishedCategoryProductsOnAnswer } from "../store-category-products";
import { rateLimit } from "../rate-limit";
import { overlayStagedProductsOnAnswer } from "../../agent-changesets/overlay";

/**
 * The gates in front of every route. They are the registration route, the field
 * guard and the Store answer filters on the two wildcards, the tenant session
 * on `/tenants/*`, and the owner's login and password gates.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const gateRoutes: MiddlewareRoute[] = [
  {
    matcher: "/tenants",
    method: ["POST"],
    middlewares: [
      // Audit 2026-09-23, A-04: 10 registrations a minute per client.
      rateLimit(),
      authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"], {
        allowUnregistered: true,
      }),
      validateAndTransformBody(PostTenantCreateSchema),
    ],
  },
  // What a caller may expand through `?fields=` (review 2026-09-21, T-6). Both
  // matchers are wildcards, and a wildcard sorts before every static and
  // parametric route, Medusa's own included, so the guard runs before any
  // `validateAndTransformQuery` reads the fields.
  //
  // `allowStoreMetadataOnAnswer` rides the same wildcard for the same reason: it
  // has to be in place before any Store route answers (t-2026-10-08-13). It is
  // on `/store/*` only, so `/admin` and `/tenants` answer with `metadata` whole.
  //
  // `keepPublishedCategoryProductsOnAnswer` comes after the guard: it reads the
  // fields the guard let through, and a category answers with its published
  // products only (t-2026-10-12-32).
  //
  // `overlayStagedProductsOnAnswer` lays a stage site's staged product ops over
  // the answer; a main site's key passes it untouched (t-2026-10-27-04).
  {
    matcher: "/store/*",
    middlewares: [
      guardRequestedFields,
      allowStoreMetadataOnAnswer,
      keepPublishedCategoryProductsOnAnswer,
      overlayStagedProductsOnAnswer,
    ],
  },
  { matcher: "/tenants/*", middlewares: [guardRequestedFields] },
  {
    matcher: "/tenants/*",
    // `guardTenantAdmin` runs right after `authenticate`, on the same
    // matcher, so it sees `req.auth_context.actor_id`. One read of the
    // caller's login row answers whether the login still exists, whether the
    // shop is archived (contract §4) and whether the caller's role may call
    // this route (t-2026-10-07-11, `tenants/permissions.ts`).
    middlewares: [authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"]), guardTenantAdmin],
  },
  {
    // Login gate (contract §4): refuses an archived tenant's admin before
    // Medusa's own emailpass handler runs.
    matcher: "/auth/tenant/emailpass",
    method: ["POST"],
    // Audit 2026-09-23, A-04: 10 login attempts a minute per client.
    middlewares: [rateLimit(), blockArchivedTenantLogin],
  },
  // 46df A-22: the reset-password link sets a new password through Medusa's
  // own `/update` handler, which checks no length, and so does `/register`,
  // where the owner's first password is set. The owner (actor `tenant`) and
  // platform staff (actor `user`) get the same 8-character floor as
  // `POST /tenants/me/password`; buyers' `/auth/customer/*` is not touched.
  {
    matcher: "/auth/tenant/emailpass/register",
    method: ["POST"],
    middlewares: [requireOwnerPasswordLength],
  },
  {
    matcher: "/auth/tenant/emailpass/update",
    method: ["POST"],
    middlewares: [requireOwnerPasswordLength],
  },
  {
    matcher: "/auth/user/emailpass/update",
    method: ["POST"],
    middlewares: [requireOwnerPasswordLength],
  },
];
