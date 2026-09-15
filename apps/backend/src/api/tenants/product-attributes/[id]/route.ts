import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { notifyStorefrontRevalidate } from "../../../../storefront-revalidate";
import { assertOwnedCategory, getTenantScope } from "../../tenant-scope";
import { listAttributeDtos } from "../attribute-dto";
import { ATTRIBUTE_REFERENCE, OPTION_REFERENCE, writeTranslations } from "../helpers";
import type { PostTenantProductAttributeUpdateBody } from "../validators";

/**
 * One characteristic of the tenant behind the token
 * (t15-product-attributes). A characteristic of another shop answers 404 and
 * not 403, the way every `/tenants/*` detail route does: the response never
 * tells one owner that another owner's row exists.
 */
const ownedAttribute = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const id = req.params.id;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const [row] = await tenantModuleService.listTenantProductAttributes({
    id,
    tenant_id: tenantId,
  });

  if (!row) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product attribute with id "${id}" was not found`,
    );
  }

  return row;
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const row = await ownedAttribute(req, scope.id);
  const [dto] = await listAttributeDtos(req.scope, scope.id, { id: [row.id] });

  res.json({ product_attribute: dto });
};

/**
 * `POST /tenants/product-attributes/:id` — saves the whole characteristic.
 *
 * The choice list is replaced whole, and a choice the owner removed takes the
 * products' values with it: leaving them behind would keep a facet value alive
 * that the schema no longer declares, which is the «a metadata key is not a
 * characteristic» rule turned the other way round. The values are deleted
 * BEFORE the option rows so a failure in between leaves the schema, not the
 * data, as the thing to fix.
 *
 * `type` may change, and a value typed for the old one is then meaningless:
 * «500» read as a number cannot be read as a choice. Changing the type clears
 * the stored values rather than reinterpreting them, and the response says how
 * many went (`cleared_values`), so the panel can tell the owner.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantProductAttributeUpdateBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const row = await ownedAttribute(req, scope.id);
  const body = req.validatedBody;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  if (body.category_id) {
    await assertOwnedCategory(req, body.category_id);
  }

  if (body.type === "select" && !body.options?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a choice characteristic needs at least one choice",
    );
  }

  let clearedValues = 0;

  if (body.type !== row.type) {
    const stale = await tenantModuleService.listTenantProductAttributeValues({
      attribute_id: row.id,
    });
    if (stale.length) {
      await tenantModuleService.deleteTenantProductAttributeValues(
        stale.map((value) => value.id),
      );
      clearedValues += stale.length;
    }
  }

  await tenantModuleService.updateTenantProductAttributes({
    id: row.id,
    name: body.name,
    type: body.type,
    unit: body.unit ?? null,
    position: body.position ?? row.position,
    category_id: body.category_id ?? null,
    show_on_product: body.show_on_product ?? true,
    use_as_filter: body.use_as_filter ?? false,
  });

  await writeTranslations(req.scope, ATTRIBUTE_REFERENCE, row.id, "name", body.translations);

  const submitted = body.options ?? [];
  const existingOptions = await tenantModuleService.listTenantProductAttributeOptions({
    attribute_id: row.id,
  });
  const existingByValue = new Map(existingOptions.map((option) => [option.value, option]));
  const submittedValues = new Set(submitted.map((option) => option.value));

  const removed = existingOptions.filter((option) => !submittedValues.has(option.value));

  if (removed.length) {
    const orphaned = await tenantModuleService.listTenantProductAttributeValues({
      attribute_id: row.id,
      value_text: removed.map((option) => option.value),
    });
    if (orphaned.length) {
      await tenantModuleService.deleteTenantProductAttributeValues(
        orphaned.map((value) => value.id),
      );
      clearedValues += orphaned.length;
    }
    await tenantModuleService.deleteTenantProductAttributeOptions(
      removed.map((option) => option.id),
    );
  }

  for (const [index, option] of submitted.entries()) {
    const existing = existingByValue.get(option.value);
    if (existing) {
      await tenantModuleService.updateTenantProductAttributeOptions({
        id: existing.id,
        label: option.label,
        position: index,
      });
      await writeTranslations(
        req.scope,
        OPTION_REFERENCE,
        existing.id,
        "label",
        option.translations,
      );
      continue;
    }

    const created = await tenantModuleService.createTenantProductAttributeOptions({
      attribute_id: row.id,
      value: option.value,
      label: option.label,
      position: index,
    });
    const createdRow = Array.isArray(created) ? created[0] : created;
    await writeTranslations(
      req.scope,
      OPTION_REFERENCE,
      createdRow.id,
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

  res.json({ product_attribute: dto, cleared_values: clearedValues });
};

/**
 * `DELETE /tenants/product-attributes/:id` — the characteristic, its choices
 * and every value products carried for it. The values go first for the same
 * reason as above.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const row = await ownedAttribute(req, scope.id);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const values = await tenantModuleService.listTenantProductAttributeValues({
    attribute_id: row.id,
  });
  if (values.length) {
    await tenantModuleService.deleteTenantProductAttributeValues(
      values.map((value) => value.id),
    );
  }

  const options = await tenantModuleService.listTenantProductAttributeOptions({
    attribute_id: row.id,
  });
  if (options.length) {
    await tenantModuleService.deleteTenantProductAttributeOptions(
      options.map((option) => option.id),
    );
  }

  await tenantModuleService.deleteTenantProductAttributes([row.id]);

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

  res.json({ id: row.id, object: "product_attribute", deleted: true });
};
