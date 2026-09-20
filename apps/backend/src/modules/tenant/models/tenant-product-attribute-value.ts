import { model } from "@medusajs/framework/utils";
import TenantProductAttribute from "./tenant-product-attribute";

/**
 * One characteristic of one product, stored TYPED (t15-product-attributes).
 *
 * A number kept as text cannot be filtered by range: `'90' > '500'` is true in
 * every collation Postgres has, so «Объём от 100 до 500 мл» would answer with
 * the wrong products and no error. So the value lands in the column its
 * characteristic's `type` names — `value_number` for `number`, `value_boolean`
 * for `boolean`, `value_text` for `text` and for a `select`'s machine value —
 * and the facet queries read exactly that column. `coerceValue` in
 * `api/tenants/product-attributes/helpers.ts` is the one place that decides
 * which column a submitted value goes to.
 *
 * `tenant_id` is denormalised here on purpose. Every facet count is one
 * aggregate over this table scoped to one shop, and going through
 * `tenant_product_attribute` for the scope would put a join in front of every
 * one of them.
 *
 * `product_id` is a plain column, not a link: the value belongs to the
 * characteristic, and the product it hangs on is a row in another module.
 * Ownership is still checked on every write (`assertOwnedProduct`), and
 * `DELETE /tenants/products/:id` leaves rows behind that nothing reads —
 * `deleteOrphanValues` in the same helpers sweeps them when the product screen
 * next saves.
 */
const TenantProductAttributeValue = model
  .define("tenant_product_attribute_value", {
    id: model.id({ prefix: "tpav" }).primaryKey(),
    /** The owning shop, copied from the attribute so a facet needs no join. */
    tenant_id: model.text(),
    product_id: model.text(),
    value_text: model.text().nullable(),
    /**
     * `model.float()` is `real` in Postgres, 24 bits of mantissa. A range
     * endpoint therefore has to be compared AS `real`: `0.1::real` is
     * 0.10000000149…, so `value_number <= 0.1` (a float8 literal) is false for
     * a row holding exactly 0.1, and «до 0,1» would drop the product it was
     * asked about. Every comparison in `facet-queries.ts` casts its parameter
     * with `::real` for that reason. What this costs: about 7 significant
     * digits, which is the shop-characteristic range (volumes, weights,
     * lengths) with room to spare.
     */
    value_number: model.float().nullable(),
    value_boolean: model.boolean().nullable(),
    attribute: model.belongsTo(() => TenantProductAttribute, {
      mappedBy: "values",
    }),
  })
  .indexes([
    {
      on: ["product_id", "attribute_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      // The facet aggregate: one shop, one characteristic, grouped by value.
      on: ["tenant_id", "attribute_id", "value_text"],
      where: "deleted_at IS NULL",
    },
    {
      // The range facet: min/max and the between-scan.
      on: ["tenant_id", "attribute_id", "value_number"],
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantProductAttributeValue;
