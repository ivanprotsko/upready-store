import { MedusaService } from "@medusajs/framework/utils";
import ProductReview from "./models/product-review";

class ProductReviewModuleService extends MedusaService({
  ProductReview,
}) {}

export default ProductReviewModuleService;
