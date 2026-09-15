import { RU_REGIONS } from "../ru-regions";
import {
  RU_ZONE_PRESETS,
  presetByKey,
  presetForProvinces,
  provincesOfPreset,
  regionsOfPreset,
  zoneLabelFor,
} from "../ru-zone-presets";

describe("shipping zones: the ready-made Russian zones", () => {
  it("names nine zones, each with a key of its own", () => {
    expect(RU_ZONE_PRESETS).toHaveLength(9);
    expect(new Set(RU_ZONE_PRESETS.map((preset) => preset.key)).size).toBe(9);
    expect(RU_ZONE_PRESETS.map((preset) => preset.name)).toEqual([
      "Москва и область",
      "Санкт-Петербург и область",
      "Центр",
      "Северо-Запад",
      "Юг",
      "Поволжье",
      "Урал",
      "Сибирь",
      "Дальний Восток",
    ]);
  });

  it("every code resolves to a region", () => {
    for (const preset of RU_ZONE_PRESETS) {
      expect(() => regionsOfPreset(preset)).not.toThrow();
      expect(regionsOfPreset(preset)).toHaveLength(preset.region_codes.length);
    }
  });

  it("covers every federal subject exactly once", () => {
    const used = RU_ZONE_PRESETS.flatMap((preset) => preset.region_codes);
    expect(new Set(used).size).toBe(used.length);
    expect(used.length).toBe(RU_REGIONS.length);
    const missing = RU_REGIONS.filter((region) => !used.includes(region.code)).map((region) => region.name);
    expect(missing).toEqual([]);
  });

  it("builds a zone out of the province strings an address is matched by", () => {
    const ural = presetByKey("ural")!;
    expect(provincesOfPreset(ural)).toContain("Свердловская обл");
    expect(provincesOfPreset(ural)).toContain("Ямало-Ненецкий АО");
    expect(provincesOfPreset(ural)).toHaveLength(6);
  });

  it("recognises its own province list again, in any order", () => {
    const south = presetByKey("south")!;
    const shuffled = [...provincesOfPreset(south)].reverse();
    expect(presetForProvinces(shuffled)?.key).toBe("south");
    expect(presetForProvinces(["Свердловская обл", "Омская обл"])).toBeNull();
  });
});

describe("shipping zones: the name a buyer reads", () => {
  it("has a name for the whole store, a whole country and one region", () => {
    expect(zoneLabelFor(null)).toBe("Все страны магазина");
    expect(zoneLabelFor({ country_code: "ru", provinces: [] })).toBe("Россия, вся страна");
    expect(zoneLabelFor({ country_code: "ru", provinces: ["Свердловская обл"] })).toBe("Свердловская область");
  });

  it("names a zone by its preset when the regions are exactly that preset", () => {
    expect(zoneLabelFor({ country_code: "ru", provinces: provincesOfPreset(presetByKey("ural")!) })).toBe("Урал");
    expect(zoneLabelFor({ country_code: "ru", provinces: provincesOfPreset(presetByKey("msk")!) })).toBe(
      "Москва и область",
    );
  });

  it("counts the regions of a zone the owner built herself, in Russian", () => {
    expect(zoneLabelFor({ country_code: "ru", provinces: ["Омская обл", "Томская обл"] })).toBe("Россия, 2 региона");
    expect(
      zoneLabelFor({ country_code: "ru", provinces: ["Омская обл", "Томская обл", "Тверская обл", "Тульская обл", "Курская обл"] }),
    ).toBe("Россия, 5 регионов");
  });

  it("falls back to the country code for a country it has no name for", () => {
    expect(zoneLabelFor({ country_code: "pt", provinces: [] })).toBe("PT, вся страна");
  });
});
