import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import {
  deleteProductCategoriesWorkflow,
  updateProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { assertOwnedCategory, getTenantScope } from "../../tenant-scope";
import {
  assertHandleFree,
  getTenantEnabledLocales,
  recordSlugRedirect,
} from "../../redirect-helpers";

/**
 * `GET /tenants/product-categories/:id` — the Admin's retrieve, behind the
 * ownership check. A category the tenant does not own is a 404 with the same
 * wording a missing one gets, so the response never reveals that another
 * tenant's category exists.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedCategory(req, id);

  const {
    data: [category],
  } = await refetchEntities({
    entity: "product_category",
    idOrFilter: { id, ...req.filterableFields },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  if (!category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product category with id: ${id} was not found`,
    );
  }

  res.json({ product_category: category });
};

/**
 * `POST /tenants/product-categories/:id` — the Admin's update, behind the
 * ownership check. A `parent_category_id` in the body is checked the same way
 * `POST /tenants/product-categories` checks it: re-parenting is only allowed
 * inside the tenant's own tree. `null` is allowed (move to the root).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdateProductCategory>,
  res: MedusaResponse,
) => {
  const { id } = req.params;

  await assertOwnedCategory(req, id);

  const parentId = req.validatedBody.parent_category_id;

  if (parentId) {
    await assertOwnedCategory(req, parentId);
  }

  const newHandle = req.validatedBody.handle;
  let previousHandle: string | null = null;

  if (newHandle) {
    await assertHandleFree(req, "product_category", newHandle, id);

    const {
      data: [before],
    } = await refetchEntities({
      entity: "product_category",
      idOrFilter: { id },
      scope: req.scope,
      fields: ["handle"],
    });
    previousHandle = (before?.handle as string | undefined) ?? null;
  }

  await updateProductCategoriesWorkflow(req.scope).run({
    input: { selector: { id }, update: req.validatedBody },
  });

  if (previousHandle && newHandle && previousHandle !== newHandle) {
    const tenant = await getTenantScope(req);
    const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
    const locales = await getTenantEnabledLocales(tenantModuleService, tenant.id);
    await recordSlugRedirect(
      tenantModuleService,
      tenant.id,
      "categories",
      previousHandle,
      newHandle,
      locales,
    );
  }

  const {
    data: [category],
  } = await refetchEntities({
    entity: "product_category",
    idOrFilter: { id, ...req.filterableFields },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.status(200).json({ product_category: category });
};

/**
 * `DELETE /tenants/product-categories/:id` — the Admin's delete, behind the
 * ownership check, plus the link dismissal.
 *
 * The link is dismissed explicitly rather than left to Medusa's own cascade:
 * `deleteProductCategoriesWorkflow` emits the product-category deletion event
 * and the link module cleans links it knows about on that event, but a link row
 * left behind would make `listTenantCategoryIds` report an id whose row is gone,
 * and every route here would then 404 on its own id. Dismissing first keeps the
 * two stores consistent whichever way the cascade behaves.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedCategory(req, id);

  const tenant = await getTenantScope(req);
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK);

  await link.dismiss({
    [TENANT_MODULE]: { tenant_id: tenant.id },
    [Modules.PRODUCT]: { product_category_id: id },
  });

  await deleteProductCategoriesWorkflow(req.scope).run({
    input: [id],
  });

  res.status(200).json({
    id,
    object: "product_category",
    deleted: true,
  });
};
