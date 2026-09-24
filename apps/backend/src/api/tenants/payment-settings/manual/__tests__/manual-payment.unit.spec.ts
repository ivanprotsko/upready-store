import { PutTenantManualPaymentSchema } from "../../../validators";
import {
  EMPTY_MANUAL_PAYMENT,
  manualPaymentPublicView,
  readManualPayment,
} from "../manual-payment";

const WALLET = { network: "TRC-20", currency: "USDT", address: "TTestWalletAddressForTheUnitSuite" };

describe("readManualPayment", () => {
  it("gives a shop that configured nothing both sections off", () => {
    expect(readManualPayment(null)).toEqual(EMPTY_MANUAL_PAYMENT);
    expect(readManualPayment({})).toEqual(EMPTY_MANUAL_PAYMENT);
    expect(readManualPayment({ manual_payment: "garbage" })).toEqual(EMPTY_MANUAL_PAYMENT);
  });

  it("reads a stored document and drops a wallet that is missing a field", () => {
    const read = readManualPayment({
      manual_payment: {
        crypto: { enabled: true, wallets: [WALLET, { network: "ERC-20", currency: "USDC" }, null] },
        manager: { enabled: true, whatsapp: "+79990000000", telegram: "shop", email: "", note: " " },
      },
    });

    expect(read).toEqual({
      crypto: { enabled: true, wallets: [WALLET] },
      manager: { enabled: true, whatsapp: "+79990000000", telegram: "shop", email: null, note: null },
    });
  });
});

describe("manualPaymentPublicView", () => {
  it("hides the wallets of a section that is off and the contacts of a manager that is off", () => {
    const view = manualPaymentPublicView({
      crypto: { enabled: false, wallets: [WALLET] },
      manager: { enabled: false, whatsapp: "+79990000000", telegram: null, email: null, note: null },
    });

    expect(view).toEqual({ crypto: { enabled: false }, manager: { enabled: false } });
  });

  it("treats a crypto section with no wallet as off, because there is nothing to pay to", () => {
    const view = manualPaymentPublicView({
      ...EMPTY_MANUAL_PAYMENT,
      crypto: { enabled: true, wallets: [] },
    });

    expect(view.crypto).toEqual({ enabled: false });
  });

  it("publishes wallets and contacts of the sections that are on", () => {
    const view = manualPaymentPublicView({
      crypto: { enabled: true, wallets: [WALLET] },
      manager: { enabled: true, whatsapp: null, telegram: "shop", email: "shop@example.com", note: "note" },
    });

    expect(view).toEqual({
      crypto: { enabled: true, wallets: [WALLET] },
      manager: { enabled: true, whatsapp: null, telegram: "shop", email: "shop@example.com", note: "note" },
    });
  });
});

describe("PutTenantManualPaymentSchema", () => {
  it("accepts one section alone, so a PUT changes only what it names", () => {
    expect(PutTenantManualPaymentSchema.parse({ crypto: { enabled: true, wallets: [WALLET] } })).toEqual({
      crypto: { enabled: true, wallets: [WALLET] },
    });
  });

  it("clears an empty contact to null and strips the @ off a Telegram username", () => {
    expect(
      PutTenantManualPaymentSchema.parse({
        manager: { enabled: true, whatsapp: "", telegram: "@shop_owner", email: null, note: "" },
      }),
    ).toEqual({
      manager: { enabled: true, whatsapp: null, telegram: "shop_owner", email: null, note: null },
    });
  });

  it("refuses a WhatsApp number that is not digits and an unknown field", () => {
    expect(
      PutTenantManualPaymentSchema.safeParse({ manager: { enabled: true, whatsapp: "call me" } }).success,
    ).toBe(false);
    expect(
      PutTenantManualPaymentSchema.safeParse({ crypto: { enabled: true, wallets: [], extra: 1 } }).success,
    ).toBe(false);
    expect(
      PutTenantManualPaymentSchema.safeParse({
        crypto: { enabled: true, wallets: [{ network: "TRC-20", currency: "USDT", address: "" }] },
      }).success,
    ).toBe(false);
  });
});
