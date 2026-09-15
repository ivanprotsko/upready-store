import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { listAttributeDtos } from "../../../tenants/product-attributes/attribute-dto";
import {
  ATTRIBUTE_REFERENCE,
  OPTION_REFERENCE,
  applicableAttributes,
  machineValue,
  pickTranslated,
  readTranslations,
  type AttributeRow,
} from "../../../tenants/product-attributes/helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/product-attributes?product_id=prod_…` — the
 * «Характеристики» block of a product page (t15-product-attributes).
 *
 * What comes back is what the OWNER declared visible and the product actually
 * carries: `show_on_product` rows with a value, in the owner's order. No empty
 * rows and no «не указано» filler, so a shop that filled two of six
 * characteristics shows two lines.
 *
 * A characteristic can be filterable without being shown (`use_as_filter`
 * alone) and shown without being filterable: this route reads
 * `show_on_product` and nothing else, which is what makes the two independent.
 *
 * Names and choice labels are resolved for `x-medusa-locale` through the
 * translation module, the same path a product title takes; a language the shop
 * has not translated falls back to the owner's own text rather than a blank.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const productId = typeof req.query.product_id === "string" ? req.query.product_id : null;

  if (!productId) {
    res.json({ product_attributes: [], count: 0 });
    return;
  }

  const declared = await listAttributeDtos(req.scope, tenant.id, { show_on_product: true });

  if (!declared.length) {
    res.json({ product_attributes: [], count: 0 });
    return;
  }

  const applicable = await applicableAttributes(
    req.scope,
    declared as unknown as AttributeRow[],
    productId,
  );
  const applicableIds = new Set(applicable.map((attribute) => attribute.id));

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const values = await tenantModuleService.listTenantProductAttributeValues({
    product_id: productId,
    attribute_id: [...applicableIds],
  });
  const byAttribute = new Map(values.map((value) => [value.attribute_id, value]));

  const shown = declared.filter(
    (attribute) => applicableIds.has(attribute.id) && byAttribute.has(attribute.id),
  );

  const [nameTranslations, labelTranslations] = await Promise.all([
    readTranslations(
      req.scope,
      ATTRIBUTE_REFERENCE,
      shown.map((attribute) => attribute.id),
    ),
    readTranslations(
      req.scope,
      OPTION_REFERENCE,
      shown.flatMap((attribute) => attribute.options.map((option) => option.id)),
    ),
  ]);

  const product_attributes = shown.map((attribute) => {
    const stored = byAttribute.get(attribute.id)!;
    const value = machineValue(attribute.type, {
      value_text: stored.value_text ?? null,
      value_number: stored.value_number ?? null,
      value_boolean: stored.value_boolean ?? null,
    });

    const choice =
      attribute.type === "select"
        ? attribute.options.find((option) => option.value === value)
        : undefined;

    return {
      key: attribute.key,
      name: pickTranslated(
        attribute.name,
        nameTranslations.get(attribute.id),
        "name",
        req.locale,
      ),
      type: attribute.type,
      unit: attribute.unit,
      position: attribute.position,
      value,
      label: choice
        ? pickTranslated(choice.label, labelTranslations.get(choice.id), "label", req.locale)
        : null,
    };
  });

  res.json({ product_attributes, count: product_attributes.length });
};
