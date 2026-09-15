import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";
import { assertOwnedCategory, getTenantScope } from "../tenant-scope";
import { listAttributeDtos } from "./attribute-dto";
import {
  ATTRIBUTE_REFERENCE,
  OPTION_REFERENCE,
  writeTranslations,
} from "./helpers";
import type { PostTenantProductAttributeBody } from "./validators";

/**
 * `GET /tenants/product-attributes` — the owner's own schema of product
 * characteristics: every row, its choices and its translations, in the order
 * the owner put them in.
 *
 * Scope is the tenant behind the token (`getTenantScope`), never a query
 * parameter, so this list cannot widen to a neighbour's schema. `?category_id=`
 * narrows to the characteristics declared on one category; the catalog-wide
 * ones (`category_id` null) come back with it, because they apply there too.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const attributes = await listAttributeDtos(req.scope, scope.id);

  const categoryId = typeof req.query.category_id === "string" ? req.query.category_id : null;
  const filtered = categoryId
    ? attributes.filter(
        (attribute) => attribute.category_id === null || attribute.category_id === categoryId,
      )
    : attributes;

  res.json({ product_attributes: filtered, count: filtered.length });
};

/**
 * `POST /tenants/product-attributes` — declares one characteristic.
 *
 * `key` is checked for a duplicate before the insert so the panel gets one
 * clear message rather than a constraint error, and `category_id` is checked
 * against the tenant's own categories: pointing a characteristic at a
 * neighbour's category would leak that the category exists.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantProductAttributeBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const body = req.validatedBody;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenantProductAttributes({
    tenant_id: scope.id,
    key: body.key,
  });

  if (existing) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: characteristic "${body.key}" already exists`,
    );
  }

  if (body.category_id) {
    await assertOwnedCategory(req, body.category_id);
  }

  if (body.type === "select" && !body.options?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a choice characteristic needs at least one choice",
    );
  }

  const created = await tenantModuleService.createTenantProductAttributes({
    tenant_id: scope.id,
    key: body.key,
    name: body.name,
    type: body.type,
    unit: body.unit ?? null,
    position: body.position ?? 0,
    category_id: body.category_id ?? null,
    show_on_product: body.show_on_product ?? true,
    use_as_filter: body.use_as_filter ?? false,
  });

  const row = Array.isArray(created) ? created[0] : created;

  await writeTranslations(req.scope, ATTRIBUTE_REFERENCE, row.id, "name", body.translations);

  for (const [index, option] of (body.options ?? []).entries()) {
    const createdOption = await tenantModuleService.createTenantProductAttributeOptions({
      attribute_id: row.id,
      value: option.value,
      label: option.label,
      position: index,
    });
    const optionRow = Array.isArray(createdOption) ? createdOption[0] : createdOption;
    await writeTranslations(
      req.scope,
      OPTION_REFERENCE,
      optionRow.id,
      "label",
      option.translations,
    );
  }

  const [dto] = await listAttributeDtos(req.scope, scope.id, { id: [row.id] });

  // The storefront caches both reads of this data under one tag
  // (`lib/data/product-attributes.ts`): the block on the product page and the
  // facets of the catalogue. Without this call the owner's edit stays invisible
  // to buyers until the process restarts. Measured on the stand 2026-09-15:
  // after saving a volume of 175 the panel showed 175 and the product page
  // still showed the previous 100.
  await notifyStorefrontRevalidate({
    type: "tenant.product-attributes",
    handle: scope.handle,
  });

  res.status(201).json({ product_attribute: dto });
};
