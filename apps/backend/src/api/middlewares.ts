import {
  authenticate,
  defineMiddlewares,
  maybeApplyLinkFilter,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { listTransformQueryConfig as listClaimQueryConfig } from "@medusajs/medusa/api/admin/claims/query-config";
import {
  retrieveTransformQueryConfig as retrieveCustomerQueryConfig,
} from "@medusajs/medusa/api/admin/customers/query-config";
import { AdminCustomerParams } from "@medusajs/medusa/api/admin/customers/validators";
import { listTransformQueryConfig as listExchangeQueryConfig } from "@medusajs/medusa/api/admin/exchanges/query-config";
import { listTransformQueryConfig as listFulfillmentProviderQueryConfig } from "@medusajs/medusa/api/admin/fulfillment-providers/query-config";
import { AdminFulfillmentProvidersParams } from "@medusajs/medusa/api/admin/fulfillment-providers/validators";
import { listTransformQueryConfig as listCollectionQueryConfig } from "@medusajs/medusa/api/admin/collections/query-config";
import { AdminGetCollectionsParams } from "@medusajs/medusa/api/admin/collections/validators";
import { listTransformQueryConfig as listInventoryItemQueryConfig } from "@medusajs/medusa/api/admin/inventory-items/query-config";
import { AdminGetInventoryItemsParams } from "@medusajs/medusa/api/admin/inventory-items/validators";
import {
  exportTransformQueryConfig as exportOrderQueryConfig,
  listOrderItemsQueryConfig,
  listTransformQueryConfig as listOrderQueryConfig,
  retrieveOrderChangesTransformQueryConfig,
  retrieveTransformQueryConfig as retrieveOrderQueryConfig,
} from "@medusajs/medusa/api/admin/orders/query-config";
import {
  AdminGetOrdersOrderItemsParams,
  AdminGetOrdersOrderParams,
  AdminGetOrdersParams,
  AdminMarkOrderFulfillmentAsDelivered,
  AdminOrderCancelFulfillment,
  AdminOrderChangesParams,
  AdminOrderCreateFulfillment,
  AdminOrderCreateShipment,
} from "@medusajs/medusa/api/admin/orders/validators";
import { retrieveTransformQueryConfig as retrievePaymentQueryConfig } from "@medusajs/medusa/api/admin/payments/query-config";
import {
  AdminCreatePaymentCapture,
  AdminGetPaymentParams,
} from "@medusajs/medusa/api/admin/payments/validators";
import { listPricePreferenceQueryConfig } from "@medusajs/medusa/api/admin/price-preferences/query-config";
import { AdminGetPricePreferencesParams } from "@medusajs/medusa/api/admin/price-preferences/validators";
import {
  listProductCategoryConfig,
  retrieveProductCategoryConfig,
} from "@medusajs/medusa/api/admin/product-categories/query-config";
import {
  AdminCreateProductCategory,
  AdminProductCategoriesParams,
  AdminProductCategoryParams,
  AdminUpdateProductCategory,
} from "@medusajs/medusa/api/admin/product-categories/validators";
import { listProductOptionsTransformQueryConfig } from "@medusajs/medusa/api/admin/product-options/query-config";
import { listProductTagsTransformQueryConfig } from "@medusajs/medusa/api/admin/product-tags/query-config";
import { AdminGetProductTagsParams } from "@medusajs/medusa/api/admin/product-tags/validators";
import { listProductTypesTransformQueryConfig } from "@medusajs/medusa/api/admin/product-types/query-config";
import { AdminGetProductTypesParams } from "@medusajs/medusa/api/admin/product-types/validators";
import {
  listOptionConfig,
  listProductQueryConfig,
  listVariantConfig,
  retrieveProductQueryConfig,
  retrieveVariantConfig,
} from "@medusajs/medusa/api/admin/products/query-config";
import {
  AdminBatchImageVariant,
  AdminBatchVariantImages,
  AdminBatchCreateVariantInventoryItem,
  AdminBatchDeleteVariantInventoryItem,
  AdminBatchUpdateProductVariant,
  AdminBatchUpdateVariantInventoryItem,
  AdminCreateProduct,
  AdminCreateProductVariant,
  AdminCreateVariantInventoryItem,
  AdminGetProductOptionsParams,
  AdminGetProductParams,
  AdminGetProductVariantParams,
  AdminGetProductsParams,
  AdminLinkProductOptions,
  AdminUpdateProduct,
  AdminUpdateProductVariant,
  AdminUpdateVariantInventoryItem,
  CreateProductVariant,
} from "@medusajs/medusa/api/admin/products/validators";
import { listProductVariantQueryConfig } from "@medusajs/medusa/api/admin/product-variants/query-config";
import { AdminGetProductVariantsParams } from "@medusajs/medusa/api/admin/product-variants/validators";
import { AdminBatchInventoryItemLevels } from "@medusajs/medusa/api/admin/inventory-items/validators";
import { listTransformQueryConfig as listReservationQueryConfig } from "@medusajs/medusa/api/admin/reservations/query-config";
import { AdminGetReservationsParams } from "@medusajs/medusa/api/admin/reservations/validators";
import { listTransformQueryConfig as listReturnQueryConfig } from "@medusajs/medusa/api/admin/returns/query-config";
import { createBatchBody, createLinkBody } from "@medusajs/medusa/api/utils/validators";
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
import { listTransformQueryConfig as listShippingOptionQueryConfig } from "@medusajs/medusa/api/admin/shipping-options/query-config";
import { AdminGetShippingOptionsParams } from "@medusajs/medusa/api/admin/shipping-options/validators";
import { listTransformQueryConfig as listShippingProfileQueryConfig } from "@medusajs/medusa/api/admin/shipping-profiles/query-config";
import { AdminGetShippingProfilesParams } from "@medusajs/medusa/api/admin/shipping-profiles/validators";
import {
  listTransformQueryConfig as listStockLocationQueryConfig,
  retrieveTransformQueryConfig as retrieveStockLocationQueryConfig,
} from "@medusajs/medusa/api/admin/stock-locations/query-config";
import {
  AdminGetStockLocationParams,
  AdminGetStockLocationsParams,
} from "@medusajs/medusa/api/admin/stock-locations/validators";
import { retrieveTransformQueryConfig as retrieveStoreQueryConfig } from "@medusajs/medusa/api/admin/stores/query-config";
import { AdminGetStoreParams } from "@medusajs/medusa/api/admin/stores/validators";
import { applyCategoryFilters as applyStoreCategoryFilters } from "@medusajs/medusa/api/store/product-categories/helpers";
import { listProductCategoryConfig as listStoreProductCategoryConfig } from "@medusajs/medusa/api/store/product-categories/query-config";
import { StoreProductCategoriesParams } from "@medusajs/medusa/api/store/product-categories/validators";
import { MedusaError } from "@medusajs/framework/utils";
import { adminUploadRoutesMiddlewares } from "@medusajs/medusa/api/admin/uploads/middlewares";
import { TENANT_ACTOR_TYPE } from "../modules/tenant";
import {
  PostTenantCreateSchema,
  PostTenantUpdateMeSchema,
  PostTenantUpdatePasswordSchema,
  TenantGetProductOptionsParams,
} from "./tenants/validators";
// ---- piece 8: the home-page document body schema (zod for theme/content;
// `settings` is checked by store/storefront-settings/validation.ts inside it).
import { PutTenantHomeBody } from "./tenants/home/validators";

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
      middlewares: [authenticate(TENANT_ACTOR_TYPE, ["session", "bearer"])],
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

    // ---- tenant panel wave 2 (t-2026-09-11-mt-panel-wave-2). Each piece adds
    // its matchers under its own heading so the pieces merge without touching
    // one another's lines. Every route stays behind the "/tenants/*" authenticate
    // above; validators/query-configs come from the Admin's own modules.
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

    // ---- piece 1: product detail (/tenants/products/:id/**, variants, options)
    {
      matcher: "/tenants/products/:id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdateProduct),
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductVariantsParams, listVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateProductVariant),
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    // The batch matcher has to come before `:variant_id`, otherwise Express
    // hands `/variants/batch` to the single-variant route with
    // `variant_id === "batch"`; the Admin's own middleware list is ordered the
    // same way.
    {
      matcher: "/tenants/products/:id/variants/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(
          createBatchBody(CreateProductVariant, AdminBatchUpdateProductVariant),
        ),
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/inventory-items/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(
          createBatchBody(
            AdminBatchCreateVariantInventoryItem,
            AdminBatchUpdateVariantInventoryItem,
            AdminBatchDeleteVariantInventoryItem,
          ),
        ),
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdateProductVariant),
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id/images/batch",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminBatchVariantImages)],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id/inventory-items",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateVariantInventoryItem),
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id/inventory-items/:inventory_item_id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdateVariantInventoryItem),
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/variants/:variant_id/inventory-items/:inventory_item_id",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductVariantParams, retrieveVariantConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/images/:image_id/variants/batch",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminBatchImageVariant)],
    },
    {
      matcher: "/tenants/products/:id/options",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductOptionsParams, listOptionConfig),
      ],
    },
    {
      matcher: "/tenants/products/:id/options/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminLinkProductOptions),
        validateAndTransformQuery(AdminGetProductParams, retrieveProductQueryConfig),
      ],
    },
    {
      matcher: "/tenants/product-variants",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetProductVariantsParams, listProductVariantQueryConfig),
      ],
    },
    {
      matcher: "/tenants/stock-locations",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetStockLocationsParams, listStockLocationQueryConfig),
      ],
    },
    {
      matcher: "/tenants/inventory-items/location-levels/batch",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminBatchInventoryItemLevels)],
    },

    // ---- piece 2: order detail (/tenants/orders/:id/**, payments, fulfillments)
    // Every matcher below parses its query with the Admin's own validator and
    // query config, exactly as `@medusajs/medusa/dist/api/admin/orders/middlewares.js`
    // does, so the copied order-detail screen may send the Admin's `fields`
    // syntax and read the Admin's response shape back. Ownership is NOT decided
    // here: each route calls `assertOwnedOrder` / `assertOwnedPayment` from
    // `tenants/orders/helpers.ts` before it reads or writes anything.
    {
      matcher: "/tenants/orders/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/preview",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/changes",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminOrderChangesParams, retrieveOrderChangesTransformQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/line-items",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetOrdersOrderItemsParams, listOrderItemsQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/cancel",
      method: ["POST"],
      // The Admin takes no body here either; its own
      // `validateAndTransformBody` line is commented out upstream.
      middlewares: [
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/fulfillments",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminOrderCreateFulfillment),
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/shipments",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminOrderCreateShipment),
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/cancel",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminOrderCancelFulfillment),
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      ],
    },
    {
      matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/mark-as-delivered",
      method: ["POST"],
      middlewares: [
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
        validateAndTransformBody(AdminMarkOrderFulfillmentAsDelivered),
      ],
    },
    {
      matcher: "/tenants/payments/:id/capture",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePaymentCapture),
        validateAndTransformQuery(AdminGetPaymentParams, retrievePaymentQueryConfig),
      ],
    },
    // Read-only references the order-detail screen and the fulfillment and
    // shipment forms fill their comboboxes from.
    {
      matcher: "/tenants/stock-locations",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetStockLocationsParams, listStockLocationQueryConfig),
        // `sales_channel_id` is not a column on a stock location; the Admin
        // turns it into an id filter through the link table and so must we, or
        // the query throws "not existing property".
        maybeApplyLinkFilter({
          entryPoint: "sales_channel_location",
          resourceId: "stock_location_id",
          filterableField: "sales_channel_id",
        }),
      ],
    },
    {
      matcher: "/tenants/stock-locations/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetStockLocationParams, retrieveStockLocationQueryConfig),
      ],
    },
    {
      matcher: "/tenants/fulfillment-providers",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminFulfillmentProvidersParams,
          listFulfillmentProviderQueryConfig,
        ),
        // Same reason as the stock-location matcher above: `stock_location_id`
        // reaches a provider only through the link table.
        maybeApplyLinkFilter({
          entryPoint: "location_fulfillment_provider",
          resourceId: "fulfillment_provider_id",
          filterableField: "stock_location_id",
        }),
      ],
    },
    {
      matcher: "/tenants/shipping-options",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetShippingOptionsParams, listShippingOptionQueryConfig),
        // The create-fulfillment form narrows the options by the chosen
        // warehouse. `stock_location_id` is not a column on a shipping option:
        // without this the query throws "Trying to query by not existing
        // property ShippingOption.stock_location_id" (measured live on
        // :9029, 2026-09-11) and the form can never configure itself.
        maybeApplyLinkFilter({
          entryPoint: "location_fulfillment_set",
          resourceId: "fulfillment_set_id",
          filterableField: "stock_location_id",
          filterByField: "service_zone.fulfillment_set_id",
        }),
      ],
    },
    {
      matcher: "/tenants/reservations",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetReservationsParams, listReservationQueryConfig),
      ],
    },
    {
      matcher: "/tenants/customers/:id",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminCustomerParams, retrieveCustomerQueryConfig)],
    },
    // RMA lists answer an empty page (see the route files). The validators stay
    // wired so `offset` and `limit` echo the request the way every other list
    // under /tenants does. `/tenants/order-edits` has no Admin list route to
    // borrow a validator from, so it takes none.
    {
      matcher: "/tenants/returns",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listReturnQueryConfig)],
    },
    {
      matcher: "/tenants/claims",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listClaimQueryConfig)],
    },
    {
      matcher: "/tenants/exchanges",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listExchangeQueryConfig)],
    },


    // ---- piece 3: orders export (/tenants/orders/export)
    // The filters arrive in the query string, not the body: the Admin's SDK
    // method the copied screen calls (`sdk.admin.order.export(query)`) sends
    // them there, and the Admin's own matcher parses them with the same pair.
    {
      matcher: "/tenants/orders/export",
      method: ["POST"],
      middlewares: [validateAndTransformQuery(AdminGetOrdersParams, exportOrderQueryConfig)],
    },


    // ---- piece 5: categories (/tenants/product-categories/**)
    // `GET /tenants/product-categories` keeps the matcher the first wave wired
    // above (AdminProductCategoriesParams + listProductCategoryConfig); only the
    // handler changed, from the Admin's re-export to the scoped list. The write
    // verbs and the retrieve below mirror the Admin's own middleware array
    // (@medusajs/medusa/dist/api/admin/product-categories/middlewares.js),
    // policies excluded: `/tenants/*` has no RBAC, the tenant-product-category
    // link is the whole authorisation and the routes check it themselves.
    {
      matcher: "/tenants/product-categories",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateProductCategory),
        validateAndTransformQuery(AdminProductCategoryParams, retrieveProductCategoryConfig),
      ],
    },
    {
      matcher: "/tenants/product-categories/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminProductCategoryParams, retrieveProductCategoryConfig),
      ],
    },
    {
      matcher: "/tenants/product-categories/:id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdateProductCategory),
        validateAndTransformQuery(AdminProductCategoryParams, retrieveProductCategoryConfig),
      ],
    },
    {
      matcher: "/tenants/product-categories/:id/products",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(createLinkBody()),
        validateAndTransformQuery(AdminProductCategoryParams, retrieveProductCategoryConfig),
      ],
    },
    // The storefront's public read. `/store/*` already carries the framework's
    // publishable-key gate, and the route resolves the tenant from that key;
    // `applyCategoryFilters` is the Store route's own middleware, so an inactive
    // or internal category is no more public here than on
    // `/store/product-categories`.
    {
      matcher: "/store/tenant/product-categories",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(StoreProductCategoriesParams, listStoreProductCategoryConfig),
        applyStoreCategoryFilters,
      ],
    },

    // ---- piece 6: promotions + campaigns (/tenants/promotions/**, /tenants/campaigns/**)

    // ---- piece 7: content pages (/tenants/pages/**, /store/tenant/pages/**)

    // ---- piece 8: home page document (/tenants/home, /store/tenant/home)
    // The document is one row per tenant, addressed by the token, so there is no
    // id to validate in the URL. `GET` takes no parameters (the whole document is
    // the answer, and the panel needs every field of it), which is why only the
    // write verb is wired here. `GET /store/tenant/home` needs nothing either: it
    // rides the framework's own publishable-key gate on `/store/*` and resolves
    // the tenant from that key.
    {
      matcher: "/tenants/home",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantHomeBody)],
    },

    // ---- piece 9: storefront by host (/tenants/domains/**, /storefront/by-host)
  ],
});
