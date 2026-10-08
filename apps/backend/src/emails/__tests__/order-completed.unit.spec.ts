import { createElement } from "react";
import { render } from "@react-email/render";
import { OrderCompletedEmail } from "../order-completed";
import { type EmailLocale } from "../i18n";
import { emailMessages } from "../i18n/messages";

/**
 * The "order completed" letter is a service letter. The customer never agreed
 * to advertising, so it says what happened to the order and nothing more. The
 * letter used to end its summary with an invitation to look at new arrivals,
 * and these guard against that line coming back.
 */
const order = {
  id: "order_test",
  display_id: 1042,
  currency_code: "rub",
  total: 3400,
  shipping_total: 400,
  shipping_address: { first_name: "Test", last_name: "Buyer", city: "Testgrad" },
  items: [{ title: "Sample item", quantity: 2, unit_price: 1500 }],
};

const textLines = async (locale: EmailLocale) =>
  (
    await render(createElement(OrderCompletedEmail, { order, locale }), {
      plainText: true,
    })
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

describe("OrderCompletedEmail", () => {
  it("goes from the order summary straight to the orders button", async () => {
    const lines = await textLines("en");
    const total = lines.findIndex((line) => line.startsWith("Total"));

    expect(total).toBeGreaterThan(-1);
    expect(lines[total + 1]).toMatch(/^My orders /);
  });

  it("keeps one set of keys in every dictionary, none of them a promotion", () => {
    const keys = [
      "bodyOrder",
      "deliveryCity",
      "headingAnon",
      "headingWithName",
      "preview",
      "subject",
      "textFallback",
    ];

    expect(Object.keys(emailMessages)).toHaveLength(36);
    for (const [locale, messages] of Object.entries(emailMessages)) {
      expect([locale, Object.keys(messages.OrderCompleted).sort()]).toEqual([
        locale,
        keys,
      ]);
    }
  });
});
