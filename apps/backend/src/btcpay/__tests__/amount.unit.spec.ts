import { BigNumber } from "@medusajs/framework/utils";
import { amountToNumber, currencyDigits, sameAmount, toBtcpayAmount, toMinorUnits } from "../amount";

/**
 * ask-20261005-070255-438f: Medusa gives the provider a MAJOR amount, Greenfield
 * takes and returns a decimal string. The conversion goes through integer
 * minor units in both directions.
 */

describe("currencyDigits", () => {
  it("knows the ISO 4217 exponent of a currency, whatever its case", () => {
    expect(currencyDigits("usd")).toBe(2);
    expect(currencyDigits("EUR")).toBe(2);
    expect(currencyDigits("jpy")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });

  it("falls back to two digits for a code Intl refuses", () => {
    expect(currencyDigits("not-a-code")).toBe(2);
  });
});

describe("amountToNumber", () => {
  it("reads a number, a numeric string and Medusa's BigNumber", () => {
    expect(amountToNumber(25.5)).toBe(25.5);
    expect(amountToNumber("25.50")).toBe(25.5);
    expect(amountToNumber(new BigNumber(25.5))).toBe(25.5);
  });

  it("answers NaN for nothing usable", () => {
    expect(amountToNumber("")).toBeNaN();
    expect(amountToNumber(null)).toBeNaN();
    expect(amountToNumber(undefined)).toBeNaN();
  });
});

describe("toBtcpayAmount", () => {
  it("writes the currency's own number of digits", () => {
    expect(toBtcpayAmount(25.5, "usd")).toBe("25.50");
    expect(toBtcpayAmount(25, "eur")).toBe("25.00");
    expect(toBtcpayAmount("0.5", "usd")).toBe("0.50");
    expect(toBtcpayAmount(0.07, "usd")).toBe("0.07");
    expect(toBtcpayAmount(1000, "jpy")).toBe("1000");
    expect(toBtcpayAmount(1.5, "kwd")).toBe("1.500");
  });

  it("never lets binary float noise reach the invoice", () => {
    expect(toBtcpayAmount(0.1 + 0.2, "usd")).toBe("0.30");
    expect(toBtcpayAmount(1.005, "usd")).toBe("1.01");
    expect(toMinorUnits(19.99, "usd")).toBe(1999);
  });
});

describe("sameAmount", () => {
  it("compares in minor units, so Greenfield's spellings of one amount agree", () => {
    expect(sameAmount("25.5", "25.50", "usd")).toBe(true);
    expect(sameAmount("25.50000000", 25.5, "usd")).toBe(true);
    expect(sameAmount("25.51", 25.5, "usd")).toBe(false);
    expect(sameAmount("1000", 1000, "jpy")).toBe(true);
  });

  it("is never true for an amount that cannot be read", () => {
    expect(sameAmount(undefined, undefined, "usd")).toBe(false);
    expect(sameAmount("abc", "abc", "usd")).toBe(false);
  });
});
