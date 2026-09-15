import { MedusaService } from "@medusajs/framework/utils";
import WbAnalyticsDaily from "./models/wb-analytics-daily";
import WbApiCall from "./models/wb-api-call";
import WbFbsOrder from "./models/wb-fbs-order";
import WbFeedback from "./models/wb-feedback";
import WbOrder from "./models/wb-order";
import WbPrice from "./models/wb-price";
import WbProduct from "./models/wb-product";
import WbQuestion from "./models/wb-question";
import WbSale from "./models/wb-sale";
import WbStock from "./models/wb-stock";
import WbSupply from "./models/wb-supply";
import WbSyncRun from "./models/wb-sync-run";

class WbModuleService extends MedusaService({
  WbProduct,
  WbPrice,
  WbStock,
  WbOrder,
  WbFbsOrder,
  WbSupply,
  WbSale,
  WbFeedback,
  WbQuestion,
  WbAnalyticsDaily,
  WbSyncRun,
  WbApiCall,
}) {}

export default WbModuleService;
