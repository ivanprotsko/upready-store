import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PochtaFulfillmentService from "./service";

/**
 * Russian Post as a Medusa fulfillment provider, registered under
 * `pochta_pochta` (config id `pochta` + identifier `pochta`) — 46df-pochta.
 *
 * One registration serves every shop: the token is a per-tenant row
 * (`src/tenant-secrets/pochta.ts`), resolved on every call from the
 * `tenant_id` the shipping option carries in its `data`.
 */
export const POCHTA_PROVIDER_ID = "pochta_pochta";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [PochtaFulfillmentService],
});
