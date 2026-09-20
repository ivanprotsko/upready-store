import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import CdekFulfillmentService from "./service";

/**
 * CDEK as a Medusa fulfillment provider, registered under `cdek_cdek`
 * (config id `cdek` + identifier `cdek`) — i02-apiship-cdek-shipping.
 *
 * One registration serves every shop: the credentials are not options here but a
 * per-tenant row (`src/tenant-secrets/cdek.ts`), resolved on every call from the
 * `tenant_id` the shipping option carries in its `data`.
 */
export const CDEK_PROVIDER_ID = "cdek_cdek";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [CdekFulfillmentService],
});
