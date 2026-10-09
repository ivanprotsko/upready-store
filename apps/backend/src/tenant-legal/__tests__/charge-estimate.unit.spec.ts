import { chargeConversionFactor } from "../charge-estimate";

const line = (variant_id: string | null) => ({ variant_id });

describe("chargeConversionFactor", () => {
  it("converts RUB cart total into a foreign charge currency (factor = 1 / rate)", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "rub",
      "usd",
    );
    expect(factor).toBe(1 / 95);
    expect(9500 * (factor as number)).toBe(100);
  });

  it("converts a foreign-currency cart total into a RUB charge (factor = rate) — the main acceptance case: cherkashino.com (USD) paying through Robokassa (RUB)", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "usd",
      "rub",
    );
    expect(factor).toBe(95);
    expect(100 * (factor as number)).toBe(9500);
  });

  it("returns null when neither side is RUB", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 }, eur: { rate: 100 } } } }],
      "usd",
      "eur",
    );
    expect(factor).toBeNull();
  });

  it("returns null when the cart and target currency are the same", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { rub: { rate: 1 } } } }],
      "rub",
      "rub",
    );
    expect(factor).toBeNull();
  });

  it("returns null when no line carries a usable stamp", () => {
    const factor = chargeConversionFactor([line("v1")], [{ id: "v1", metadata: null }], "rub", "usd");
    expect(factor).toBeNull();
  });

  it("returns null when the lines disagree on the rate", () => {
    const factor = chargeConversionFactor(
      [line("v1"), line("v2")],
      [
        { id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } },
        { id: "v2", metadata: { script_prices: { usd: { rate: 90 } } } },
      ],
      "rub",
      "usd",
    );
    expect(factor).toBeNull();
  });

  it("returns null when the lines disagree on the rate, RUB-target direction too", () => {
    const factor = chargeConversionFactor(
      [line("v1"), line("v2")],
      [
        { id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } },
        { id: "v2", metadata: { script_prices: { usd: { rate: 90 } } } },
      ],
      "usd",
      "rub",
    );
    expect(factor).toBeNull();
  });

  it("ignores a line with no variant id, one usable stamp is enough", () => {
    const factor = chargeConversionFactor(
      [line(null), line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "usd",
      "rub",
    );
    expect(factor).toBe(95);
  });

  it("never invents a rate when none is stamped", () => {
    const factor = chargeConversionFactor([line("v1")], [], "rub", "usd");
    expect(factor).toBeNull();
  });
});

describe("chargeConversionFactor: the source of the stamped rate", () => {
  it("ignores a rate the script quoted from another currency (from=jpy: yen per dollar, not roubles)", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 158.28, from: "jpy" } } } }],
      "usd",
      "rub",
    );
    expect(factor).toBeNull();
  });

  it("reads a rate stamped from=rub the same as one written before from= existed", () => {
    const factor = chargeConversionFactor(
      [line("v1")],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95, from: "rub" } } } }],
      "usd",
      "rub",
    );
    expect(factor).toBe(95);
  });
});
