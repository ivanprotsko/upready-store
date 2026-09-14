import { defineLink } from "@medusajs/framework/utils";
import ApiKeyModule from "@medusajs/medusa/api-key";
import TenantModule from "../modules/tenant";

/**
 * The publishable API key the tenant's storefront calls the API with. Minted
 * and linked by `createTenantWorkflow`; `GET /tenants/me` reads it back
 * through this link (a publishable key's token is stored in clear by the API
 * Key Module, so the tenant can always see its own). One key per tenant is the
 * workflow's invariant, not a database constraint.
 */
export default defineLink(TenantModule.linkable.tenant, ApiKeyModule.linkable.apiKey);
