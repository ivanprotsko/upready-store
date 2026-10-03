import {
  manualPaymentMethods,
  offersSystemDefault,
  resolveTenantPaymentMethods,
} from "../payment-methods";

/**
 * The one resolver every caller (`/store/payment-providers`,
 * `/storefront/by-host`, `/tenants/payment-settings`) reads to decide which
 * payment methods a shop has actually connected. Every combination named in
 * the task (t-2026-09-24-n10): nothing, Robokassa only, manual only, both —
 * plus the two invariants Ivan's report turns on: a disabled Robokassa
 * account counts as not connected, and the demo card is never itself a
 * "connected" method. Tribute (t-cherk-22) joins the same resolver, so its
 * own on/off is exercised alongside Robokassa's rather than in a parallel
 * suite.
 */

describe("resolveTenantPaymentMethods", () => {
  it("nothing connected: only the demo card is offered", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: false,
      tributeEnabled: false,
      manualCrypto: false,
      manualManager: false,
    });

    expect(methods).toEqual({
      robokassa: false,
      tribute: false,
      manualCrypto: false,
      manualManager: false,
      demo: true,
    });
    expect(offersSystemDefault(methods)).toBe(true);
  });

  it("Robokassa only: the demo card disappears", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: true,
      tributeEnabled: false,
      manualCrypto: false,
      manualManager: false,
    });

    expect(methods.demo).toBe(false);
    expect(offersSystemDefault(methods)).toBe(false);
  });

  it("Tribute only: the demo card disappears, same as Robokassa only", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: false,
      tributeEnabled: true,
      manualCrypto: false,
      manualManager: false,
    });

    expect(methods).toEqual({
      robokassa: false,
      tribute: true,
      manualCrypto: false,
      manualManager: false,
      demo: false,
    });
    expect(offersSystemDefault(methods)).toBe(false);
  });

  it("Robokassa and Tribute both connected: both read true, demo stays hidden", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: true,
      tributeEnabled: true,
      manualCrypto: false,
      manualManager: false,
    });

    expect(methods.robokassa).toBe(true);
    expect(methods.tribute).toBe(true);
    expect(methods.demo).toBe(false);
  });

  it("manual crypto only: pp_system_default stays, for the crypto kind, not as demo", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: false,
      tributeEnabled: false,
      manualCrypto: true,
      manualManager: false,
    });

    expect(methods.demo).toBe(false);
    expect(offersSystemDefault(methods)).toBe(true);
  });

  it("manual manager only: pp_system_default stays, for the manager kind, not as demo", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: false,
      tributeEnabled: false,
      manualCrypto: false,
      manualManager: true,
    });

    expect(methods.demo).toBe(false);
    expect(offersSystemDefault(methods)).toBe(true);
  });

  it("Robokassa and a manual kind both connected: pp_system_default stays for the manual kind", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: true,
      tributeEnabled: false,
      manualCrypto: true,
      manualManager: false,
    });

    expect(methods.demo).toBe(false);
    expect(offersSystemDefault(methods)).toBe(true);
  });

  it("Robokassa and no manual kind: pp_system_default is hidden, not offered as demo alongside a real method", () => {
    const methods = resolveTenantPaymentMethods({
      robokassaEnabled: true,
      tributeEnabled: false,
      manualCrypto: false,
      manualManager: false,
    });

    expect(offersSystemDefault(methods)).toBe(false);
  });
});

describe("manualPaymentMethods", () => {
  // Operates on an ALREADY-PARSED `TenantManualPayment` document (the
  // defensive parsing of the raw `tenant.metadata.manual_payment` JSON is
  // `readManualPayment`'s job — see
  // `api/tenants/payment-settings/manual/__tests__/manual-payment.unit.spec.ts`).
  const doc = (overrides: {
    crypto?: { enabled: boolean; wallets: unknown[] };
    manager?: { enabled: boolean };
  } = {}) => ({
    crypto: { enabled: false, wallets: [] as unknown[] },
    manager: { enabled: false },
    ...overrides,
  });

  it("nothing enabled: both false", () => {
    expect(manualPaymentMethods(doc())).toEqual({ manualCrypto: false, manualManager: false });
  });

  it("crypto needs a wallet on top of being switched on", () => {
    expect(manualPaymentMethods(doc({ crypto: { enabled: true, wallets: [] } }))).toEqual({
      manualCrypto: false,
      manualManager: false,
    });
    expect(
      manualPaymentMethods(doc({ crypto: { enabled: true, wallets: [{ network: "TRC-20" }] } })),
    ).toEqual({ manualCrypto: true, manualManager: false });
    // Switched off with wallets on file still counts as not connected.
    expect(
      manualPaymentMethods(doc({ crypto: { enabled: false, wallets: [{ network: "TRC-20" }] } })),
    ).toEqual({ manualCrypto: false, manualManager: false });
  });

  it("manager needs only the switch, because the write side already requires a contact to enable it", () => {
    expect(manualPaymentMethods(doc({ manager: { enabled: true } }))).toEqual({
      manualCrypto: false,
      manualManager: true,
    });
    expect(manualPaymentMethods(doc({ manager: { enabled: false } }))).toEqual({
      manualCrypto: false,
      manualManager: false,
    });
  });

  it("both kinds at once", () => {
    expect(
      manualPaymentMethods(
        doc({ crypto: { enabled: true, wallets: [{ network: "TRC-20" }] }, manager: { enabled: true } }),
      ),
    ).toEqual({ manualCrypto: true, manualManager: true });
  });
});
