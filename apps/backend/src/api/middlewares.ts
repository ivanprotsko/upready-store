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
import { listTransformQueryConfig as listStockLocationQueryConfig } from "@medusajs/medusa/api/admin/stock-locations/query-config";
import { AdminGetStockLocationsParams } from "@medusajs/medusa/api/admin/stock-locations/validators";
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
import { listTransformQueryConfig as listShippingProfileQueryConfig } from "@medusajs/medusa/api/admin/shipping-profiles/query-config";
import { AdminGetShippingProfilesParams } from "@medusajs/medusa/api/admin/shipping-profiles/validators";
import { retrieveTransformQueryConfig as retrieveStoreQueryConfig } from "@medusajs/medusa/api/admin/stores/query-config";
import { AdminGetStoreParams } from "@medusajs/medusa/api/admin/stores/validators";
import { MedusaError } from "@medusajs/framework/utils";
import { adminUploadRoutesMiddlewares } from "@medusajs/medusa/api/admin/uploads/middlewares";
import { TENANT_ACTOR_TYPE } from "../modules/tenant";
import {
  PostTenantCreateSchema,
  PostTenantUpdateMeSchema,
  PostTenantUpdatePasswordSchema,
  TenantGetProductOptionsParams,
} from "./tenants/validators";

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

    // ---- piece 3: orders export (/tenants/orders/export)

    // ---- piece 5: categories (/tenants/product-categories/**)

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

    // ---- piece 8: home page document (/tenants/home, /store/tenant/home)

    // ---- piece 9: storefront by host (/tenants/domains/**, /storefront/by-host)
  ],
});
