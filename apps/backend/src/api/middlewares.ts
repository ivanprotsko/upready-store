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
import {
  TenantExportCustomersParams,
  TenantGetCustomersParams,
} from "./tenants/customers/validators";
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
import {
  listTransformQueryConfig as listCampaignQueryConfig,
  retrieveTransformQueryConfig as retrieveCampaignQueryConfig,
} from "@medusajs/medusa/api/admin/campaigns/query-config";
import {
  AdminCreateCampaign,
  AdminGetCampaignParams,
  AdminGetCampaignsParams,
  AdminUpdateCampaign,
} from "@medusajs/medusa/api/admin/campaigns/validators";
import {
  listRuleTransformQueryConfig,
  listRuleValueTransformQueryConfig,
  listTransformQueryConfig as listPromotionQueryConfig,
  retrieveRuleTransformQueryConfig,
  retrieveTransformQueryConfig as retrievePromotionQueryConfig,
} from "@medusajs/medusa/api/admin/promotions/query-config";
import {
  AdminCreatePromotion,
  AdminCreatePromotionRule,
  AdminGetPromotionParams,
  AdminGetPromotionRuleParams,
  AdminGetPromotionRuleTypeParams,
  AdminGetPromotionsParams,
  AdminGetPromotionsRuleValueParams,
  AdminUpdatePromotion,
  AdminUpdatePromotionRule,
} from "@medusajs/medusa/api/admin/promotions/validators";
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
  PostTenantDomainSchema,
  PutTenantPaymentSettingsSchema,
  PutTenantNotificationSettingsSchema,
  PostTenantHandleSchema,
  PostTenantArticleSchema,
  PostTenantPageSchema,
  PostTenantRedirectSchema,
  PutTenantSeoVerificationSchema,
  PostTenantUpdateMeSchema,
  PostTenantUpdatePasswordSchema,
  PutTenantArticleSchema,
  PutTenantPageSchema,
  TenantGetProductOptionsParams,
} from "./tenants/validators";
import {
  GetShippingRegionsSchema,
  PostStoreShippingQuoteSchema,
  PostTenantShippingMethodSchema,
  PostTenantShippingMethodsReorderSchema,
  PostTenantShippingMethodUpdateSchema,
  PostTenantShippingSettingsSchema,
} from "./tenants/shipping-methods/validators";
// ---- t09-reviews: moderation body (tenant side) and the storefront's form.
import { PostTenantReviewSchema } from "./tenants/reviews/validators";
import { PostStoreReviewSchema } from "./store/tenant/reviews/validators";
// ---- piece 8: the home-page document body schema (zod for theme/content;
// `settings` is checked by store/storefront-settings/validation.ts inside it).
import { PutTenantHomeBody } from "./tenants/home/validators";
import {
  PostTenantProductAttributeSchema,
  PostTenantProductAttributeUpdateSchema,
  PostTenantProductAttributeValuesSchema,
} from "./tenants/product-attributes/validators";
import { PutTenantLocaleSettingsBody } from "./tenants/locale-settings/validators";
import { PostTenantSeedBody } from "./tenants/seed/validators";
import {
  AdminGetTenantsParams,
  DeleteAdminTenantParams,
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
  PostAdminTenantUpdateSchema,
} from "./admin/tenants/validators";
import { blockArchivedTenantAdmin, blockArchivedTenantLogin } from "./tenants/archived-tenant-gate";
import { injectRobokassaTenant } from "./store/tenant/robokassa";
import { StoreGetPaymentProvidersParams } from "@medusajs/medusa/api/store/payment-providers/validators";
import { listTransformPaymentProvidersQueryConfig } from "@medusajs/medusa/api/store/payment-providers/query-config";

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

/**
 * The Admin's three promotion rule batch routes raise the body size limit to
 * `DEFAULT_BATCH_ENDPOINTS_SIZE_LIMIT`, which is the literal "2mb"
 * (`@medusajs/medusa/dist/utils/middlewares/index.js`). That module is not on the
 * package's export map, so the value is written out here rather than imported
 * from a path that is not a public entry point.
 */
const BATCH_ENDPOINTS_SIZE_LIMIT = "2mb";

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
      // The shop's payment account (t03-tenant-secrets-robokassa).
      matcher: "/tenants/payment-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantPaymentSettingsSchema)],
    },
    {
      // Who hears about this shop's orders (t08-order-notifications).
      matcher: "/tenants/notification-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantNotificationSettingsSchema)],
    },
    {
      // Robokassa needs the SERVER's word on which shop the cart belongs to;
      // the client's `data.tenant_id`, if any, is overwritten (step 4 of the task).
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [injectRobokassaTenant],
    },
    {
      // The shadowing route in `src/api/store/payment-providers/route.ts`
      // reads `req.filterableFields` and `req.queryConfig` the way the core
      // route does, so it is parsed by the core's own validator and config.
      matcher: "/store/payment-providers",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(StoreGetPaymentProvidersParams, listTransformPaymentProvidersQueryConfig),
      ],
    },
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

    // ---- t14-product-import: catalogue export and import (/tenants/products/export,
    // /tenants/products/import/**)
    //
    // These come BEFORE `/tenants/products/:id` for the same reason the
    // variants batch comes before `:variant_id` further down: Express hands a
    // path to every matching entry in the order they are declared, and
    // `/tenants/products/:id` matches `/tenants/products/import` just as well
    // as it matches a product id. Declaring the upload first is what puts
    // multer in front of the body validator, so `req.files` is populated by the
    // time the route runs.
    //
    // `GET /tenants/products/export` takes no query parameters and answers the
    // CSV bytes, so it needs no validator of its own.
    {
      matcher: "/tenants/products/import",
      method: ["POST"],
      middlewares: adminUploadPostMiddlewares,
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
      matcher: "/tenants/customers",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(TenantGetCustomersParams, { isList: true })],
    },
    {
      matcher: "/tenants/customers/export",
      method: ["POST"],
      middlewares: [validateAndTransformQuery(TenantExportCustomersParams, { isList: true })],
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
    // The two static children of /tenants/promotions come FIRST: Express hands
    // a path to the first matching entry, and `/tenants/promotions/:id/:rule_type`
    // matches `rule-attribute-options/rules` just as well as it matches a real
    // promotion id. The Admin's own middleware list is ordered the same way.
    {
      matcher: "/tenants/promotions/rule-attribute-options/:rule_type",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionRuleParams,
          listRuleTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/promotions/rule-value-options/:rule_type/:rule_attribute_id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionsRuleValueParams,
          listRuleValueTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/promotions",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetPromotionsParams, listPromotionQueryConfig),
      ],
    },
    {
      matcher: "/tenants/promotions",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotion),
        validateAndTransformQuery(AdminGetPromotionParams, retrievePromotionQueryConfig),
      ],
    },
    {
      matcher: "/tenants/promotions/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetPromotionParams, retrievePromotionQueryConfig),
      ],
    },
    {
      matcher: "/tenants/promotions/:id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotion),
        validateAndTransformQuery(AdminGetPromotionParams, retrievePromotionQueryConfig),
      ],
    },
    {
      matcher: "/tenants/promotions/:id/rules/batch",
      method: ["POST"],
      bodyParser: { sizeLimit: BATCH_ENDPOINTS_SIZE_LIMIT },
      middlewares: [
        validateAndTransformBody(
          createBatchBody(AdminCreatePromotionRule, AdminUpdatePromotionRule),
        ),
        validateAndTransformQuery(
          AdminGetPromotionRuleParams,
          retrieveRuleTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/promotions/:id/target-rules/batch",
      method: ["POST"],
      bodyParser: { sizeLimit: BATCH_ENDPOINTS_SIZE_LIMIT },
      middlewares: [
        validateAndTransformBody(
          createBatchBody(AdminCreatePromotionRule, AdminUpdatePromotionRule),
        ),
        validateAndTransformQuery(
          AdminGetPromotionRuleParams,
          retrieveRuleTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/promotions/:id/buy-rules/batch",
      method: ["POST"],
      bodyParser: { sizeLimit: BATCH_ENDPOINTS_SIZE_LIMIT },
      middlewares: [
        validateAndTransformBody(
          createBatchBody(AdminCreatePromotionRule, AdminUpdatePromotionRule),
        ),
        validateAndTransformQuery(
          AdminGetPromotionRuleParams,
          retrieveRuleTransformQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/promotions/:id/:rule_type",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionRuleTypeParams,
          retrievePromotionQueryConfig,
        ),
      ],
    },
    {
      matcher: "/tenants/campaigns",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetCampaignsParams, listCampaignQueryConfig),
      ],
    },
    {
      matcher: "/tenants/campaigns",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateCampaign),
        validateAndTransformQuery(AdminGetCampaignParams, retrieveCampaignQueryConfig),
      ],
    },
    {
      matcher: "/tenants/campaigns/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(AdminGetCampaignParams, retrieveCampaignQueryConfig),
      ],
    },
    {
      matcher: "/tenants/campaigns/:id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminUpdateCampaign),
        validateAndTransformQuery(AdminGetCampaignParams, retrieveCampaignQueryConfig),
      ],
    },
    {
      matcher: "/tenants/campaigns/:id/promotions",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(createLinkBody()),
        validateAndTransformQuery(AdminGetCampaignParams, retrieveCampaignQueryConfig),
      ],
    },

    // ---- piece 7: content pages (/tenants/pages/**, /store/tenant/pages/**)
    // Only the write verbs need a middleware here: the two tenant reads take no
    // body, and their one query parameter (`locale`) is parsed in the route —
    // this resource has no Admin counterpart whose validator and query config
    // could be reused, and the contract's shape for the list is the reserved
    // five plus the tenant's own custom pages, not an Admin `count/offset/limit`
    // page. The public `/store/tenant/pages/**` reads sit behind the
    // framework's own global publishable-key gate and take neither body nor
    // query. `POST` (t05-page-keys) creates a custom page; `DELETE` removes one.
    {
      matcher: "/tenants/pages",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantPageSchema)],
    },
    {
      matcher: "/tenants/pages/:key",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantPageSchema)],
    },

    // ---- t10-blog: journal articles (/tenants/articles/**, /store/tenant/articles/**)
    // Same reasoning as the pages block above: only the write verbs take a
    // body. The two tenant reads parse their one optional `?locale=` in the
    // route (this resource has no Admin counterpart to borrow a query config
    // from), and the public `/store/tenant/articles/**` reads ride the
    // framework's own publishable-key gate on `/store/*`.
    {
      matcher: "/tenants/articles",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantArticleSchema)],
    },
    {
      matcher: "/tenants/articles/:slug",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantArticleSchema)],
    },

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

    // ---- t15-product-attributes: the shop's own product characteristics
    // (/tenants/product-attributes/**, /tenants/products/:id/attributes,
    // /store/tenant/product-attributes/**).
    //
    // Only the write verbs take a body. The reads parse their own one or two
    // query parameters in the route (this resource has no Admin counterpart to
    // borrow a query config from), and the public `/store/tenant/*` reads ride
    // the framework's own publishable-key gate on `/store/*`.
    {
      matcher: "/tenants/product-attributes",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantProductAttributeSchema)],
    },
    {
      matcher: "/tenants/product-attributes/:id",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantProductAttributeUpdateSchema)],
    },
    {
      matcher: "/tenants/products/:id/attributes",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantProductAttributeValuesSchema)],
    },

    // t06-locale-currency: the tenant's default storefront locale, its enabled
    // subset of the 36 shipped locales, and the country its default prices in.
    {
      matcher: "/tenants/locale-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantLocaleSettingsBody)],
    },

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
      matcher: "/tenants/seo-verification",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantSeoVerificationSchema)],
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

    // ---- t04-shipping-tariffs (day-2026-09-16): the shop's own delivery
    // methods (/tenants/shipping-methods/**, behind the "/tenants/*"
    // authenticate above) and the checkout's quote/regions reads
    // (/store/shipping-methods/**, behind the framework's publishable-key gate).
    // The static segments (settings, reorder, regions) are matched before the
    // ":id" routes by Medusa's router, so they never read as an id.
    {
      matcher: "/tenants/shipping-methods",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantShippingMethodSchema)],
    },
    {
      matcher: "/tenants/shipping-methods/reorder",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantShippingMethodsReorderSchema)],
    },
    {
      matcher: "/tenants/shipping-methods/settings",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantShippingSettingsSchema)],
    },
    {
      matcher: "/tenants/shipping-methods/regions",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(GetShippingRegionsSchema, {})],
    },
    {
      matcher: "/tenants/shipping-methods/:id",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantShippingMethodUpdateSchema)],
    },
    {
      matcher: "/store/shipping-methods/quote",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostStoreShippingQuoteSchema)],
    },
    {
      matcher: "/store/shipping-methods/regions",
      method: ["GET"],
      middlewares: [validateAndTransformQuery(GetShippingRegionsSchema, {})],
    },

    // ---- t09-reviews: product reviews. The tenant side rides the
    // "/tenants/*" authenticate above and needs a body schema for the one
    // write verb (`DELETE` takes none, the two reads take query parameters the
    // route parses itself). The storefront's read rides the framework's own
    // publishable-key gate; its POST needs a customer on top of that, so it
    // carries `authenticate("customer", …)` WITHOUT `allowUnauthenticated` —
    // an anonymous visitor gets a 401 rather than a review with no author
    // behind it.
    {
      matcher: "/tenants/reviews/:id",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantReviewSchema)],
    },
    {
      matcher: "/store/tenant/reviews",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(PostStoreReviewSchema),
      ],
    },
  ],
});
