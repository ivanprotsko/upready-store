import { z } from "@medusajs/framework/zod";

/**
 * Query params for `GET /admin/tenants` (contract §3). `q` matches `handle`
 * or `name` (ilike, applied in `route.ts`); the route builds the filter
 * itself since the tenant module has no generated query-config the way
 * core resources do.
 */
export const AdminGetTenantsParams = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  archived: z.enum(["exclude", "include", "only"]).optional().default("exclude"),
});

export type AdminGetTenantsParamsType = z.infer<typeof AdminGetTenantsParams>;

/**
 * `POST /admin/tenants` body (contract §3). The handle rules mirror
 * `PostTenantCreateSchema` in `src/api/tenants/validators.ts`: lowercase
 * letters, digits and single hyphens, 3 to 63 characters, because it is the
 * same technical subdomain either route mints. Password floor of 8 chars is
 * this route's own rule (staff-issued passwords), not shared with the
 * self-registration flow.
 */
export const PostAdminTenantCreateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  handle: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  admin: z.strictObject({
    email: z.string().email(),
    password: z.string().min(8),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

export type PostAdminTenantCreateBody = z.infer<typeof PostAdminTenantCreateSchema>;

/**
 * `POST /admin/tenants/:id` body (contract §3). `handle` is immutable through
 * this API and `metadata.archived_at` belongs only to the delete workflow, so
 * both are refused with `400` in the route rather than accepted here and
 * silently ignored.
 */
export const PostAdminTenantUpdateSchema = z
  .strictObject({
    name: z.string().min(1).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => !data.metadata || !("archived_at" in data.metadata), {
    message: "metadata.archived_at cannot be set through this route; use DELETE /admin/tenants/:id",
    path: ["metadata", "archived_at"],
  });

export type PostAdminTenantUpdateBody = z.infer<typeof PostAdminTenantUpdateSchema>;

/** `DELETE /admin/tenants/:id` query (contract §3/§4). */
export const DeleteAdminTenantParams = z.object({
  purge_files: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export type DeleteAdminTenantParamsType = z.infer<typeof DeleteAdminTenantParams>;

/** `POST /admin/tenants/:id/admins` body (contract §3). */
export const PostAdminTenantAdminCreateSchema = z.strictObject({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type PostAdminTenantAdminCreateBody = z.infer<typeof PostAdminTenantAdminCreateSchema>;

/** `POST /admin/tenants/:id/admins/:adminId` body (contract §3). */
export const PostAdminTenantAdminUpdateSchema = z.strictObject({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type PostAdminTenantAdminUpdateBody = z.infer<typeof PostAdminTenantAdminUpdateSchema>;
