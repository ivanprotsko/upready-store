import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import {
  listOptionConfig,
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
  AdminCreateProductVariant,
  AdminCreateVariantInventoryItem,
  AdminGetProductOptionsParams,
  AdminGetProductParams,
  AdminGetProductVariantParams,
  AdminLinkProductOptions,
  AdminUpdateProductVariant,
  AdminUpdateVariantInventoryItem,
  CreateProductVariant,
} from "@medusajs/medusa/api/admin/products/validators";
import { listProductVariantQueryConfig } from "@medusajs/medusa/api/admin/product-variants/query-config";
import { AdminGetProductVariantsParams } from "@medusajs/medusa/api/admin/product-variants/validators";
import { AdminBatchInventoryItemLevels } from "@medusajs/medusa/api/admin/inventory-items/validators";
import { createBatchBody } from "@medusajs/medusa/api/utils/validators";
import { listTransformQueryConfig as listStockLocationQueryConfig } from "@medusajs/medusa/api/admin/stock-locations/query-config";
import { AdminGetStockLocationsParams } from "@medusajs/medusa/api/admin/stock-locations/validators";
import { PostTenantUpdateProductSchema } from "../tenants/validators";
import { adminUploadPostMiddlewares } from "./shared";

/**
 * The catalogue import upload, then product detail with its variants, options
 * and their inventory.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const productRoutes: MiddlewareRoute[] = [
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
];
