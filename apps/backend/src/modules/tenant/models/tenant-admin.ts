import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The person who logs in as actor type `tenant`. Its id is what
 * `setAuthAppMetadataStep` writes into the auth identity's `app_metadata`, so
 * `req.auth_context.actor_id` on every `/tenants/*` request is a tenant admin id.
 */
const TenantAdmin = model.define("tenant_admin", {
  id: model.id({ prefix: "tenadm" }).primaryKey(),
  email: model.text().unique(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "admins",
  }),
});

export default TenantAdmin;
