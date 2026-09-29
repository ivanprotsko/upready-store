import {
  duplicatesOfPochtaMethod,
  freePochtaMethodName,
  nameKey,
  planPochtaOptionNames,
  POCHTA_METHOD_NAMES,
} from "../method-name";

/**
 * The Russian Post option never shares its visible name with another option of
 * the shop, and the panel finds the manual twin a buyer would see next to it
 * (t-2026-09-30-01).
 */

const MANUAL = "Почта России — до отделения";

describe("nameKey", () => {
  it("ignores case, spacing and the kind of dash", () => {
    expect(nameKey("  почта  России - до   отделения ")).toBe(nameKey(MANUAL));
    expect(nameKey("Почта России – до отделения")).toBe(nameKey(MANUAL));
    expect(nameKey("Почта России—до отделения")).toBe(nameKey(MANUAL));
    expect(nameKey("СДЭК — до пункта")).not.toBe(nameKey(MANUAL));
  });
});

describe("the name provisioning gives the Russian Post option", () => {
  it("is the usual one when nothing else carries it", () => {
    expect(freePochtaMethodName(["Курьер", "Самовывоз"])).toBe(POCHTA_METHOD_NAMES[0]);
  });

  it("is never the name of a manual option the shop already has", () => {
    const name = freePochtaMethodName(["Курьер", "почта россии - до отделения"]);
    expect(nameKey(name)).not.toBe(nameKey(MANUAL));
    expect(name).toBe(POCHTA_METHOD_NAMES[1]);
  });

  it("stays unique when every usual name is taken", () => {
    const taken = [...POCHTA_METHOD_NAMES, `${POCHTA_METHOD_NAMES[0]} (2)`];
    const name = freePochtaMethodName(taken);
    expect(taken.map(nameKey)).not.toContain(nameKey(name));
  });

  it("renames an existing Russian Post option that shares its name, and leaves a unique one alone", () => {
    const clashing = planPochtaOptionNames([{ id: "so_pochta", name: MANUAL }], [MANUAL, "Курьер"]);
    expect(clashing.renames).toEqual({ so_pochta: POCHTA_METHOD_NAMES[1] });
    expect(nameKey(clashing.create_name)).not.toBe(nameKey(MANUAL));

    const unique = planPochtaOptionNames([{ id: "so_pochta", name: MANUAL }], ["Курьер"]);
    expect(unique.renames).toEqual({});
  });
});

describe("the manual twin the panel warns about", () => {
  const others = [
    { id: "so_manual", name: MANUAL, enabled: true },
    { id: "so_manual_off", name: MANUAL, enabled: false },
    { id: "so_pickup", name: "Почта России — пункт выдачи", enabled: true },
    { id: "so_courier", name: "Курьер", enabled: true },
  ];

  it("is every shown option named like the Russian Post one or like any name it may carry", () => {
    expect(duplicatesOfPochtaMethod(MANUAL, others).map((option) => option.id)).toEqual(["so_manual", "so_pickup"]);
  });

  it("is still found after provisioning moved the Russian Post option to a free name", () => {
    expect(duplicatesOfPochtaMethod(POCHTA_METHOD_NAMES[1], others).map((option) => option.id)).toEqual([
      "so_manual",
      "so_pickup",
    ]);
  });

  it("is none when the shop has no such option", () => {
    expect(duplicatesOfPochtaMethod(MANUAL, [{ id: "so_courier", name: "Курьер", enabled: true }])).toEqual([]);
  });
});
