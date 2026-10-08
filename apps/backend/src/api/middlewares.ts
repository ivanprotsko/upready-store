import { attachOrderAccessToken, ensureCartTenantScope } from "./store/cart-scope";
import {
  ensureOrderAccess,
  ensureReturnOrderAccess,
  guardOrderTransferRequest,
  scopeOrderListToShop,
} from "./store/order-access";
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
import { listTransformQueryConfig as listStoreCollectionConfig } from "@medusajs/medusa/api/store/collections/query-config";
import { StoreGetCollectionsParams } from "@medusajs/medusa/api/store/collections/validators";
import { MedusaError } from "@medusajs/framework/utils";
import { adminUploadRoutesMiddlewares } from "@medusajs/medusa/api/admin/uploads/middlewares";
import { TENANT_ACTOR_TYPE } from "../modules/tenant";
import {
  PostTenantCreateSchema,
  PostTenantDomainSchema,
  PutTenantApishipKeySchema,
  PutTenantDeliverySettingsSchema,
  PutTenantPochtaSchema,
  PutTenantTributeSchema,
  PutTenantBtcpaySchema,
  PutTenantBitcartSchema,
  PutTenantX402Schema,
  PutTenantTelegramBotSchema,
  PutTenantPaymentSettingsSchema,
  PutTenantManualPaymentSchema,
  PutTenantPaymentPreNoticeSchema,
  PutTenantNotificationSettingsSchema,
  PutTenantRequisitesSchema,
  PostTenantHandleSchema,
  PostTenantArticleSchema,
  PostTenantPageSchema,
  PostTenantRedirectSchema,
  PutTenantRedirectSchema,
  PutTenantBrandingSchema,
  PutTenantLoginSettingsSchema,
  PutTenantSeoVerificationSchema,
  PutTenantAnalyticsSchema,
  PostTenantSiteSchema,
  PutTenantHreflangSistersSchema,
  PostTenantSwitchShopSchema,
  PostTenantStaffCreateSchema,
  PostTenantStaffUpdateSchema,
  PostTenantUpdateProductSchema,
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
  PostTenantZonePresetsSchema,
} from "./tenants/shipping-methods/validators";
// ---- t09-reviews: moderation body (tenant side) and the storefront's form.
import { PostTenantReviewSchema } from "./tenants/reviews/validators";
import { PostStoreReviewSchema } from "./store/tenant/reviews/validators";
// ---- t-cherk-32: the wishlist's one write body (`DELETE` takes none).
import { PostStoreWishlistSchema } from "./store/wishlist/validators";
// ---- t-2026-10-03-32 (rule 5zd): the pre-payment notice's charge estimate.
import { PostStoreChargeEstimateSchema } from "./store/payment-settings/charge-estimate/validators";
// ---- t-cherk-com-hotfix batch 5: the owner rejects a buyer's payment receipt.
import { PostTenantRejectPaymentReceiptSchema } from "./tenants/orders/validators";
// ---- o24-courses: course/lesson CRUD bodies (tenant side, panel editor).
import {
  PostTenantCourseSchema,
  PutTenantCourseSchema,
  PostTenantLessonSchema,
  PutTenantLessonSchema,
  PostTenantLessonsReorderSchema,
} from "./tenants/courses/validators";
// ---- piece 8: the home-page document body schema (zod for theme/content;
// `settings` is checked by store/storefront-settings/validation.ts inside it).
import { PutTenantHomeBody } from "./tenants/home/validators";
import {
  PostTenantProductAttributeSchema,
  PostTenantProductAttributeUpdateSchema,
  PostTenantProductAttributeValuesSchema,
} from "./tenants/product-attributes/validators";
import { PutTenantProductTranslationBody } from "./tenants/products/translations-validators";
import { PutTenantLocaleSettingsBody } from "./tenants/locale-settings/validators";
import {
  PostTenantWbFeedbackAnswerSendBody,
  PutTenantWbFeedbackAnswerBody,
} from "./tenants/wb/feedback-answers/validators";
import { PutTenantWbWriteSettingsBody } from "./tenants/wb/write-settings/validators";
import { PutTenantMarketplaceKeyBody } from "./tenants/marketplaces/[marketplace]/key/validators";
import { PutTenantWbWritePreviewBody } from "./tenants/wb/write-preview/validators";
import { PostTenantMpCatalogLinkBody } from "./tenants/marketplaces/catalog/links/validators";
import { PostTenantWbFbsActionBody } from "./tenants/wb/fbs-orders/validators";
import { PostTenantSeedBody } from "./tenants/seed/validators";
import {
  AdminGetTenantsParams,
  DeleteAdminTenantParams,
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
  PostAdminTenantUpdateSchema,
} from "./admin/tenants/validators";
import { PostAdminPlatformPricingSchema } from "../modules/platform-pricing/schema";
import { blockArchivedTenantLogin } from "./tenants/archived-tenant-gate";
import { guardTenantAdmin } from "./tenants/tenant-admin-gate";
import { requireOwnerPasswordLength } from "./auth/password-length-gate";
import { gateBuyerEmailpassAuth, gateBuyerYandexAuth } from "./tenants/login-settings/login-method-gate";
import { guardSyntheticTelegramEmail } from "./store/customers/synthetic-email-guard";
import { resolveTelegramTenant } from "./auth/telegram-tenant";
import { injectRobokassaTenant } from "./store/tenant/robokassa";
import { injectTributeTenant } from "./store/tenant/tribute";
import { injectBtcpayTenant } from "./store/tenant/btcpay";
import { injectBitcartTenant } from "./store/tenant/bitcart";
import { injectX402Tenant } from "./store/tenant/x402";
import { PostStoreX402PurchaseSchema } from "./store/x402/validators";
import { injectCustomerTenantMetadata } from "./store/customers/inject-tenant-metadata";
import { stripCustomerTenantMetadata } from "./store/customers/strip-tenant-metadata";
import { guardRequestedFields } from "./field-guard";
import { allowStoreMetadataOnAnswer } from "./store-metadata";
import { rateLimit } from "./rate-limit";
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
    { matcher: "/store/*", middlewares: [guardRequestedFields, allowStoreMetadataOnAnswer] },
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
    // platform staff (actor `user`) get the same 12-character floor as
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
    {
      // The owner ties one marketplace card to one variant of her shop by hand
      // (w14-mp-catalog-link). This is the answer to «требует выбора», the one
      // outcome no rule is allowed to decide.
      matcher: "/tenants/marketplaces/catalog/links",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantMpCatalogLinkBody)],
    },
    // w24-integration-keys-self-service: the shop owner stores her OWN key for
    // every marketplace. Three matchers, ONE schema and one handler family —
    // the general route plus the two per-marketplace paths this repository
    // already uses (`/tenants/wb/*`, `/tenants/ozon/*`). WHICH fields are
    // required comes from the adapter, not from a schema written per
    // marketplace (rule 20).
    {
      matcher: "/tenants/marketplaces/:marketplace/key",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
    },
    {
      matcher: "/tenants/wb/key",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
    },
    {
      matcher: "/tenants/ozon/key",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
    },
    {
      // p01-settings-integrations-restructure: the shop's ApiShip token. Not a
      // marketplace adapter, so it cannot ride the registry-driven matcher
      // above; it shares the slot writer instead of the schema.
      matcher: "/tenants/apiship/key",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantApishipKeySchema)],
    },
    {
      // The shop's Russian Post «Отправка» access (46df-pochta).
      matcher: "/tenants/pochta",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantPochtaSchema)],
    },
    {
      // The shop's Tribute Shop API key (t-cherk-22).
      matcher: "/tenants/tribute",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantTributeSchema)],
    },
    {
      // Tribute's per-shop webhook (t-cherk-22): `trbt-signature` is an
      // HMAC-SHA256 of the RAW body, so the exact bytes have to survive past
      // JSON parsing (`req.rawBody`) — a re-serialization of the parsed object
      // could differ in key order or whitespace and reject a genuine webhook.
      matcher: "/tribute/webhook/:tenant",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
      middlewares: [],
    },
    {
      // The shop's own Telegram bot for buyer sign-in (t-2026-10-02-telegram-auth).
      matcher: "/tenants/telegram-bot",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantTelegramBotSchema)],
    },
    {
      // The shop's payment account (t03-tenant-secrets-robokassa).
      matcher: "/tenants/payment-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantPaymentSettingsSchema)],
    },
    {
      // The shop's offline ways to pay on `pp_system_default`: crypto wallets
      // and «card via manager» (olavka-payments).
      matcher: "/tenants/payment-settings/manual",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantManualPaymentSchema)],
    },
    {
      // The shop's own BTCPay Server store (ask-20261005-070255-438f).
      matcher: "/tenants/payment-settings/btcpay",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantBtcpaySchema)],
    },
    {
      // The shop's own Bitcart store (ask-20261005-070255-438f, stage 2).
      matcher: "/tenants/payment-settings/bitcart",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantBitcartSchema)],
    },
    {
      // The shop's x402 settings (t-2026-10-03-33).
      matcher: "/tenants/payment-settings/x402",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantX402Schema)],
    },
    {
      // An AI agent's x402 purchase (t-2026-10-03-33). Each unpaid request
      // quotes on a real cart, so a client gets 30 a minute.
      matcher: "/store/x402/purchase",
      method: ["POST"],
      middlewares: [rateLimit({ limit: 30 }), validateAndTransformBody(PostStoreX402PurchaseSchema)],
    },
    {
      // BTCPay's per-shop webhook (ask-20261005-070255-438f): `BTCPay-Sig` is
      // an HMAC-SHA256 of the RAW body, so the exact bytes have to survive JSON
      // parsing (`req.rawBody`), for the reason the Tribute webhook gives above.
      matcher: "/btcpay/webhook/:tenant",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
      middlewares: [],
    },
    {
      // The pre-payment notice's per-method fields (rule 5zd, t-2026-10-03-32).
      matcher: "/tenants/payment-settings/pre-notice",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantPaymentPreNoticeSchema)],
    },
    {
      // The shop's CDEK account and the delivery kinds it offers
      // (i02-apiship-cdek-shipping).
      matcher: "/tenants/delivery-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantDeliverySettingsSchema)],
    },
    {
      // Who hears about this shop's orders (t08-order-notifications).
      matcher: "/tenants/notification-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantNotificationSettingsSchema)],
    },
    {
      // The seller's legal details, resolved into this shop's `{{ТОКЕН}}`
      // placeholders (t12-legal-requisites).
      matcher: "/tenants/requisites",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantRequisitesSchema)],
    },
    {
      // Robokassa, Tribute, BTCPay, Bitcart and x402 all need the SERVER's word
      // on which shop the cart belongs to; the client's `data.tenant_id`, if
      // any, is overwritten (step 4 of the task; t-cherk-22 for Tribute;
      // ask-20261005-070255-438f for BTCPay and Bitcart; t-2026-10-03-33 for
      // x402). Each middleware is a no-op unless `body.provider_id` is its own,
      // so they compose cleanly.
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [
        injectRobokassaTenant,
        injectTributeTenant,
        injectBtcpayTenant,
        injectBitcartTenant,
        injectX402Tenant,
      ],
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
        // The Admin's `AdminUpdateProduct` plus `site_scope` (t-2026-09-24-n12).
        validateAndTransformBody(PostTenantUpdateProductSchema),
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
      // t-cherk-com-hotfix batch 5: answers the order, like `/cancel`.
      matcher: "/tenants/orders/:id/payment-receipt/reject",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(PostTenantRejectPaymentReceiptSchema),
        validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
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
    // b08-seo-storefront: the same public read for collections. A collection
    // carries no sales-channel link, so `/store/collections` answers with every
    // shop's; this one lists only the collections the tenant's own products sit
    // in (`api/store/tenant/collections/route.ts`).
    {
      matcher: "/store/tenant/collections",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(StoreGetCollectionsParams, listStoreCollectionConfig),
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

    // ---- t10-blog / b18-blog-full: journal articles
    // (/tenants/articles/**, /tenants/article-categories,
    //  /store/tenant/articles/**, /store/tenant/article-categories)
    // The two category reads take no body and no parameter at all, so they are
    // not listed here: the owner's one rides the "/tenants/*" authenticate
    // above, the visitor's one the framework's publishable-key gate on
    // "/store/*". They are their own paths rather than
    // "/tenants/articles/categories" because that sits inside the ":slug"
    // route's space, and a rubric is not an article.
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

    // t-cherk-37: one locale of a product's own title/subtitle/description,
    // option titles and variant titles.
    {
      matcher: "/tenants/products/:id/translations",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantProductTranslationBody)],
    },

    // t06-locale-currency: the tenant's default storefront locale, its enabled
    // subset of the 36 shipped locales, and the country its default prices in.
    {
      matcher: "/tenants/locale-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantLocaleSettingsBody)],
    },

    // w20-wb-write-core: the owner's two gates (the write switch and the
    // per-class consents). GET takes no middleware — it only reads rows the
    // tenant already owns.
    {
      matcher: "/tenants/wb/write-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantWbWriteSettingsBody)],
    },

    // w21-wb-write-stocks-prices: "что изменится на WB". GET takes no
    // middleware — it parses its own three query parameters (the route says
    // why) and reads only rows this tenant already owns. PUT changes one
    // thing and it is not a mutation of Wildberries: which WB seller
    // warehouse a stock location of the shop stands for.
    {
      matcher: "/tenants/wb/write-preview",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantWbWritePreviewBody)],
    },

    // w22-wb-write-feedback-answers: drafts for reviews and questions, and the
    // one dispatch of this task. GET takes no middleware — it reads rows the
    // tenant already owns. The POST body carries the per-ANSWER confirmation
    // (a sha256 of the text the dialog quoted); the route compares it against
    // the stored draft, which is a check no validator can do.
    {
      matcher: "/tenants/wb/feedback-answers",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantWbFeedbackAnswerBody)],
    },
    {
      matcher: "/tenants/wb/feedback-answers/send",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantWbFeedbackAnswerSendBody)],
    },

    // w23-wb-write-fbs-orders: «Собрать» / «Отменить» / «Передать в доставку».
    // The body names an ACTION and the orders it applies to, never a method or
    // a path; the mutations come from the write registry. GET of the desk
    // takes no middleware — it only reads this tenant's own mirror.
    {
      matcher: "/tenants/wb/fbs-orders/actions",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantWbFbsActionBody)],
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
      // b10-panel-gaps: editing one rule in place, so the owner's screen can fix
      // a target without dropping the rule and re-typing its source path.
      matcher: "/tenants/redirects/:id",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantRedirectSchema)],
    },
    {
      matcher: "/tenants/seo-verification",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantSeoVerificationSchema)],
    },
    // t17-analytics: the shop's own Yandex Metrica / GA4 ids, plus the
    // read-only sales summary computed from the tenant's own orders
    // (`GET /tenants/analytics/summary`, no body to validate).
    {
      matcher: "/tenants/analytics",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantAnalyticsSchema)],
    },
    // t16-owner-branding: logo/favicon/og-image/primary-colour/footer-credit.
    // The upload route reuses the same multipart middlewares as
    // `/tenants/uploads` (`adminUploadPostMiddlewares`, defined above).
    {
      matcher: "/tenants/branding",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantBrandingSchema)],
    },
    {
      matcher: "/tenants/branding/upload",
      method: ["POST"],
      middlewares: adminUploadPostMiddlewares,
    },
    // o25-login-methods: email/Yandex ID/both, per shop.
    {
      matcher: "/tenants/login-settings",
      method: ["PUT"],
      middlewares: [validateAndTransformBody(PutTenantLoginSettingsSchema)],
    },
    // Enforcement, not only UI (o25-login-methods, see the doc comment in
    // `login-method-gate.ts` for why each flow is resolved differently). Both
    // gates run BEFORE Medusa's own auth handler for the same route, the same
    // shape `blockArchivedTenantLogin` uses on `/auth/tenant/emailpass` above.
    {
      matcher: "/auth/customer/emailpass",
      method: ["POST"],
      middlewares: [gateBuyerEmailpassAuth],
    },
    {
      matcher: "/auth/customer/emailpass/register",
      method: ["POST"],
      middlewares: [gateBuyerEmailpassAuth],
    },
    {
      matcher: "/auth/customer/emailpass/reset-password",
      method: ["POST"],
      middlewares: [gateBuyerEmailpassAuth],
    },
    {
      matcher: "/auth/customer/emailpass/update",
      method: ["POST"],
      middlewares: [gateBuyerEmailpassAuth],
    },
    {
      matcher: "/auth/customer/yandex",
      method: ["POST"],
      middlewares: [gateBuyerYandexAuth],
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
    // t-2026-09-25-08: the platform pricing page. Staff auth is the default
    // `/admin/*` middleware; the body is the whole page, checked by the one
    // schema the public read (`GET /platform/pricing`, no entry here: no auth,
    // no key, nothing to validate) parses the stored row with.
    {
      matcher: "/admin/platform-pricing",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminPlatformPricingSchema)],
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
      // b03-shipping-zones-weight: one method per Russian zone in a single call.
      matcher: "/tenants/shipping-methods/zone-presets",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantZonePresetsSchema)],
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
    {
      // The pre-payment notice's «≈ amount» (rule 5zd, t-2026-10-03-32).
      matcher: "/store/payment-settings/charge-estimate",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostStoreChargeEstimateSchema)],
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

    // ---- t-cherk-32: the wishlist. Every verb needs a customer behind the
    // call — there is no guest server state, only the browser's own
    // localStorage (merged in on sign-in, `lib/data/customer.ts` on the
    // storefront) — so all three carry `authenticate("customer", …)` WITHOUT
    // `allowUnauthenticated`.
    {
      matcher: "/store/wishlist",
      method: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/wishlist",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(PostStoreWishlistSchema),
      ],
    },
    {
      matcher: "/store/wishlist/:product_id",
      method: ["DELETE"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },

    // ---- o24-courses: online courses. The tenant side rides the
    // "/tenants/*" authenticate above and needs a body schema for every write
    // verb. The storefront's course-page read allows an anonymous visitor
    // (every lesson comes back locked); every other storefront route needs a
    // customer, checked again for entitlement inside the route itself.
    {
      matcher: "/tenants/courses",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantCourseSchema)],
    },
    {
      matcher: "/tenants/courses/:id",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PutTenantCourseSchema)],
    },
    {
      matcher: "/tenants/courses/:id/lessons",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantLessonSchema)],
    },
    {
      matcher: "/tenants/courses/:id/lessons/:lessonId",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PutTenantLessonSchema)],
    },
    {
      matcher: "/tenants/courses/:id/lessons/reorder",
      method: ["POST"],
      middlewares: [validateAndTransformBody(PostTenantLessonsReorderSchema)],
    },
    {
      matcher: "/store/tenant/courses",
      method: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })],
    },
    {
      // t-cherk-com-hotfix batch 3: the buyer's receipt for a card transfer, multipart like `/tenants/uploads`.
      matcher: "/store/tenant/orders/:id/payment-receipt",
      method: ["POST"],
      middlewares: adminUploadPostMiddlewares,
    },
    {
      matcher: "/store/tenant/courses/mine",
      method: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/tenant/courses/mine/:slug",
      method: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/tenant/courses/:id/lessons/:lessonId",
      method: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/tenant/courses/:id/lessons/:lessonId/viewed",
      method: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },

    // ---- f03-guest-order-not-in-account: the buyer takes over the orders
    // this shop holds under their own address. It carries no body, so there is
    // nothing to validate; what it needs is a customer behind the call, and
    // the shop, which the framework's publishable-key gate has already put on
    // the request by the time the route runs.
    {
      matcher: "/store/customers/me/claim-orders",
      method: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },

    // ---- t-2026-10-02-shop-aware-account-emails: this is the one request
    // that ever learns which shop a buyer signed up in (no customer↔tenant
    // link exists). The publishable key behind it is written into
    // `metadata.tenant_id`, for `customer-created.ts`'s welcome letter to read.
    {
      matcher: "/store/customers",
      method: ["POST"],
      middlewares: [injectCustomerTenantMetadata],
    },
    // The lead's security review of the same task: `metadata.tenant_id` now
    // decides where a password-reset link points
    // (`password-reset-email.ts` reads it off the CUSTOMER row, never off the
    // request), so the buyer's own "update my profile" call must not be able
    // to set it to a shop they do not belong to.
    {
      matcher: "/store/customers/me",
      method: ["POST"],
      middlewares: [stripCustomerTenantMetadata],
    },

    // ---- w02-yandex-id-auth: the buyer who already has an account signs in
    // with Yandex ID for the first time. The token this runs with is the one
    // the OAuth callback issued, and it carries NO customer yet
    // (`actor_id` empty), which is exactly what `allowUnregistered` admits —
    // the same setting Medusa's own `POST /store/customers` uses for the
    // registration leg of email-and-password signup.
    {
      matcher: "/store/customers/oauth-link",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["bearer"], { allowUnregistered: true }),
      ],
    },

    // ---- t-2026-10-02-telegram-auth. `/me/telegram-link`: a buyer already
    // signed in by e-mail attaches Telegram as a second way in. The synthetic
    // `tg_<id>@telegram.local` address is reserved for the Telegram identity
    // with that id, on both legs that could otherwise claim it first.
    {
      matcher: "/store/customers/me/telegram-link",
      method: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    // t-cherk-23. The cart a buyer filled in the shop's bot. The proof is the
    // Mini App's `initData` in the body, so a call with no session is let
    // through. A session is read only to refuse another customer's.
    {
      matcher: "/store/telegram-bot/cart",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
      ],
    },
    {
      matcher: "/store/customers",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], { allowUnregistered: true }),
        guardSyntheticTelegramEmail,
      ],
    },
    {
      matcher: "/auth/customer/emailpass/register",
      method: ["POST"],
      middlewares: [guardSyntheticTelegramEmail],
    },
    {
      matcher: "/auth/customer/telegram",
      method: ["GET", "POST"],
      middlewares: [resolveTelegramTenant],
    },

    // ---- b07-store-api-isolation: the Store API stops handing one shop's
    // orders to another shop's key, and one buyer's order to anybody holding
    // its id. The checks live next to the data they guard
    // (`store/order-access.ts`, `store/cart-scope.ts`); what is registered
    // here is where each one runs.
    //
    // They are middlewares rather than routes of our own because the core
    // handlers are a few lines each around a core-flows workflow, and a
    // project middleware runs AFTER the framework's own for the same path, so
    // `req.queryConfig`, `req.filterableFields` and `req.validatedBody` are
    // all populated by the time they see the request.
    //
    // `GET /store/orders/:id` carries NO authenticate in core, so
    // `req.auth_context` was never populated and the route could not tell an
    // owner from a stranger even if it wanted to. `allowUnauthenticated` is
    // what keeps the guest confirmation page reachable: an anonymous call is
    // let through to `ensureOrderAccess`, which then demands the order's
    // access token.
    {
      matcher: "/store/orders/:id",
      method: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
        ensureOrderAccess,
      ],
    },
    {
      matcher: "/store/orders",
      method: ["GET"],
      middlewares: [scopeOrderListToShop],
    },
    {
      matcher: "/store/orders/:id/transfer/request",
      method: ["POST"],
      middlewares: [guardOrderTransferRequest],
    },
    // `POST /store/returns` takes an `order_id` out of the body and completes
    // a return against it, with no authentication in core at all.
    {
      matcher: "/store/returns",
      method: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        ensureReturnOrderAccess,
      ],
    },
    // Every `/store/carts/:id…` route, read and write: the cart has to belong
    // to the shop whose publishable key the call carries.
    {
      matcher: "/store/carts/*",
      method: "ALL",
      middlewares: [ensureCartTenantScope],
    },
    // The one place the guest access token is handed out.
    {
      matcher: "/store/carts/:id/complete",
      method: ["POST"],
      middlewares: [attachOrderAccessToken],
    },
  ],
});
