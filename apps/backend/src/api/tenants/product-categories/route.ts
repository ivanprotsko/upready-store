import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import createTenantProductCategoryWorkflow from "../../../workflows/tenant/create-tenant-product-category";
import {
  assertOwnedCategory,
  emptyPage,
  getTenantScope,
  listTenantCategoryIds,
  scopeIdFilter,
} from "../tenant-scope";

/**
 * `GET /tenants/product-categories` — the categories the tenant owns, in the
 * Admin's list shape (`product_categories`, `count`, `offset`, `limit`), so the
 * panel renders the Admin's own category list and category combobox unchanged.
 *
 * This replaces the re-export of the Admin's handler that the first wave put
 * here as global reference data. Categories carry no sales channel and no owner
 * column, so the tenant-product-category link is the whole ownership record:
 * the tenant's own ids come from it and are intersected with any `id` the caller
 * asked for. An empty intersection answers an empty page rather than handing an
 * undefined `id` to the query, which would be no filter at all and would list
 * every category on the backend.
 *
 * The Admin's tree parameters keep working inside the owned set:
 * `parent_category_id` and `include_descendants_tree`/`include_ancestors_tree`
 * reach `req.filterableFields` from the Admin's own validator and are passed
 * through untouched. A category created by the staff Admin is nobody's and is
 * therefore absent from every tenant's list; that is the point of the link.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantCategoryIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ product_categories: [], ...emptyPage(req) });
    return;
  }

  const { data: product_categories, metadata } = await refetchEntities({
    entity: "product_category",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    product_categories,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};

/**
 * `POST /tenants/product-categories` — creates a category and links it to the
 * tenant. Body: the Admin's `AdminCreateProductCategory`.
 *
 * `parent_category_id` is checked against the tenant's own ids first, so a
 * tenant cannot hang its tree under another tenant's node (or under a staff
 * category, which would put one of its children in nobody's hands). A foreign
 * parent is the same 404 a missing one would be.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateProductCategory>,
  res: MedusaResponse,
) => {
  const parentId = req.validatedBody.parent_category_id;

  if (parentId) {
    await assertOwnedCategory(req, parentId);
  }

  const tenant = await getTenantScope(req);

  const { result } = await createTenantProductCategoryWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      product_category: req.validatedBody,
    },
  });

  const {
    data: [category],
  } = await refetchEntities({
    entity: "product_category",
    idOrFilter: { id: result.product_category.id, ...req.filterableFields },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.status(200).json({ product_category: category });
};
