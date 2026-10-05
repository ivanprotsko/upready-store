import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import BtcpayPaymentProviderService from "./service";

/**
 * BTCPay Server as a Medusa payment provider, registered under
 * `pp_btcpay_btcpay` (ask-20261005-070255-438f). One registration serves every
 * shop: the server, store and key are a per-tenant row resolved on every call
 * (`service.ts`), the pattern of `payment-tribute`. No shop offers it until its
 * owner saves and switches on a store in the panel.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [BtcpayPaymentProviderService],
});
