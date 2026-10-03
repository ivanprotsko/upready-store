import { estimateChargeAmount } from "../charge-estimate";

const line = (variant_id: string | null, unit_price: number, quantity = 1) => ({
  variant_id,
  unit_price,
  quantity,
});

describe("estimateChargeAmount", () => {
  it("converts using the stamped rate (RUB per unit of the target currency)", () => {
    const amount = estimateChargeAmount(
      [line("v1", 9500, 1)],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "rub",
      "usd",
    );
    expect(amount).toBe(100);
  });

  it("sums several lines before converting", () => {
    const amount = estimateChargeAmount(
      [line("v1", 9500, 2), line("v2", 4750, 1)],
      [
        { id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } },
        { id: "v2", metadata: { script_prices: { usd: { rate: 95 } } } },
      ],
      "rub",
      "usd",
    );
    expect(amount).toBe(250);
  });

  it("returns null when the cart is not priced in RUB", () => {
    const amount = estimateChargeAmount(
      [line("v1", 100, 1)],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "usd",
      "usd",
    );
    expect(amount).toBeNull();
  });

  it("returns null when no line carries a usable stamp", () => {
    const amount = estimateChargeAmount(
      [line("v1", 9500, 1)],
      [{ id: "v1", metadata: null }],
      "rub",
      "usd",
    );
    expect(amount).toBeNull();
  });

  it("returns null when the lines disagree on the rate", () => {
    const amount = estimateChargeAmount(
      [line("v1", 9500, 1), line("v2", 9500, 1)],
      [
        { id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } },
        { id: "v2", metadata: { script_prices: { usd: { rate: 90 } } } },
      ],
      "rub",
      "usd",
    );
    expect(amount).toBeNull();
  });

  it("ignores a line with no variant id", () => {
    const amount = estimateChargeAmount(
      [line(null, 500, 1), line("v1", 9500, 1)],
      [{ id: "v1", metadata: { script_prices: { usd: { rate: 95 } } } }],
      "rub",
      "usd",
    );
    // The giftcard-less line with no variant contributes to the subtotal but
    // not to rate discovery; one usable stamp is enough to convert the whole total.
    expect(amount).toBe(Math.round((500 + 9500) / 95 * 100) / 100);
  });

  it("never invents a rate when none is stamped", () => {
    const amount = estimateChargeAmount([line("v1", 9500, 1)], [], "rub", "usd");
    expect(amount).toBeNull();
  });
});
