import { SBP_ALIAS, SBP_PAGE_RULES, sbpOffPageBody, withSbpOff } from "../data/sbp-off";

// t-2026-10-12-32: the texts are the ones cherkashino.ru showed on 13.10, in the markdown the
// panel stores; the shop and the people in them are the real shop's, there is nothing personal.
const DELIVERY = [
  "## Оплата",
  "",
  "Цены на сайте указаны в рублях. Заказ оплачивается на сайте при оформлении, одним из способов:",
  "",
  "- банковской картой;",
  "- через Систему быстрых платежей (СБП).",
  "",
  "Платежи принимает сервис [Robokassa](https://robokassa.com/).",
].join("\n");

const OFFER = [
  "5.3. **Способы оплаты**, доступные на Сайте:",
  "- оплата банковской картой через платёжный сервис Robokassa;",
  "- оплата через Систему быстрых платежей (СБП) через платёжный сервис Robokassa.",
  "",
  "Продавец не принимает к оплате цифровую валюту.",
].join("\n");

const ABOUT = "- Цены в рублях, оплата на сайте картой или через СБП (Robokassa)\n- Категории";

describe("withSbpOff", () => {
  it("adds SBP to the owner's list and keeps what was there", () => {
    expect(withSbpOff([])).toEqual([SBP_ALIAS]);
    expect(withSbpOff(["BankCardHalva"])).toEqual(["BankCardHalva", SBP_ALIAS]);
  });

  it("answers null when SBP is off already, so nothing is written", () => {
    expect(withSbpOff(["SBP"])).toBeNull();
  });
});

describe("sbpOffPageBody", () => {
  it("leaves the card alone on «Доставка и оплата»", () => {
    const edit = sbpOffPageBody("delivery", DELIVERY);
    expect(edit.outcome).toBe("changed");
    expect(edit.body).toContain("Заказ оплачивается на сайте при оформлении банковской картой.");
    expect(edit.body).not.toMatch(/СБП|быстрых платежей|одним из способов/);
    expect(edit.body).toContain("Платежи принимает сервис [Robokassa](https://robokassa.com/).");
  });

  it("closes the offer's 5.3 list on the card", () => {
    const edit = sbpOffPageBody("offer", OFFER);
    expect(edit.outcome).toBe("changed");
    expect(edit.body).toBe(
      [
        "5.3. **Способы оплаты**, доступные на Сайте:",
        "- оплата банковской картой через платёжный сервис Robokassa.",
        "",
        "Продавец не принимает к оплате цифровую валюту.",
      ].join("\n"),
    );
  });

  it("drops SBP from «О магазине»", () => {
    const edit = sbpOffPageBody("about", ABOUT);
    expect(edit).toEqual({
      outcome: "changed",
      body: "- Цены в рублях, оплата на сайте картой (Robokassa)\n- Категории",
    });
  });

  it("matches list items written with * or numbers and Windows line ends", () => {
    const starred = DELIVERY.replace(/^- /gm, "* ").replace(/\n/g, "\r\n");
    expect(sbpOffPageBody("delivery", starred).outcome).toBe("changed");
  });

  it("does nothing the second time", () => {
    const once = sbpOffPageBody("delivery", DELIVERY).body;
    expect(sbpOffPageBody("delivery", once)).toEqual({ outcome: "already", body: once });
  });

  it("leaves a page the owner reworded to the owner", () => {
    const own = "Оплата картой или по СБП — как вам удобнее.";
    expect(sbpOffPageBody("delivery", own)).toEqual({ outcome: "different", body: own });
  });

  it("has no rule for any other page", () => {
    expect(sbpOffPageBody("returns", "СБП")).toEqual({ outcome: "no-rule", body: "СБП" });
    expect(SBP_PAGE_RULES.map((rule) => rule.key)).toEqual(["about", "delivery", "offer"]);
  });
});
