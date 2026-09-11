import {
  authenticate,
  defineMiddlewares,
  maybeApplyLinkFilter,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { listTransformQueryConfig as listCollectionQueryConfig } from "@medusajs/medusa/api/admin/collections/query-config";
import { AdminGetCollectionsParams } from "@medusajs/medusa/api/admin/collections/validators";
import { listTransformQueryConfig as listInventoryItemQueryConfig } from "@medusajs/medusa/api/admin/inventory-items/query-config";
import { AdminGetInventoryItemsParams } from "@medusajs/medusa/api/admin/inventory-items/validators";
import { listTransformQueryConfig as listOrderQueryConfig } from "@medusajs/medusa/api/admin/orders/query-config";
import { AdminGetOrdersParams } from "@medusajs/medusa/api/admin/orders/validators";
import { listPricePreferenceQueryConfig } from "@medusajs/medusa/api/admin/price-preferences/query-config";
import { AdminGetPricePreferencesParams } from "@medusajs/medusa/api/admin/price-preferences/validators";
import { listProductCategoryConfig } from "@medusajs/medusa/api/admin/product-categories/query-config";
import { AdminProductCategoriesParams } from "@medusajs/medusa/api/admin/product-categories/validators";
import { listProductOptionsTransformQueryConfig } from "@medusajs/medusa/api/admin/product-options/query-config";
import { listProductTagsTransformQueryConfig } from "@medusajs/medusa/api/admin/product-tags/query-config";
import { AdminGetProductTagsParams } from "@medusajs/medusa/api/admin/product-tags/validators";
import { listProductTypesTransformQueryConfig } from "@medusajs/medusa/api/admin/product-types/query-config";
import { AdminGetProductTypesParams } from "@medusajs/medusa/api/admin/product-types/validators";
import {
  listProductQueryConfig,
  retrieveProductQueryConfig,
} from "@medusajs/medusa/api/admin/products/query-config";
import {
  AdminCreateProduct,
  AdminGetProductParams,
  AdminGetProductsParams,
} from "@medusajs/medusa/api/admin/products/validators";
import { listTransformQueryConfig as listRegionQueryConfig } from "@medusajs/medusa/api/admin/regions/query-config";
import { AdminGetRegionsParams } from "@medusajs/medusa/api/admin/regions/validators";
import {
  listTransformQueryConfig as listSalesChannelQueryConfig,
  retrieveTransformQueryConfig as retrieveSalesChannelQueryConfig,
} from "@medusajs/medusa/api/admin/sales-channels/query-config";
import {
  AdminGetSalesChannelParams,
  AdminGetSalesChannelsParams,
} from "@medusajs/medusa/api/admin/sales-channels/validators";
import { listTransformQueryConfig as listShippingProfileQueryConfig } from "@medusajs/medusa/api/admin/shipping-profiles/query-config";
import { AdminGetShippingProfilesParams } from "@medusajs/medusa/api/admin/shipping-profiles/validators";
import { retrieveTransformQueryConfig as retrieveStoreQueryConfig } from "@medusajs/medusa/api/admin/stores/query-config";
import { AdminGetStoreParams } from "@medusajs/medusa/api/admin/stores/validators";
import { MedusaError } from "@medusajs/framework/utils";
import { adminUploadRoutesMiddlewares } from "@medusajs/medusa/api/admin/uploads/middlewares";
import { TENANT_ACTOR_TYPE } from "../modules/tenant";
import {
  AdminGetTenantsParams,
  DeleteAdminTenantParams,
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
  PostAdminTenantUpdateSchema,
} from "./admin/tenants/validators";
import { blockArchivedTenantAdmin, blockArchivedTenantLogin } from "./tenants/archived-tenant-gate";
import { PostTenantCreateSchema, TenantGetProductOptionsParams } from "./tenants/validators";

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
 *
 * Every list below is parsed by the Admin's own validator and query config,
 * the way `@medusajs/medusa/dist/api/admin/middlewares` wires them, so the
 * panel can send the Admin's field syntax and read back `count`, `offset` and
 * `limit`. The routes then add the tenant's own constraint from the module
 * links; parsing the query and deciding the scope are separate jobs, and only
 * the second one is ours.
 */

/**
 * `POST /admin/uploads` parses its multipart body with multer, which is a
 * transitive dependency of `@medusajs/medusa` and is not resolvable from this
 * app. Reusing the Admin's own middleware array keeps `POST /tenants/uploads`
 * on exactly that parser without adding a dependency. If the array ever stops
 * carrying it, boot fails here rather than at the first upload, which would
 * otherwise arrive with `req.files` empty and answer a confusing 400.
 */
const adminUploadPostMiddlewares =
  adminUploadRoutesMiddlewares.find(
    (route) => route.matcher === "/admin/uploads" && (route.method ?? []).includes("POST"),
  )?.middlewares ?? [];

if (adminUploadPostMiddlewares.length === 0) {
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "No middlewares found for POST /admin/uploads in @medusajs/medusa. " +
      "POST /tenants/uploads reuses them for its multipart parsing; see src/api/tenants/uploads/route.ts.",
  );
}

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
      // `blockArchivedTenantAdmin` runs right after `authenticate`, on the
      // same matcher, so it sees `req.auth_context.actor_id` (contract §4).
      middlewares: [authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"]), blockArchivedTenantAdmin],
    },
    {
      // Login gate (contract §4): refuses an archived tenant's admin before
      // Medusa's own emailpass handler runs.
      matcher: "/auth/tenant/emailpass",
      method: ["POST"],
      middlewares: [blockArchivedTenantLogin],
    },
    {
      matcher: "/tenants/products",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminCreateProduct)],
    },
    {
      matcher: "/tenants/products",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductsParams, listProductQueryConfig),
        // A product cannot be filtered by `sales_channel_id` directly; the
        // Admin turns that parameter into an id filter through the link table
        // and so do we, before the route intersects it with the tenant's own
        // product ids.
        maybeApplyLinkFilter({
          entryPoint: "product_sales_channel",
          resourceId: "product_id",
          filterableField: "sales_channel_id",
        }),
      ],
    },
    {
      matcher: "/tenants/products/:id",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig)],
    },
    {
      matcher: "/tenants/orders",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listOrderQueryConfig)],
    },
    {
      matcher: "/tenants/sales-channels",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetSalesChannelsParams, listSalesChannelQueryConfig),
      ],
    },
    {
      matcher: "/tenants/sales-channels/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetSalesChannelParams, retrieveSalesChannelQueryConfig),
      ],
    },
    {
      matcher: "/tenants/product-options",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          TenantGetProductOptionsParams,
          listProductOptionsTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/store",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetStoreParams, retrieveStoreQueryConfig)],
    },
    {
      matcher: "/tenants/uploads",
      method: ["POST"],
      middlewares: adminUploadPostMiddlewares,
    },
    {
      matcher: "/tenants/inventory-items",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetInventoryItemsParams, listInventoryItemQueryConfig),
      ],
    },
    {
      matcher: "/tenants/regions",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetRegionsParams, listRegionQueryConfig)],
    },
    {
      matcher: "/tenants/price-preferences",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetPricePreferencesParams, listPricePreferenceQueryConfig),
      ],
    },
    {
      matcher: "/tenants/product-categories",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminProductCategoriesParams, listProductCategoryConfig),
      ],
    },
    {
      matcher: "/tenants/product-types",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductTypesParams, listProductTypesTransformQueryConfig),
      ],
    },
    {
      matcher: "/tenants/product-tags",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductTagsParams, listProductTagsTransformQueryConfig),
      ],
    },
    {
      matcher: "/tenants/collections",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetCollectionsParams, listCollectionQueryConfig)],
    },
    {
      matcher: "/tenants/shipping-profiles",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetShippingProfilesParams, listShippingProfileQueryConfig),
      ],
    },
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
  ],
});
