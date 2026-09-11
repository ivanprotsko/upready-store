import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import TenantModule from "../modules/tenant";

/**
 * Which tenant created a product category. Categories are global in Medusa
 * (no sales channel on them), so this link is the only ownership record:
 * `GET /tenants/product-categories` lists through it, the panel's category
 * screens write through it, and `GET /store/tenant/product-categories` gives
 * a storefront only its own tenant's tree.
 */
export default defineLink(TenantModule.linkable.tenant, {
  linkable: ProductModule.linkable.productCategory.id,
  isList: true,
});
