import { z } from "@medusajs/framework/zod";
import { AdminGetProductOptionsParams } from "@medusajs/medusa/api/admin/product-options/validators";

/**
 * A handle is the tenant's stable slug (subdomain-shaped): lowercase letters,
 * digits and single hyphens, 3 to 63 characters. Unlike the recipe it is
 * required, because it is the one identifier a human types.
 */
export const PostTenantCreateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  handle: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  admin: z.strictObject({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

export type PostTenantCreateBody = z.infer<typeof PostTenantCreateSchema>;

/**
 * The Admin's product-option list params plus `product_id`, which the Admin's
 * own route does not take. `GET /tenants/product-options` is scoped to the
 * tenant's products, and the panel narrows it to one of them; without this
 * field zod would strip the parameter and the narrowing would silently do
 * nothing. Everything else, `q`, `id`, `title`, `is_exclusive`, the operator
 * maps and the pagination defaults, is the Admin's.
 */
export const TenantGetProductOptionsParams = AdminGetProductOptionsParams.extend({
  product_id: z.union([z.string(), z.array(z.string())]).optional(),
});
