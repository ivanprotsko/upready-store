import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * A handle this shop USED to answer on. Written when the owner changes the
 * shop's address (`POST /tenants/handle`), never by hand.
 *
 * Two jobs, both from `specs/tenant-address/CANONICAL.md` §1.2:
 *
 *   1. the old `<handle>.<base>` keeps answering and redirects, page for page,
 *      to the same page of the new address — links in letters, in social posts
 *      and on other people's sites do not break;
 *   2. the old handle stays RESERVED for this shop, with no expiry. A freed
 *      handle handed to another tenant would inherit someone else's inbound
 *      links and search history, which is why `POST /tenants` and
 *      `POST /tenants/handle` both refuse a handle that appears here.
 *
 * Unique across the whole table for the same reason `tenant.handle` is: one
 * name, one shop.
 */
const TenantHandleAlias = model.define("tenant_handle_alias", {
  id: model.id({ prefix: "thal" }).primaryKey(),
  handle: model.text().unique(),
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "handle_aliases",
  }),
});

export default TenantHandleAlias;
