import { defineMiddlewares } from "@medusajs/framework/http";
import { gateRoutes } from "./middleware-routes/gates";
import { integrationRoutes } from "./middleware-routes/integrations";
import { panelListRoutes } from "./middleware-routes/panel-lists";
import { accountRoutes } from "./middleware-routes/account";
import { productRoutes } from "./middleware-routes/products";
import { orderRoutes } from "./middleware-routes/orders";
import { categoryRoutes } from "./middleware-routes/categories";
import { promotionRoutes } from "./middleware-routes/promotions";
import { contentRoutes } from "./middleware-routes/content";
import { wbRoutes } from "./middleware-routes/wb";
import { storefrontSettingsRoutes } from "./middleware-routes/storefront-settings";
import { platformAdminRoutes } from "./middleware-routes/platform-admin";
import { shippingRoutes } from "./middleware-routes/shipping";
import { buyerRoutes } from "./middleware-routes/buyer";
import { storeAccessRoutes } from "./middleware-routes/store-access";

/**
 * `/tenants/*` is the tenant admin's own namespace, next to `/admin` (staff)
 * and `/store` (shoppers), never inside either. Every route under it requires
 * a session or bearer token issued to actor type `tenant`; `POST /tenants` is
 * the one exception, reachable with the actorless registration token from
 * `/auth/tenant/emailpass/register` (`allowUnregistered`).
 *
 * Every list below is parsed by the Admin's own validator and query config,
 * the way `@medusajs/medusa/dist/api/admin/middlewares` wires them, so the
 * panel can send the Admin's field syntax and read back `count`, `offset` and
 * `limit`. The routes then add the tenant's own constraint from the module
 * links; parsing the query and deciding the scope are separate jobs, and only
 * the second one is ours.
 */

/**
 * Medusa reads this file from its fixed path. The routes themselves live in
 * `middleware-routes/`, one route group per file (t-2026-10-14-55). The array
 * below joins them in the order the single file used to declare them. That
 * order matters. Express hands a path to every matching entry in the order they
 * are declared, so a static child such as `/tenants/products/import` has to come
 * before `/tenants/products/:id`. Add a route to the file of its group, and add
 * a new group where its order puts it.
 */
export default defineMiddlewares({
  routes: [
    ...gateRoutes,
    ...integrationRoutes,
    ...panelListRoutes,
    ...accountRoutes,
    ...productRoutes,
    ...orderRoutes,
    ...categoryRoutes,
    ...promotionRoutes,
    ...contentRoutes,
    ...wbRoutes,
    ...storefrontSettingsRoutes,
    ...platformAdminRoutes,
    ...shippingRoutes,
    ...buyerRoutes,
    ...storeAccessRoutes,
  ],
});
