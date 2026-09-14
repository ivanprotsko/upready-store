import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import TenantModule from "../modules/tenant";

/**
 * Which tenant created a product. `createTenantProductWorkflow` writes it, and
 * `GET /tenants/products` reads `tenant.products.*` through it. The product is
 * also attached to the tenant's sales channel, which is what the storefront
 * filters by; this link is the ownership record the tenant API scopes by.
 */
export default defineLink(TenantModule.linkable.tenant, {
  linkable: ProductModule.linkable.product.id,
  isList: true,
});
