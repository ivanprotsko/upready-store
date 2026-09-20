import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ensureDefaultSchema } from "../../../product-attributes-fill/apply-default-schema";
import { DEFAULT_ATTRIBUTE_PRESET } from "../../../product-attributes-fill/default-schema";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";
import { listAttributeDtos } from "../product-attributes/attribute-dto";
import { getTenantScope } from "../tenant-scope";

/**
 * The starting set of characteristics (b04-product-attributes), so a shop does
 * not begin at an empty screen: артикул, состав, объём, вес, страна
 * производства, срок годности, назначение.
 *
 * It sits at its own path rather than under `/tenants/product-attributes/`
 * because that resource already answers `POST /tenants/product-attributes/:id`,
 * and `defaults` would arrive there as an id: the body validator of the update
 * route would run first and reject a call that carries no body.
 *
 * `GET` says which of the preset the shop already has, so the panel can label
 * its button. `POST` creates the missing ones and touches nothing else —
 * running it twice adds nothing, and a characteristic the owner renamed or
 * switched off keeps what the owner did to it (`ensureDefaultSchema`).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const existing = await listAttributeDtos(req.scope, scope.id);
  const existingKeys = new Set(existing.map((attribute) => attribute.key));

  res.json({
    preset: DEFAULT_ATTRIBUTE_PRESET.map((attribute) => ({
      key: attribute.key,
      name: attribute.name,
      type: attribute.type,
      unit: attribute.unit,
      use_as_filter: attribute.use_as_filter,
      exists: existingKeys.has(attribute.key),
    })),
    missing: DEFAULT_ATTRIBUTE_PRESET.filter((attribute) => !existingKeys.has(attribute.key)).length,
  });
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const result = await ensureDefaultSchema(req.scope, scope.id);

  if (result.created.length) {
    // The same cache tag both storefront reads of this data share
    // (`lib/data/product-attributes.ts`).
    await notifyStorefrontRevalidate({
      type: "tenant.product-attributes",
      handle: scope.handle,
    });
  }

  const product_attributes = await listAttributeDtos(req.scope, scope.id);

  res.status(result.created.length ? 201 : 200).json({
    created: result.created,
    existing: result.existing,
    product_attributes,
  });
};
