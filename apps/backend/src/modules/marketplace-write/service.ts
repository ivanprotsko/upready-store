import { MedusaService } from "@medusajs/framework/utils";
import MarketplaceWriteAudit from "./models/marketplace-write-audit";
import MarketplaceWriteConsent from "./models/marketplace-write-consent";
import MarketplaceWriteSetting from "./models/marketplace-write-setting";

class MarketplaceWriteModuleService extends MedusaService({
  MarketplaceWriteAudit,
  MarketplaceWriteConsent,
  MarketplaceWriteSetting,
}) {}

export default MarketplaceWriteModuleService;
