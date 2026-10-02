import { z } from "@medusajs/framework/zod";
import { LOCALE_CODES } from "../locale-settings/validators";

/**
 * `PUT /tenants/products/:id/translations` — one locale, sent whole by the
 * panel's «Переводы» drawer (t-cherk-37). `locale` is restricted to the 36
 * codes the storefront actually ships (`LOCALE_CODES`), not a loose BCP-47
 * regex: a code outside that list can never be read back, because no
 * `x-medusa-locale` the storefront sends will ever name it.
 *
 * `options`/`variants` are `{ [id]: title }` maps rather than arrays: the
 * drawer renders one row per option/variant the product already has, and a
 * map lets it submit only the rows it rendered without echoing every id back
 * in a fixed order.
 */
const TITLE = z.string().max(500);

export const PutTenantProductTranslationBody = z.strictObject({
  locale: z.enum(LOCALE_CODES),
  title: TITLE.optional(),
  subtitle: TITLE.nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  options: z.record(z.string(), TITLE).optional(),
  variants: z.record(z.string(), TITLE).optional(),
});

export type PutTenantProductTranslationBodyType = z.infer<
  typeof PutTenantProductTranslationBody
>;
