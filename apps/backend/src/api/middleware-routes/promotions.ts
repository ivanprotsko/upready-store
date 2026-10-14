import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
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

/**
 * The Admin's three promotion rule batch routes raise the body size limit to
 * `DEFAULT_BATCH_ENDPOINTS_SIZE_LIMIT`, which is the literal "2mb"
 * (`@medusajs/medusa/dist/utils/middlewares/index.js`). That module is not on the
 * package's export map, so the value is written out here rather than imported
 * from a path that is not a public entry point.
 */
const BATCH_ENDPOINTS_SIZE_LIMIT = "2mb";

/**
 * Promotions and campaigns.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const promotionRoutes: MiddlewareRoute[] = [
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
];
