import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { listAttributeDtos } from "../../../product-attributes/attribute-dto";
import {
  applicableAttributes,
  coerceValue,
  machineValue,
  type AttributeRow,
} from "../../../product-attributes/helpers";
import type { PostTenantProductAttributeValuesBody } from "../../../product-attributes/validators";
import { notifyStorefrontRevalidate } from "../../../../../storefront-revalidate";
import { assertOwnedProduct, assertReadableProduct, getTenantScope } from "../../../tenant-scope";

/**
 * The «Характеристики» section of the panel's product screen
 * (t15-product-attributes): the characteristics that apply to THIS product,
 * each with the value the product carries.
 *
 * What applies is decided by the schema, not by the product: the tenant's
 * catalog-wide characteristics plus the ones declared on a category the
 * product sits in (or on an ancestor of it). A product in no category sees
 * the catalog-wide ones alone.
 */
const readAttributes = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const productId = req.params.id;
  const all = await listAttributeDtos(req.scope, tenantId);
  const applicable = await applicableAttributes(
    req.scope,
    all as unknown as AttributeRow[],
    productId,
  );
  const applicableIds = new Set(applicable.map((attribute) => attribute.id));

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const values = await tenantModuleService.listTenantProductAttributeValues({
    product_id: productId,
  });

  const byAttribute = new Map(values.map((value) => [value.attribute_id, value]));

  return all
    .filter((attribute) => applicableIds.has(attribute.id))
    .map((attribute) => {
      const stored = byAttribute.get(attribute.id);
      return {
        ...attribute,
        value: stored
          ? machineValue(attribute.type, {
              value_text: stored.value_text ?? null,
              value_number: stored.value_number ?? null,
              value_boolean: stored.value_boolean ?? null,
            })
          : null,
      };
    });
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  await assertReadableProduct(req, req.params.id);

  const product_attributes = await readAttributes(req, scope.id);

  res.json({ product_attributes, count: product_attributes.length });
};

/**
 * `POST /tenants/products/:id/attributes` — saves the values the owner typed.
 *
 * The screen sends every characteristic it rendered, filled or not: an empty
 * one CLEARS the row rather than storing `""`, so the product page has no
 * empty line to render and no facet gets a value nobody can read.
 *
 * A characteristic that does not apply to this product is rejected rather
 * than stored: a value under a characteristic the product's category never
 * declared would show up in a facet count computed over that category and
 * could not be explained from the screen it was typed on.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantProductAttributeValuesBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const productId = req.params.id;
  await assertOwnedProduct(req, productId);

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const all = await listAttributeDtos(req.scope, scope.id);
  const applicable = await applicableAttributes(
    req.scope,
    all as unknown as AttributeRow[],
    productId,
  );
  const applicableByKey = new Map(applicable.map((attribute) => [attribute.key, attribute]));
  const optionsByKey = new Map(all.map((attribute) => [attribute.key, attribute.options]));

  const existing = await tenantModuleService.listTenantProductAttributeValues({
    product_id: productId,
  });
  const existingByAttribute = new Map(existing.map((row) => [row.attribute_id, row]));

  const toDelete: string[] = [];

  for (const submitted of req.validatedBody.values) {
    const attribute = applicableByKey.get(submitted.key);

    if (!attribute) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid request: characteristic "${submitted.key}" does not apply to this product`,
      );
    }

    const typed = coerceValue(
      attribute,
      optionsByKey.get(submitted.key) ?? [],
      submitted.value,
    );
    const stored = existingByAttribute.get(attribute.id);

    if (!typed) {
      if (stored) {
        toDelete.push(stored.id);
      }
      continue;
    }

    if (stored) {
      await tenantModuleService.updateTenantProductAttributeValues({
        id: stored.id,
        ...typed,
      });
      continue;
    }

    await tenantModuleService.createTenantProductAttributeValues({
      tenant_id: scope.id,
      product_id: productId,
      attribute_id: attribute.id,
      ...typed,
    });
  }

  if (toDelete.length) {
    await tenantModuleService.deleteTenantProductAttributeValues(toDelete);
  }

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

  const product_attributes = await readAttributes(req, scope.id);

  res.json({ product_attributes, count: product_attributes.length });
};
