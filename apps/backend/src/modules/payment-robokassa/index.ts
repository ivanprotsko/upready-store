import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import RobokassaPaymentProviderService from "./service";

/**
 * Robokassa as a Medusa payment provider, registered under
 * `pp_robokassa_robokassa` (t03-tenant-secrets-robokassa). One registration
 * serves every shop: the credentials are not options here but a per-tenant row
 * resolved on every call (`service.ts`).
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [RobokassaPaymentProviderService],
});
