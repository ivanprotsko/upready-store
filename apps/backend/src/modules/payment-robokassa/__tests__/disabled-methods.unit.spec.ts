import { PaymentSessionStatus } from "@medusajs/framework/utils";

import { sameOutSum } from "../../../tenant-secrets/robokassa";
import {
  ROBOKASSA_FALLBACK_METHODS,
  robokassaMethodsForPanel,
  withoutDisabledMethods,
  type RobokassaPaymentMethodsResult,
} from "../payment-methods";
import RobokassaPaymentProviderService from "../service";

/**
 * t-2026-10-12-13. Ivan 12.10, 4.1: «нужно выключить оплату СБП» — the owner's
 * switch per method, and 3.1 — once the buyer is back from a success, the cart
 * is an order (the provider's statuses below), so there is nothing to pay twice.
 */

const shopList: RobokassaPaymentMethodsResult = {
  source: "live",
  methods: [
    { alias: "BankCard", name_ru: "Банковская карта", name_en: "Bank card", min: null, max: null },
    { alias: "SBP", name_ru: "Банковская карта", name_en: "Bank Card", min: null, max: 1000000 },
    { alias: "BankCardHalva", name_ru: "Карта Халва", name_en: "Halva", min: null, max: null },
  ],
};

describe("withoutDisabledMethods", () => {
  it("drops a switched-off alias from the shop's list", () => {
    expect(withoutDisabledMethods(shopList, ["SBP"]).methods.map((method) => method.alias)).toEqual([
      "BankCard",
      "BankCardHalva",
    ]);
  });

  it("drops it from the card-and-SBP fallback too, so an outage does not bring SBP back", () => {
    const fallback: RobokassaPaymentMethodsResult = {
      source: "fallback",
      methods: ROBOKASSA_FALLBACK_METHODS.map((method) => ({ ...method })),
    };
    expect(withoutDisabledMethods(fallback, ["SBP"])).toEqual({
      source: "fallback",
      methods: [{ alias: "BankCard", name_ru: "Банковская карта", name_en: "Bank card", min: null, max: null }],
    });
  });

  it("keeps the list as it is without a switch, and ignores anything not shaped like an alias", () => {
    expect(withoutDisabledMethods(shopList, [])).toBe(shopList);
    expect(withoutDisabledMethods(shopList, undefined)).toBe(shopList);
    expect(withoutDisabledMethods(shopList, ["<script>"]).methods).toHaveLength(3);
  });
});

describe("robokassaMethodsForPanel", () => {
  it("lists every method of the shop with its switch, card and SBP even when Robokassa did not list them", () => {
    const panel = robokassaMethodsForPanel({ source: "live", methods: [shopList.methods[2]] }, ["SBP"]);
    expect(panel.map(({ alias, enabled }) => [alias, enabled])).toEqual([
      ["BankCardHalva", true],
      ["BankCard", true],
      ["SBP", false],
    ]);
  });

  it("keeps an alias the owner switched off that Robokassa no longer lists, so it can be switched on again", () => {
    const panel = robokassaMethodsForPanel(shopList, ["YandexPaySplit"]);
    expect(panel.at(-1)).toEqual({ alias: "YandexPaySplit", name_ru: null, name_en: null, min: null, max: null, enabled: false });
  });
});

describe("sameOutSum", () => {
  it("compares money to the kopeck, whatever the number of decimals", () => {
    expect(sameOutSum("1740.00", "1740.000000")).toBe(true);
    expect(sameOutSum("1740", "1740.00")).toBe(true);
    expect(sameOutSum("1740.01", "1740.00")).toBe(false);
    expect(sameOutSum("", "0")).toBe(false);
    expect(sameOutSum(null, "1.00")).toBe(false);
    expect(sameOutSum("abc", "abc")).toBe(false);
  });
});

describe("RobokassaPaymentProviderService statuses (t-2026-10-12-13)", () => {
  const provider = new RobokassaPaymentProviderService(
    { logger: { info: () => undefined, warn: () => undefined } as never, __pg_connection__: {} as never },
    {},
  );
  const base = { out_sum: "1740.00", invoice_id: "1", session_id: "payses_1" };

  const status = async (data: Record<string, unknown>) =>
    (await provider.authorizePayment({ data, context: {} } as never)).status;

  it("captures only on the Result webhook's stamp", async () => {
    await expect(status({ ...base, result_confirmed_at: "2026-10-12T08:00:00Z", result_out_sum: "1740.000000" })).resolves.toBe(
      PaymentSessionStatus.CAPTURED,
    );
  });

  it("authorizes on a return the signature or OpStateExt proved", async () => {
    await expect(
      status({ ...base, return_confirmed_at: "2026-10-12T08:00:00Z", return_confirmed_by: "success_signature", return_out_sum: "1740.00" }),
    ).resolves.toBe(PaymentSessionStatus.AUTHORIZED);
  });

  it("refuses a proved return for another sum", async () => {
    await expect(
      status({ ...base, return_confirmed_at: "2026-10-12T08:00:00Z", return_out_sum: "1.00" }),
    ).resolves.toBe(PaymentSessionStatus.PENDING);
  });

  it("places the order without a payment after a return nothing proved", async () => {
    await expect(status({ ...base, return_seen_at: "2026-10-12T08:00:00Z" })).resolves.toBe(
      PaymentSessionStatus.PENDING_AUTHORIZATION,
    );
  });

  it("refuses the completion of a session nobody came back to", async () => {
    await expect(status({ ...base })).resolves.toBe(PaymentSessionStatus.PENDING);
  });

  it("never rebuilds the payment request of a session the buyer came back to", async () => {
    const data = { ...base, return_seen_at: "2026-10-12T08:00:00Z", tenant_id: "ten_1" };
    await expect(provider.updatePayment({ data, amount: 9999, currency_code: "rub" } as never)).resolves.toEqual({ data });
  });
});
