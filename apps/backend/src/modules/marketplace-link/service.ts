import { MedusaService } from "@medusajs/framework/utils";
import ProductMarketplaceLink from "./models/product-marketplace-link";

class MarketplaceLinkModuleService extends MedusaService({
  ProductMarketplaceLink,
}) {}

export default MarketplaceLinkModuleService;
