import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * One path-for-path redirect of a tenant's storefront (t11-seo-redirects):
 * either a page that moved because the owner changed a product/category
 * handle, or a row imported from a previous shop's URL structure
 * (`specs/tenant-address/CANONICAL.md` covers the shop's own HOST moving; this
 * table is the PATH moving under one host).
 *
 * `from_path` and `to_path` are exact pathnames (leading slash, no host, no
 * query string) — the storefront middleware matches the incoming request
 * pathname against `from_path` byte for byte, before it does anything with
 * locale. A path already redirected by another row (this tenant's own chain)
 * is legal; the middleware caps the chain length rather than looping forever.
 *
 * Unique on (`tenant_id`, `from_path`): two rules for the same source path on
 * the same shop would make the outcome depend on read order.
 */
const TenantRedirect = model
  .define("tenant_redirect", {
    id: model.id({ prefix: "tredir" }).primaryKey(),
    from_path: model.text(),
    to_path: model.text(),
    status_code: model.number().default(301),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "redirects",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "from_path"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantRedirect;
