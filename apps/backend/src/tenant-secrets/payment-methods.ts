import { cryptoPaymentsAvailable } from "../btcpay/availability";

/**
 * Which payment methods a shop has actually connected, the one resolver every
 * caller uses: the storefront's `/store/payment-providers` (checkout), the
 * public `/storefront/by-host` document, and the owner's own
 * `/tenants/payment-settings` read. Robokassa comes from
 * `tenant_integration_secret` (`readRobokassaSecret`, disabled counts as not
 * connected); the manual provider's two offline kinds come from
 * `tenant.metadata.manual_payment`, parsed by
 * `api/tenants/payment-settings/manual/manual-payment.ts`'s own
 * `readManualPayment` — this module only extracts the two booleans it needs
 * from that already-parsed document, rather than parsing the raw metadata a
 * second time. Crypto needs at least one complete wallet on top of being
 * switched on; «card via manager» needs only the switch, because the write
 * side already refuses to enable it without a contact.
 *
 * `pp_system_default`'s demo card is never something a shop "connects": it is
 * the one thing every shop starts with, and the last resort a shop with
 * nothing else falls back on. The moment any real method is connected, the
 * demo card has nothing left to be the fallback FOR.
 */

export type TenantPaymentMethods = {
  robokassa: boolean;
  tribute: boolean;
  /**
   * The shop's own BTCPay Server store, enabled (ask-20261005-070255-438f),
   * and only on an instance that takes cryptocurrency at all.
   */
  btcpay: boolean;
  manualCrypto: boolean;
  manualManager: boolean;
  demo: boolean;
};

/**
 * The shape this module needs out of `TenantManualPayment`
 * (`payment-settings/manual/manual-payment.ts`), structurally rather than by
 * importing that type: `tenant-secrets/` is a lower layer than `api/`, and an
 * API-route module is not something a shared secrets module should depend on.
 */
type ManualPaymentDoc = {
  crypto: { enabled: boolean; wallets: unknown[] };
  manager: { enabled: boolean };
};

/** The connection facts out of an already-parsed manual-payment document. */
export const manualPaymentMethods = (
  doc: ManualPaymentDoc,
): { manualCrypto: boolean; manualManager: boolean } => ({
  manualCrypto: doc.crypto.enabled && doc.crypto.wallets.length > 0,
  manualManager: doc.manager.enabled,
});

export const resolveTenantPaymentMethods = (params: {
  robokassaEnabled: boolean;
  tributeEnabled: boolean;
  btcpayEnabled: boolean;
  manualCrypto: boolean;
  manualManager: boolean;
  /**
   * Whether this instance takes cryptocurrency (`btcpay/availability.ts`).
   * Read from the environment unless given; a shop's saved BTCPay store
   * counts for nothing where it is `false`, so neither the checkout's
   * provider list nor `by-host` ever offer it there.
   */
  cryptoAvailable?: boolean;
}): TenantPaymentMethods => {
  const btcpay = params.btcpayEnabled && (params.cryptoAvailable ?? cryptoPaymentsAvailable());
  const hasRealMethod =
    params.robokassaEnabled ||
    params.tributeEnabled ||
    btcpay ||
    params.manualCrypto ||
    params.manualManager;

  return {
    robokassa: params.robokassaEnabled,
    tribute: params.tributeEnabled,
    btcpay,
    manualCrypto: params.manualCrypto,
    manualManager: params.manualManager,
    demo: !hasRealMethod,
  };
};

/** Whether `pp_system_default` belongs in the storefront's provider list at all: for its manual kinds, or as the last-resort demo card. */
export const offersSystemDefault = (methods: TenantPaymentMethods): boolean =>
  methods.manualCrypto || methods.manualManager || methods.demo;
