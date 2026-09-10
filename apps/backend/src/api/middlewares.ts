import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { AdminCreateProduct } from "@medusajs/medusa/api/admin/products/validators";
import { TENANT_ACTOR_TYPE } from "../modules/tenant";
import { PostTenantCreateSchema } from "./tenants/validators";

/**
 * `/tenants/*` is the tenant admin's own namespace, next to `/admin` (staff)
 * and `/store` (shoppers), never inside either. Every route under it requires
 * a session or bearer token issued to actor type `tenant`; `POST /tenants` is
 * the one exception, reachable with the actorless registration token from
 * `/auth/tenant/emailpass/register` (`allowUnregistered`).
 *
 * `AdminCreateProduct` is the same body schema the native Admin uses for
 * `POST /admin/products`. In 2.19.0 it is a factory (it takes an optional
 * `additional_data` schema) and `validateAndTransformBody` accepts a factory,
 * which is how `@medusajs/medusa`'s own admin middlewares pass it.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/tenants",
      method: ["POST"],
      middlewares: [
        authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"], {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostTenantCreateSchema),
      ],
    },
    {
      matcher: "/tenants/*",
      middlewares: [authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"])],
    },
    {
      matcher: "/tenants/products",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminCreateProduct)],
    },
  ],
});
