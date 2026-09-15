import { model } from "@medusajs/framework/utils";
import TenantProductAttribute from "./tenant-product-attribute";

/**
 * One choice of a `select` characteristic (t15-product-attributes), shaped
 * after Medusa's own `product_option_value`: a machine `value` the product's
 * row stores and a `label` the visitor reads.
 *
 * The pair is what makes a choice filterable AND translatable at once. A
 * product carries the machine value, so a filter URL
 * (`?a_strana=russia`) and a CSV column (`attr:strana`) stay stable while the
 * label reads «Россия» in Russian and "Russia" in English — the same split
 * `product_option_value` uses, and the reason `label` is `.translatable()`.
 */
const TenantProductAttributeOption = model
  .define("tenant_product_attribute_option", {
    id: model.id({ prefix: "tpao" }).primaryKey(),
    /** Lowercase machine value, the one stored on products and in filter URLs. */
    value: model.text(),
    label: model.text().translatable(),
    position: model.number().default(0),
    attribute: model.belongsTo(() => TenantProductAttribute, {
      mappedBy: "options",
    }),
  })
  .indexes([
    {
      on: ["attribute_id", "value"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantProductAttributeOption;
