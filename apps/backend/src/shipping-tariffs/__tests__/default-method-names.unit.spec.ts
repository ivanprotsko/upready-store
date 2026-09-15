import {
  defaultCourierAmount,
  defaultMethodNames,
  homeCountryForLocale,
  isMachineMadeDefaultName,
  LEGACY_COURIER_AMOUNT,
} from "../default-method-names";

/**
 * The two provisioned delivery methods are the first thing a buyer reads at
 * checkout, and the first cut of the workflow sent her «Оксана Черкашина
 * courier · 10,00 ₽» (measured on cherkashino.shipshift.dev 2026-09-15). These
 * assert what that name and that price may never be again.
 */
describe("default delivery method copy", () => {
  it("names the ru defaults in Russian, without the shop name or an English code word", () => {
    const names = defaultMethodNames("ru");
    for (const method of [names.pickup, names.courier]) {
      expect(method.name).toMatch(/^[А-ЯЁ][а-яё]/);
      expect(method.name).not.toMatch(/pickup|courier/i);
      expect(method.description.length).toBeGreaterThan(0);
    }
    expect(names.pickup.name).toBe("Самовывоз");
    expect(names.courier.name).toBe("Курьером");
  });

  it("falls back to English for a locale with no copy of its own", () => {
    expect(defaultMethodNames("pt-BR")).toEqual(defaultMethodNames("en"));
    expect(defaultMethodNames(null)).toEqual(defaultMethodNames("en"));
    expect(defaultMethodNames("ru-RU")).toEqual(defaultMethodNames("ru"));
  });

  it("prices the courier default per currency, so 300 ₽ is not also 300 $", () => {
    expect(defaultCourierAmount("rub")).toBe(300);
    expect(defaultCourierAmount("RUB")).toBe(300);
    expect(defaultCourierAmount("usd")).toBe(LEGACY_COURIER_AMOUNT);
    expect(defaultCourierAmount(null)).toBe(LEGACY_COURIER_AMOUNT);
  });

  it("reads the shop's home country from its locale", () => {
    expect(homeCountryForLocale("ru")).toBe("ru");
    expect(homeCountryForLocale("en-US")).toBe("us");
    expect(homeCountryForLocale("xx")).toBe("us");
  });

  it("recognises only the machine-made names, so a renamed option is left alone", () => {
    expect(isMachineMadeDefaultName("Оксана Черкашина pickup", "Оксана Черкашина")).toBe("pickup");
    expect(isMachineMadeDefaultName("Оксана Черкашина courier", "Оксана Черкашина")).toBe("courier");
    expect(isMachineMadeDefaultName("Самовывоз", "Оксана Черкашина")).toBeNull();
    expect(isMachineMadeDefaultName("Оксана Черкашина pickup", "Золотая нить")).toBeNull();
  });
});
