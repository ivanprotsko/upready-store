import {
  EMPTY_PAYMENT_PRE_NOTICE,
  EMPTY_PRE_NOTICE_ENTRY,
  readPaymentPreNotice,
  shouldShowPrePaymentNotice,
  storedPaymentPreNotice,
} from "../payment-pre-notice";

describe("shouldShowPrePaymentNotice", () => {
  it("hides the notice when nothing differs", () => {
    expect(shouldShowPrePaymentNotice(EMPTY_PRE_NOTICE_ENTRY, "rub")).toBe(false);
  });

  it("shows the notice when the charge currency differs from the cart's", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "usd" }, "rub"),
    ).toBe(true);
  });

  it("is case-insensitive on the currency comparison", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "RUB" }, "Rub"),
    ).toBe(false);
  });

  it("shows the notice for a foreign card, same currency", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, is_foreign_card: true }, "rub"),
    ).toBe(true);
  });

  it("shows the notice for a redirect kind alone", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirect_kind: "domain" }, "rub"),
    ).toBe(true);
  });

  it("shows the notice for a crypto network redirect", () => {
    expect(
      shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirect_kind: "crypto_network" }, "rub"),
    ).toBe(true);
  });

  it("combines every condition without double-counting", () => {
    expect(
      shouldShowPrePaymentNotice(
        {
          ...EMPTY_PRE_NOTICE_ENTRY,
          charge_currency_code: "usd",
          is_foreign_card: true,
          redirect_kind: "bank",
        },
        "rub",
      ),
    ).toBe(true);
  });
});

describe("readPaymentPreNotice", () => {
  it("answers every provider key empty for a shop that configured nothing", () => {
    expect(readPaymentPreNotice(null)).toEqual(EMPTY_PAYMENT_PRE_NOTICE);
    expect(readPaymentPreNotice({})).toEqual(EMPTY_PAYMENT_PRE_NOTICE);
  });

  it("reads a stored entry, lower-casing the currency", () => {
    const doc = readPaymentPreNotice({
      payment_pre_notice: {
        robokassa: {
          charge_currency_code: "RUB",
          is_foreign_card: false,
          redirect_kind: "domain",
          redirect_value: "robokassa.ru",
          rate_source: "курс ЦБ РФ",
          refund_terms: "14 дней",
        },
      },
    });

    expect(doc.robokassa).toEqual({
      charge_currency_code: "rub",
      is_foreign_card: false,
      redirect_kind: "domain",
      redirect_value: "robokassa.ru",
      rate_source: "курс ЦБ РФ",
      refund_terms: "14 дней",
    });
    expect(doc.tribute).toEqual(EMPTY_PRE_NOTICE_ENTRY);
  });

  it("drops an unknown redirect kind rather than throw", () => {
    const doc = readPaymentPreNotice({
      payment_pre_notice: { manual: { redirect_kind: "spaceship" } },
    });
    expect(doc.manual.redirect_kind).toBeNull();
  });

  it("is defensive against a malformed document", () => {
    expect(readPaymentPreNotice({ payment_pre_notice: "not-an-object" })).toEqual(
      EMPTY_PAYMENT_PRE_NOTICE,
    );
    expect(readPaymentPreNotice({ payment_pre_notice: ["array"] })).toEqual(EMPTY_PAYMENT_PRE_NOTICE);
  });
});

describe("storedPaymentPreNotice", () => {
  it("merges one provider's patch and leaves every other key untouched", () => {
    const current = readPaymentPreNotice({
      payment_pre_notice: { robokassa: { rate_source: "курс ЦБ РФ" } },
    });

    const next = storedPaymentPreNotice(current, "card", { is_foreign_card: true });

    expect(next.card).toEqual({ ...EMPTY_PRE_NOTICE_ENTRY, is_foreign_card: true });
    expect(next.robokassa.rate_source).toBe("курс ЦБ РФ");
    expect(next.tribute).toEqual(EMPTY_PRE_NOTICE_ENTRY);
  });

  it("only overwrites the fields the patch names", () => {
    const current = readPaymentPreNotice({
      payment_pre_notice: { manual: { redirect_kind: "crypto_network", redirect_value: "TRC20" } },
    });

    const next = storedPaymentPreNotice(current, "manual", { refund_terms: "не предусмотрен" });

    expect(next.manual).toEqual({
      ...EMPTY_PRE_NOTICE_ENTRY,
      redirect_kind: "crypto_network",
      redirect_value: "TRC20",
      refund_terms: "не предусмотрен",
    });
  });
});

describe("no RU legal-entity requisites travel through this module", () => {
  it("the entry type carries no inn/ogrn field at all", () => {
    // Structural guarantee, not a runtime one: `PaymentPreNoticeEntry` has no
    // `inn`/`ogrn` key, so no code path through this module can leak them —
    // the seller's legal name for the notice is read elsewhere
    // (`GET /store/tenant/seller`, `name`/`legal_name` only), never here.
    const keys = Object.keys(EMPTY_PRE_NOTICE_ENTRY);
    expect(keys).not.toContain("inn");
    expect(keys).not.toContain("ogrn");
  });
});
