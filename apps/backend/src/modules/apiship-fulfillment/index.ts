import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import ApishipFulfillmentService from "./service";

/**
 * ApiShip as a Medusa fulfillment provider, registered under `apiship_apiship`
 * (config id `apiship` + identifier `apiship`) — t-2026-10-14-58.
 *
 * One registration serves every shop: the credentials are not options here but
 * a per-tenant row (`src/tenant-secrets/apiship.ts`), resolved on every call
 * from the `tenant_id` the shipping option carries in its `data`.
 */
export const APISHIP_PROVIDER_ID = "apiship_apiship";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [ApishipFulfillmentService],
});
