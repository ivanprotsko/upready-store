import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import BitcartPaymentProviderService from "./service";

/**
 * Bitcart as a Medusa payment provider, registered under `pp_bitcart_bitcart`
 * (ask-20261005-070255-438f, stage 2). One registration serves every shop:
 * the server, store and key are a per-tenant row resolved on every call
 * (`service.ts`), the pattern of `payment-btcpay`. No shop offers it until its
 * owner saves and switches on a store in the panel.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [BitcartPaymentProviderService],
});
