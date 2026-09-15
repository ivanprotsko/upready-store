import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";
import TenantProductAttributeOption from "./tenant-product-attribute-option";
import TenantProductAttributeValue from "./tenant-product-attribute-value";

/**
 * One characteristic a shop owner declares for their own catalog
 * (t15-product-attributes): «Состав», «Объём», «Страна». Medusa ships weight,
 * dimensions, material, country and HS code and nothing else, so a supplements
 * shop had nowhere to put composition and volume except the schema-less
 * `metadata` bag, which no filter can read.
 *
 * THE SCHEMA IS WHAT THE OWNER DECLARES. A `metadata` key that happens to
 * exist on a product is not a characteristic and never becomes one: only a row
 * here is.
 *
 * `key` is the machine name (`sostav`, `obem`). It is what a CSV column
 * (`attr:<key>`, t14-product-import), a filter query parameter (`a_<key>`) and
 * an imported value address; renaming the display `name` must never break a
 * bookmarked filter URL, which is why the two are separate columns.
 *
 * `category_id` scopes the characteristic to one product category, so a shop
 * can carry composition on supplements and screen size on electronics without
 * showing both everywhere. `null` means every product of the tenant. The id is
 * a plain column rather than a link: categories are global rows in Medusa and
 * the tenant's ownership of one is already recorded by the
 * tenant-product-category link, which every write path here checks.
 *
 * `name` is `.translatable()`: the visitor reads it, so it goes through the
 * same path a product title does (`@medusajs/medusa/translation`, resolved by
 * the request's `x-medusa-locale`). The column holds the owner's own base
 * text, the translation rows hold the rest, and
 * `attribute-translations.ts` is the one place that reads them.
 */

/** Lowercase latin letters, digits and single underscores, 2 to 40 characters. */
export const ATTRIBUTE_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const ATTRIBUTE_TYPES = ["text", "number", "select", "boolean"] as const;

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const isValidAttributeKey = (value: string): boolean =>
  value.length >= 2 && value.length <= 40 && ATTRIBUTE_KEY_PATTERN.test(value);

const TenantProductAttribute = model
  .define("tenant_product_attribute", {
    id: model.id({ prefix: "tpat" }).primaryKey(),
    key: model.text(),
    name: model.text().translatable(),
    type: model.enum([...ATTRIBUTE_TYPES]),
    /** «мл», «кг», «см». Shown after the value on the product page, `number` only. */
    unit: model.text().nullable(),
    /** The owner's order on the product page and in the filter bar. */
    position: model.number().default(0),
    /** Product category this characteristic belongs to; null = the whole catalog. */
    category_id: model.text().nullable(),
    show_on_product: model.boolean().default(true),
    use_as_filter: model.boolean().default(false),
    options: model.hasMany(() => TenantProductAttributeOption, {
      mappedBy: "attribute",
    }),
    values: model.hasMany(() => TenantProductAttributeValue, {
      mappedBy: "attribute",
    }),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "product_attributes",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      // The storefront's own read: this tenant's filterable characteristics.
      on: ["tenant_id", "use_as_filter"],
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantProductAttribute;
