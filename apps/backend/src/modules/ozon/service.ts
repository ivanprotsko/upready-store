import { MedusaService } from "@medusajs/framework/utils";
import OzonApiCall from "./models/ozon-api-call";
import OzonPosting from "./models/ozon-posting";
import OzonPrice from "./models/ozon-price";
import OzonProduct from "./models/ozon-product";
import OzonQuestion from "./models/ozon-question";
import OzonReview from "./models/ozon-review";
import OzonStock from "./models/ozon-stock";
import OzonSyncRun from "./models/ozon-sync-run";

class OzonModuleService extends MedusaService({
  OzonProduct,
  OzonPrice,
  OzonStock,
  OzonPosting,
  OzonReview,
  OzonQuestion,
  OzonSyncRun,
  OzonApiCall,
}) {}

export default OzonModuleService;
