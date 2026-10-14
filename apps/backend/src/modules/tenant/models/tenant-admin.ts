import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The roles a shop gives its own people (t-2026-10-07-11): what the owner's
 * «add staff» form offers and what `/tenants/staff` accepts.
 */
export const STAFF_ROLES = ["owner", "manager", "operator"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * `developer` is the platform's super admin inside a shop (t-2026-10-14-41,
 * Ivan 14.10.2026: «нужно еще добавить роль "разработчик" это буду я с ролью
 * суперадмина»). Only the platform assigns it: the platform's own row in every
 * shop (`PLATFORM_ADMIN_EMAIL`) and `src/scripts/assign-developer-role.ts`.
 * The shop's owner neither offers it nor changes or removes a row that has it,
 * and it never counts as one of the shop's owners.
 */
export const PLATFORM_ROLES = ["developer"] as const;

/**
 * What a login may do in ITS shop. The names only: which role opens which
 * route is one table next to the panel routes, `src/api/tenants/permissions.ts`.
 */
export const TENANT_ADMIN_ROLES = [...STAFF_ROLES, ...PLATFORM_ROLES] as const;

export type TenantAdminRole = (typeof TENANT_ADMIN_ROLES)[number];

export const isStaffRole = (value: unknown): value is StaffRole =>
  (STAFF_ROLES as readonly unknown[]).includes(value);

/**
 * The person who logs in as actor type `tenant`. Its id is what
 * `setAuthAppMetadataStep` writes into the auth identity's `app_metadata`, so
 * `req.auth_context.actor_id` on every `/tenants/*` request is a tenant admin id.
 *
 * `email` is unique per `tenant_id`, not platform-wide (o25-platform-admin-all-shops):
 * the same emailpass auth identity can hold one `tenant_admin` row in several
 * tenants, which is how the platform admin logs into every shop with one
 * identity. `POST /tenants/me/switch` picks the row for the target tenant and
 * mints a token whose actor id is that row's id.
 *
 * `role` belongs to the row, so to the shop: one person can be the owner of
 * one shop and an operator of another. It is read from this table on every
 * `/tenants/*` request (`tenant-admin-gate.ts`) and never from the token, so a
 * change of role takes effect on the very next request.
 */
const TenantAdmin = model
  .define("tenant_admin", {
    id: model.id({ prefix: "tenadm" }).primaryKey(),
    email: model.text(),
    first_name: model.text().nullable(),
    last_name: model.text().nullable(),
    role: model.enum([...TENANT_ADMIN_ROLES]).default("owner"),
    // tenant-panel wave 2, piece 4 (profile): the copied profile-edit form
    // writes the language choice here as `metadata.language`, same field name
    // the Admin's own `user.metadata` carries it under.
    metadata: model.json().nullable(),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "admins",
    }),
  })
  .indexes([
    {
      on: ["email", "tenant_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantAdmin;
