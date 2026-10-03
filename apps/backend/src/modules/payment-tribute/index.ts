import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import TributePaymentProviderService from "./service";

/**
 * Tribute as a Medusa payment provider, registered under `pp_tribute_tribute`
 * (t-cherk-22). One registration serves every shop: the credentials are not
 * options here but a per-tenant row resolved on every call (`service.ts`),
 * the same pattern `payment-robokassa` uses.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [TributePaymentProviderService],
});
