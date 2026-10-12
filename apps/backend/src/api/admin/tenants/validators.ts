import { z } from "@medusajs/framework/zod";
import { OWNER_PASSWORD_MIN_LENGTH, OWNER_PASSWORD_TOO_SHORT_MESSAGE } from "../../auth/password-length-gate";
import { LIVE_METADATA_KEYS } from "../../../modules/tenant/live";
import { TENANT_ADMIN_ROLES } from "../../../modules/tenant/models/tenant-admin";

/**
 * 46df A-22: a staff-issued password for a shop admin has the same floor as
 * one the owner sets herself (`POST /tenants/me/password`, the reset link).
 * Exported for `POST /tenants/staff` (t-2026-10-07-11): a password the owner
 * issues to her staff goes through this very check.
 */
export const tenantAdminPassword = () => z.string().min(OWNER_PASSWORD_MIN_LENGTH, OWNER_PASSWORD_TOO_SHORT_MESSAGE);

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
 * same technical subdomain either route mints. The password floor is the
 * shared one (`OWNER_PASSWORD_MIN_LENGTH`, 8 characters).
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
    password: tenantAdminPassword(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

export type PostAdminTenantCreateBody = z.infer<typeof PostAdminTenantCreateSchema>;

/**
 * `POST /admin/tenants/:id` body (contract §3). `handle` is immutable through
 * this API and `metadata.archived_at` belongs only to the delete workflow, so
 * both are refused with `400` in the route rather than accepted here and
 * silently ignored. The same goes for `metadata.live`, `live_since` and
 * `live_by` (`modules/tenant/live.ts`), which only Ivan's switch writes.
 */
export const PostAdminTenantUpdateSchema = z
  .strictObject({
    name: z.string().min(1).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => !data.metadata || !("archived_at" in data.metadata), {
    message: "metadata.archived_at cannot be set through this route; use DELETE /admin/tenants/:id",
    path: ["metadata", "archived_at"],
  })
  // t-2026-10-12-31: only Ivan switches a shop live, and not with an API token.
  .refine((data) => !LIVE_METADATA_KEYS.some((key) => key in (data.metadata ?? {})), {
    message:
      "metadata.live, live_since and live_by cannot be set through this route; Ivan switches a shop with deploy/scripts/tenant-live.mjs",
    path: ["metadata", "live"],
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

/** One of `TENANT_ADMIN_ROLES` (t-2026-10-07-11). */
export const tenantAdminRole = () => z.enum(TENANT_ADMIN_ROLES);

/**
 * `POST /admin/tenants/:id/admins` body (contract §3). Without `role` the
 * login is an `owner`, as every login was before roles existed.
 */
export const PostAdminTenantAdminCreateSchema = z.strictObject({
  email: z.string().email(),
  password: tenantAdminPassword(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: tenantAdminRole().optional(),
});

export type PostAdminTenantAdminCreateBody = z.infer<typeof PostAdminTenantAdminCreateSchema>;

/** `POST /admin/tenants/:id/admins/:adminId` body (contract §3). */
export const PostAdminTenantAdminUpdateSchema = z.strictObject({
  email: z.string().email().optional(),
  password: tenantAdminPassword().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: tenantAdminRole().optional(),
});

export type PostAdminTenantAdminUpdateBody = z.infer<typeof PostAdminTenantAdminUpdateSchema>;
