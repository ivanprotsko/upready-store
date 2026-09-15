import { MedusaService } from "@medusajs/framework/utils";
import MpApiCall from "./models/mp-api-call";
import MpLink from "./models/mp-link";
import MpOffer from "./models/mp-offer";
import MpOrder from "./models/mp-order";
import MpOrderLine from "./models/mp-order-line";
import MpProduct from "./models/mp-product";
import MpQuestion from "./models/mp-question";
import MpReview from "./models/mp-review";
import MpSyncRun from "./models/mp-sync-run";

class MarketplaceModuleService extends MedusaService({
  MpProduct,
  MpOffer,
  MpOrder,
  MpOrderLine,
  MpReview,
  MpQuestion,
  MpLink,
  MpSyncRun,
  MpApiCall,
}) {}

export default MarketplaceModuleService;
