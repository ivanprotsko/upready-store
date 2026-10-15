import { z } from "@medusajs/framework/zod";
import { AdminGetProductOptionsParams } from "@medusajs/medusa/api/admin/product-options/validators";
import { UpdateProduct } from "@medusajs/medusa/api/admin/products/validators";
import { WithAdditionalData } from "@medusajs/medusa/api/utils/validators";
import { SiteScopeSchema } from "../products/site-scope";
import { staffRole, tenantAdminPassword } from "../../admin/tenants/validators";
import { OWNER_PASSWORD_MIN_LENGTH } from "../../auth/password-length-gate";

/**
 * Body and query schemas for a shop's registration, its sites, the owner's
 * profile and password, the shop switcher and the shop's staff.
 *
 * `../validators.ts` re-exports every schema of this folder, so callers import
 * from there (t-2026-10-14-55).
 */

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
  /**
   * The tariff this tenant is created on (t-2026-09-27-05), the pricing
   * document's own tier id. The caller (the onboarding wizard's server route)
   * has already resolved it against `GET /platform/pricing`; this route trusts
   * that resolution, the same way it trusts `name`/`handle`.
   */
  plan_id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens")
    .nullable()
    .optional(),
  /** The tariff's trial length in days, from the same resolved pricing document; absent or null for no trial. */
  plan_trial_days: z.number().int().min(1).max(365).nullable().optional(),
});

export type PostTenantCreateBody = z.infer<typeof PostTenantCreateSchema>;

/**
 * `POST /tenants/sites` (t-2026-09-24-n12): «Создать сайт», a copy of the
 * caller's current site. Same handle rule as `PostTenantCreateSchema`; the
 * admin is always the caller, so there is no `admin` field to name another.
 */
export const PostTenantSiteSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  handle: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  copy_pages: z.boolean().default(true),
  copy_shipping: z.boolean().default(true),
});

export type PostTenantSiteBody = z.infer<typeof PostTenantSiteSchema>;

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

// ---- piece 4: profile (/tenants/me, /tenants/me/password)

/**
 * `POST /tenants/me` body. Same three fields the Admin's `AdminUpdateUser`
 * accepts (`first_name`, `last_name`, `metadata`), minus `avatar_url` (no
 * upload flow wired for the tenant admin's own avatar in this piece). The
 * copied `edit-profile-form` writes the language choice to
 * `metadata.language`, the panel's own equivalent of the Admin's
 * `user.metadata.language`.
 */
export const PostTenantUpdateMeSchema = z.strictObject({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type PostTenantUpdateMeBody = z.infer<typeof PostTenantUpdateMeSchema>;

/**
 * `POST /tenants/me/password` body. `new_password` shorter than
 * `OWNER_PASSWORD_MIN_LENGTH` (8, t-2026-10-11-23) is `INVALID_DATA` (zod raises before the route
 * runs) — an existing password already shorter than that is untouched, this
 * only gates a NEW one; a wrong `current_password` is the route's own
 * `401 UNAUTHORIZED`, never a zod issue, because zod cannot see the stored
 * hash.
 */
export const PostTenantUpdatePasswordSchema = z.strictObject({
  current_password: z.string().min(1),
  new_password: z.string().min(OWNER_PASSWORD_MIN_LENGTH, `New password must be at least ${OWNER_PASSWORD_MIN_LENGTH} characters long.`),
});

export type PostTenantUpdatePasswordBody = z.infer<typeof PostTenantUpdatePasswordSchema>;

/**
 * `POST /tenants/me/switch` body (o25-platform-admin-all-shops): `tenant_id`
 * is the TENANT's id (`GET /tenants/me/shops` names it `id`), never a
 * `tenant_admin` row id — the route resolves the caller's own row in that
 * tenant itself, from the token's email.
 */
/**
 * `POST /tenants/products/:id` body: the Admin's `AdminUpdateProduct` plus
 * `site_scope` (t-2026-09-24-n12), which sites of the client show the
 * product. `"all"` or `{ tenant_ids }`; absent leaves the sites as they are.
 */
export const PostTenantUpdateProductSchema = WithAdditionalData(
  UpdateProduct.extend({ site_scope: SiteScopeSchema.optional() }),
);

export const PostTenantSwitchShopSchema = z.strictObject({
  tenant_id: z.string().min(1),
});

export type PostTenantSwitchShopBody = z.infer<typeof PostTenantSwitchShopSchema>;

// ---- t-2026-10-07-11: the shop's own staff (/tenants/staff/**)

/**
 * `POST /tenants/staff` body. `role` is required: the owner says what the new
 * login may do, there is no default to forget about. The password goes
 * through the same check as one issued by platform staff.
 */
export const PostTenantStaffCreateSchema = z.strictObject({
  email: z.string().email(),
  password: tenantAdminPassword(),
  role: staffRole(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type PostTenantStaffCreateBody = z.infer<typeof PostTenantStaffCreateSchema>;

/**
 * `POST /tenants/staff/:id` body. No `email`: the email is the login's
 * identity, and moving it is the platform's job
 * (`POST /admin/tenants/:id/admins/:adminId`).
 */
export const PostTenantStaffUpdateSchema = z.strictObject({
  role: staffRole().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  password: tenantAdminPassword().optional(),
});

export type PostTenantStaffUpdateBody = z.infer<typeof PostTenantStaffUpdateSchema>;
