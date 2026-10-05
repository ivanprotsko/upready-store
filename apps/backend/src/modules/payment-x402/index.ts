import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import X402PaymentProviderService from "./service";

/**
 * x402 as a Medusa payment provider, registered under `pp_x402_x402`
 * (t-2026-10-03-33). One registration serves every shop: the receiving
 * address, networks and facilitator are a per-tenant row resolved on every
 * call (`service.ts`), the pattern of `payment-btcpay`. No shop offers it until
 * its owner saves and switches on x402 in the panel.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [X402PaymentProviderService],
});
