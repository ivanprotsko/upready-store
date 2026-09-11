import { defineLink } from "@medusajs/framework/utils";
import PromotionModule from "@medusajs/medusa/promotion";
import TenantModule from "../modules/tenant";

/** Which tenant created a campaign; ownership for `/tenants/campaigns*`. */
export default defineLink(TenantModule.linkable.tenant, {
  linkable: PromotionModule.linkable.campaign.id,
  isList: true,
});
