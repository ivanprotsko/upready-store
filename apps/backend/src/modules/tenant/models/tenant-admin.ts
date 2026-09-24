import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

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
 */
const TenantAdmin = model
  .define("tenant_admin", {
    id: model.id({ prefix: "tenadm" }).primaryKey(),
    email: model.text(),
    first_name: model.text().nullable(),
    last_name: model.text().nullable(),
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
