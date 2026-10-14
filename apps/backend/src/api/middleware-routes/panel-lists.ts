import {
  type MiddlewareRoute,
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
import { TenantGetProductOptionsParams } from "../tenants/validators";
import { PostTenantSeedBody } from "../tenants/seed/validators";
import { adminUploadPostMiddlewares } from "./shared";

/**
 * The first wave of the tenant panel. It holds the starter catalog, product
 * create and list, and the read-only lists the copied Admin screens fill
 * themselves from.
 *
 * `AdminCreateProduct` is the same body schema the native Admin uses for
 * `POST /admin/products`. In 2.19.0 it is a factory (it takes an optional
 * `additional_data` schema) and `validateAndTransformBody` accepts a factory,
 * which is how `@medusajs/medusa`'s own admin middlewares pass it.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const panelListRoutes: MiddlewareRoute[] = [
  {
    // The starter catalog for an empty shop (specs/catalog-taxonomy/ABSTRACT-DATASETS.md §4).
    matcher: "/tenants/seed",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantSeedBody)],
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
];
