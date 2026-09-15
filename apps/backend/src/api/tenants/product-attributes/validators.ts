import { z } from "@medusajs/framework/zod";
import { ATTRIBUTE_TYPES } from "../../../modules/tenant/models/tenant-product-attribute";

/**
 * Bodies of `/tenants/product-attributes/**` (t15-product-attributes).
 *
 * Two shapes only, and both carry the WHOLE characteristic: the panel screen
 * edits one row at a time and sends it back complete, the way
 * `PUT /tenants/pages/:key` does. `options` is the closed list of a `select`
 * and is replaced whole on every save — a choice the owner removed has to
 * disappear, and reconciling a partial list against the values already on
 * products is the route's job, not the caller's.
 */

const ATTRIBUTE_KEY = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "lowercase letters, digits and single underscores");

/** Same shape as the article locale: a BCP-47 tag, `ru` or `pt-BR`. */
const LOCALE = z
  .string()
  .regex(/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/, "a BCP-47 language tag, e.g. en or pt-BR");

/**
 * `{ "<locale>": "<text>" }` for the characteristic's name and for each
 * choice's label. Absent or empty means "no translation": the visitor then
 * reads the base text, never an empty row.
 */
const TRANSLATIONS = z.record(LOCALE, z.string().max(200)).optional();

const OPTION = z.strictObject({
  value: z
    .string()
    .min(1)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
      "lowercase letters, digits and single hyphens or underscores",
    ),
  label: z.string().min(1).max(200),
  translations: TRANSLATIONS,
});

const BASE = {
  name: z.string().min(1).max(200),
  translations: TRANSLATIONS,
  type: z.enum(ATTRIBUTE_TYPES),
  unit: z.string().max(30).nullish(),
  position: z.number().int().min(0).max(9_999).optional(),
  category_id: z.string().min(1).max(120).nullish(),
  show_on_product: z.boolean().optional(),
  use_as_filter: z.boolean().optional(),
  options: z.array(OPTION).max(200).optional(),
};

export const PostTenantProductAttributeSchema = z.strictObject({
  key: ATTRIBUTE_KEY,
  ...BASE,
});

export type PostTenantProductAttributeBody = z.infer<
  typeof PostTenantProductAttributeSchema
>;

/**
 * `POST /tenants/product-attributes/:id` — the update. `key` is absent on
 * purpose: it is what a filter URL and a CSV column address, so renaming it
 * would silently break both. The owner renames `name` instead, and a new
 * machine key means a new characteristic.
 */
export const PostTenantProductAttributeUpdateSchema = z.strictObject(BASE);

export type PostTenantProductAttributeUpdateBody = z.infer<
  typeof PostTenantProductAttributeUpdateSchema
>;

/**
 * `POST /tenants/products/:id/attributes` — the values of ONE product, sent
 * whole by the product screen.
 *
 * A value of `null` (or `""` for a text) CLEARS the characteristic on that
 * product: the row goes away, and the product page then renders no line for
 * it rather than an empty one. That is why the field is nullable and why the
 * screen may send every characteristic it rendered, filled or not.
 */
export const PostTenantProductAttributeValuesSchema = z.strictObject({
  values: z
    .array(
      z.strictObject({
        key: ATTRIBUTE_KEY,
        value: z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]),
      }),
    )
    .max(200),
});

export type PostTenantProductAttributeValuesBody = z.infer<
  typeof PostTenantProductAttributeValuesSchema
>;
