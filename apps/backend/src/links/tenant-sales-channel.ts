import { defineLink } from "@medusajs/framework/utils";
import SalesChannelModule from "@medusajs/medusa/sales-channel";
import TenantModule from "../modules/tenant";

/**
 * The sales channel a tenant sells through. `createTenantWorkflow` mints the
 * channel and writes this link in the same run, `POST /tenants/products` puts
 * every product of the tenant into it, and `linkOrderToTenantWorkflow` walks it
 * backwards (channel → tenant) for every placed order. One channel per tenant
 * is the workflow's invariant, not a database constraint: the link table's
 * primary key is the pair (tenant_id, sales_channel_id).
 */
export default defineLink(TenantModule.linkable.tenant, SalesChannelModule.linkable.salesChannel);
