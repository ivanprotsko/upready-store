import { cartItemTotal, cartWeight, normaliseTariff, quoteTariff } from "../tariff";

describe("shipping tariffs: quoteTariff", () => {
  const ru = { currency_code: "rub", locale: "ru", default_weight_g: 500 };

  it("per_kg: 2.4 kg × 180 + 150 = 582", () => {
    const quote = quoteTariff(
      { kind: "per_kg", base_amount: 150, per_kg_amount: 180 },
      { ...ru, items: [{ quantity: 2, unit_price: 1000, weight: 700 }, { quantity: 1, unit_price: 500, weight: 1000 }] },
    );
    expect(quote.weight_g).toBe(2400);
    expect(quote.amount).toBe(582);
    expect(quote.used_default_weight).toBe(false);
    expect(quote.explanation).toBe("2,4 кг × 180 ₽ + 150 ₽");
  });

  it("per_kg: a line without weight takes the tenant default and says so", () => {
    const quote = quoteTariff(
      { kind: "per_kg", base_amount: 0, per_kg_amount: 100 },
      { ...ru, items: [{ quantity: 3, unit_price: 10, weight: null }] },
    );
    expect(quote.weight_g).toBe(1500);
    expect(quote.used_default_weight).toBe(true);
    expect(quote.amount).toBe(150);
    expect(quote.explanation).toBe("1,5 кг × 100 ₽");
  });

  it("per_kg: the minimum billable weight applies below it", () => {
    const quote = quoteTariff(
      { kind: "per_kg", base_amount: 50, per_kg_amount: 200, min_weight_g: 1000 },
      { ...ru, items: [{ quantity: 1, unit_price: 10, weight: 200 }] },
    );
    expect(quote.weight_g).toBe(200);
    expect(quote.amount).toBe(250);
    expect(quote.explanation).toBe("1 кг × 200 ₽ + 50 ₽");
  });

  it("per_kg: product weight is the second fallback, rounding to 2 decimals", () => {
    const quote = quoteTariff(
      { kind: "per_kg", base_amount: 0, per_kg_amount: 333 },
      { ...ru, items: [{ quantity: 1, unit_price: 10, weight: 0, product_weight: 333 }] },
    );
    expect(quote.weight_g).toBe(333);
    expect(quote.amount).toBe(110.89);
  });

  it("flat: the amount, no explanation", () => {
    const quote = quoteTariff({ kind: "flat", amount: 300 }, { ...ru, items: [{ quantity: 1, unit_price: 10 }] });
    expect(quote.amount).toBe(300);
    expect(quote.explanation).toBe("");
  });

  it("free_above: paid below the threshold, free at and above it", () => {
    const tariff = { kind: "free_above" as const, amount: 400, free_above_total: 5000 };
    const below = quoteTariff(tariff, { ...ru, items: [{ quantity: 2, unit_price: 2499.99 }] });
    expect(below.item_total).toBe(4999.98);
    expect(below.amount).toBe(400);
    expect(below.explanation).toBe("Бесплатно при заказе от 5 000 ₽");
    const at = quoteTariff(tariff, { ...ru, items: [{ quantity: 2, unit_price: 2500 }] });
    expect(at.amount).toBe(0);
  });

  it("english locale formats the explanation in English", () => {
    const quote = quoteTariff(
      { kind: "per_kg", base_amount: 2, per_kg_amount: 5 },
      { currency_code: "eur", locale: "en", default_weight_g: 500, items: [{ quantity: 1, unit_price: 10, weight: 1500 }] },
    );
    expect(quote.amount).toBe(9.5);
    expect(quote.explanation).toBe("1.5 kg × €5 + €2");
  });
});

describe("shipping tariffs: helpers", () => {
  it("cartWeight falls back to 500 g when the tenant default is not set", () => {
    expect(cartWeight([{ quantity: 2, unit_price: 1 }], 0)).toEqual({ weight_g: 1000, used_default_weight: true });
  });

  it("cartItemTotal ignores malformed lines", () => {
    expect(cartItemTotal([{ quantity: 2, unit_price: 10 }, { quantity: -1, unit_price: 10 }])).toBe(20);
  });

  it("normaliseTariff accepts the three kinds and refuses the rest", () => {
    expect(normaliseTariff({ kind: "flat", amount: 10.999 })).toEqual({ kind: "flat", amount: 11 });
    expect(normaliseTariff({ kind: "per_kg", base_amount: 1, per_kg_amount: 2 })).toEqual({
      kind: "per_kg",
      base_amount: 1,
      per_kg_amount: 2,
      min_weight_g: null,
    });
    expect(normaliseTariff({ kind: "free_above", amount: 5, free_above_total: 100 })).toEqual({
      kind: "free_above",
      amount: 5,
      free_above_total: 100,
    });
    expect(() => normaliseTariff({ kind: "per_kg", base_amount: -1, per_kg_amount: 2 })).toThrow(/base_amount/);
    expect(() => normaliseTariff({ kind: "weight_table" })).toThrow(/kind/);
  });
});
