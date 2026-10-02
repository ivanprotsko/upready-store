import { PutTenantManualPaymentSchema } from "../../../validators";
import {
  EMPTY_MANUAL_PAYMENT,
  legacyManualPayment,
  manualPaymentPublicView,
  readManualPayment,
  storedManualPayment,
  type TenantManualPayment,
} from "../manual-payment";
import { bankIconFor } from "../presets";

const WALLET = { network: "TRC-20", currency: "USDT", address: "TTestWalletAddressForTheUnitSuite" };
const CARD = { bank: "Kaspi Gold", number: "4400 0000 0000 0000", holder: "Иван И." };
const CONTACTS = { whatsapp: null, telegram: "shop", email: null, note: null };

const BANK_ITEM = {
  id: "rq_bank",
  kind: "bank" as const,
  icon: "kaspi",
  bank: "Kaspi Gold",
  number: "4400 0000 0000 0000",
  holder: "Иван И.",
};
const CRYPTO_ITEM = {
  id: "rq_usdt",
  kind: "crypto" as const,
  currency: "USDT",
  network: "TRC20",
  address: "TTestWalletAddressForTheUnitSuite",
};

const LIST: TenantManualPayment = { enabled: true, requisites: [BANK_ITEM, CRYPTO_ITEM], contacts: CONTACTS };

describe("readManualPayment", () => {
  it("gives a shop that configured nothing the method off and an empty list", () => {
    expect(readManualPayment(null)).toEqual(EMPTY_MANUAL_PAYMENT);
    expect(readManualPayment({})).toEqual(EMPTY_MANUAL_PAYMENT);
    expect(readManualPayment({ manual_payment: "garbage" })).toEqual(EMPTY_MANUAL_PAYMENT);
  });

  it("reads the document from before the list: cards first with their icon, then wallets", () => {
    const read = readManualPayment({
      manual_payment: {
        crypto: { enabled: true, wallets: [WALLET, { network: "ERC-20", currency: "USDC" }, null] },
        manager: {
          enabled: false,
          cards: [CARD, { bank: "Some bank", number: " " }],
          whatsapp: "+79990000000",
          telegram: "shop",
          email: "",
          note: " ",
        },
      },
    });

    expect(read).toEqual({
      enabled: true,
      requisites: [
        { id: "card-0", kind: "bank", icon: "kaspi", bank: "Kaspi Gold", number: "4400 0000 0000 0000", holder: "Иван И." },
        { id: "wallet-1", kind: "crypto", currency: "USDT", network: "TRC20", address: WALLET.address },
      ],
      contacts: { whatsapp: "+79990000000", telegram: "shop", email: null, note: null },
    });
  });

  it("reads the list, drops a broken item and an unknown icon, and keeps ids unique", () => {
    const read = readManualPayment({
      manual_payment: {
        version: 2,
        enabled: true,
        requisites: [
          BANK_ITEM,
          { ...BANK_ITEM, icon: "sberbank" },
          { id: "rq_x", kind: "bank", bank: "No number" },
          { id: "rq_y", kind: "cash" },
          CRYPTO_ITEM,
        ],
        contacts: CONTACTS,
      },
    });

    expect(read.requisites).toEqual([
      BANK_ITEM,
      { ...BANK_ITEM, id: "rq_bank-1", icon: null },
      CRYPTO_ITEM,
    ]);
  });
});

describe("legacyManualPayment and storedManualPayment", () => {
  it("derives the two old sections from the list, so an old reader still finds its data", () => {
    expect(legacyManualPayment(LIST)).toEqual({
      crypto: { enabled: true, wallets: [{ network: "TRC20", currency: "USDT", address: CRYPTO_ITEM.address }] },
      manager: {
        enabled: true,
        cards: [{ bank: "Kaspi Gold", number: "4400 0000 0000 0000", holder: "Иван И." }],
        ...CONTACTS,
      },
    });

    const stored = storedManualPayment(LIST);
    expect(stored).toMatchObject({ version: 2, enabled: true, requisites: LIST.requisites, contacts: CONTACTS });
    expect(readManualPayment({ manual_payment: stored })).toEqual(LIST);
  });
});

describe("manualPaymentPublicView", () => {
  it("publishes nothing for a method that is off", () => {
    expect(manualPaymentPublicView({ ...LIST, enabled: false })).toEqual({
      enabled: false,
      requisites: [],
      contacts: null,
      crypto: { enabled: false },
      manager: { enabled: false },
    });
  });

  it("publishes the list in the owner's order with the asset icon on a wallet", () => {
    const view = manualPaymentPublicView(LIST);

    expect(view.enabled).toBe(true);
    expect(view.requisites).toEqual([BANK_ITEM, { ...CRYPTO_ITEM, icon: "usdt" }]);
    expect(view.contacts).toEqual(CONTACTS);
    expect(view.crypto).toEqual({ enabled: true, wallets: [{ network: "TRC20", currency: "USDT", address: CRYPTO_ITEM.address }] });
    expect(view.manager).toMatchObject({ enabled: true, telegram: "shop" });
  });

  it("offers a method with contacts only, the old «card via manager»", () => {
    const view = manualPaymentPublicView({ enabled: true, requisites: [], contacts: CONTACTS });

    expect(view.enabled).toBe(true);
    expect(view.crypto).toEqual({ enabled: false });
    expect(view.manager).toMatchObject({ enabled: true, cards: [] });
  });
});

describe("bankIconFor", () => {
  it("finds a preset in a free-text bank name, and none for a bank outside the list", () => {
    expect(bankIconFor("Kaspi Gold")).toBe("kaspi");
    expect(bankIconFor("Халык банк")).toBe("halyk");
    expect(bankIconFor("Банк ЦентрКредит")).toBe("bcc");
    expect(bankIconFor("Сбербанк")).toBeNull();
  });
});

describe("PutTenantManualPaymentSchema", () => {
  it("accepts a list of a bank item and a wallet", () => {
    const parsed = PutTenantManualPaymentSchema.parse({
      enabled: true,
      requisites: [
        { kind: "bank", icon: "halyk", bank: "Halyk", number: "4405 6300 0000 0000", holder: "" },
        { kind: "crypto", currency: "USDT", network: "TRC20", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" },
      ],
    });

    expect(parsed.requisites).toEqual([
      { kind: "bank", icon: "halyk", bank: "Halyk", number: "4405 6300 0000 0000", holder: null },
      { kind: "crypto", currency: "USDT", network: "TRC20", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" },
    ]);
  });

  it("refuses an icon outside the list, an address of the wrong network and a bad number", () => {
    expect(
      PutTenantManualPaymentSchema.safeParse({
        requisites: [{ kind: "bank", icon: "sberbank", bank: "X", number: "4400 0000 0000 0000" }],
      }).success,
    ).toBe(false);
    expect(
      PutTenantManualPaymentSchema.safeParse({
        requisites: [{ kind: "crypto", currency: "USDT", network: "ERC20", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" }],
      }).success,
    ).toBe(false);
    expect(
      PutTenantManualPaymentSchema.safeParse({
        requisites: [{ kind: "bank", bank: "X", number: "call me!" }],
      }).success,
    ).toBe(false);
    expect(
      PutTenantManualPaymentSchema.safeParse({
        requisites: [{ kind: "crypto", currency: "BTC", network: "TRC20", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" }],
      }).success,
    ).toBe(false);
  });

  it("accepts an EIP-55 address whatever its checksum: stubs must stay savable", () => {
    expect(
      PutTenantManualPaymentSchema.safeParse({
        requisites: [
          { kind: "crypto", currency: "USDC", network: "ERC20", address: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01" },
        ],
      }).success,
    ).toBe(true);
  });

  it("still accepts the body of a panel from before the list", () => {
    expect(PutTenantManualPaymentSchema.parse({ crypto: { enabled: true, wallets: [WALLET] } })).toEqual({
      crypto: { enabled: true, wallets: [WALLET] },
    });
  });

  it("clears an empty contact to null and strips the @ off a Telegram username", () => {
    expect(
      PutTenantManualPaymentSchema.parse({
        contacts: { whatsapp: "", telegram: "@shop_owner", email: null, note: "" },
      }),
    ).toEqual({
      contacts: { whatsapp: null, telegram: "shop_owner", email: null, note: null },
    });
  });

  it("refuses a WhatsApp number that is not digits, an unknown field and more than 30 items", () => {
    expect(PutTenantManualPaymentSchema.safeParse({ contacts: { whatsapp: "call me" } }).success).toBe(false);
    expect(PutTenantManualPaymentSchema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);
    const item = { kind: "bank", bank: "X", number: "4400 0000 0000 0000" };
    expect(PutTenantManualPaymentSchema.safeParse({ requisites: Array(31).fill(item) }).success).toBe(false);
  });
});
