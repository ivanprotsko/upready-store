import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { retrieveProductCategoryConfig } from "@medusajs/medusa/api/admin/product-categories/query-config";
import {
  AdminCreateProductCategory,
  AdminProductCategoryParams,
  AdminUpdateProductCategory,
} from "@medusajs/medusa/api/admin/product-categories/validators";
import { createLinkBody } from "@medusajs/medusa/api/utils/validators";
import { applyCategoryFilters as applyStoreCategoryFilters } from "@medusajs/medusa/api/store/product-categories/helpers";
import { listProductCategoryConfig as listStoreProductCategoryConfig } from "@medusajs/medusa/api/store/product-categories/query-config";
import { StoreProductCategoriesParams } from "@medusajs/medusa/api/store/product-categories/validators";
import { listTransformQueryConfig as listStoreCollectionConfig } from "@medusajs/medusa/api/store/collections/query-config";
import { StoreGetCollectionsParams } from "@medusajs/medusa/api/store/collections/validators";

/**
 * Product categories, and the storefront's public reads of the shop's
 * categories and collections.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const categoryRoutes: MiddlewareRoute[] = [
  // ---- piece 5: categories (/tenants/product-categories/**)
  // `GET /tenants/product-categories` keeps the matcher the first wave wired
  // in `panel-lists.ts` (AdminProductCategoriesParams + listProductCategoryConfig); only the
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
];
