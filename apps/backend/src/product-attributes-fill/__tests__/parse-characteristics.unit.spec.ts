import {
  collectProductValues,
  countryChoice,
  matchAttributeName,
  normaliseName,
  parseCharacteristics,
  parseQuantity,
  parseShelfLife,
  readCharacteristics,
} from "../parse-characteristics";
import { toSlug } from "../../product-csv/slugify";

/**
 * The parser of a migrated catalog's characteristics (b04-product-attributes).
 *
 * Every fixture below is a string that stands in the real catalog of the shop
 * this task backfills (measured on the stand database `upready_store_b04`,
 * 38 products of tenant `cherkashino`), not an invented one.
 */

describe("readCharacteristics", () => {
  it("reads the Ozon shape (a JSON string of name/value objects)", () => {
    const raw =
      '[{"name":"Артикул","value":"3501688032"},{"name":"Объем, мл","value":"60"},{"name":"Срок годности в днях","value":"750"}]';

    expect(readCharacteristics(raw)).toEqual([
      { name: "Артикул", value: "3501688032" },
      { name: "Объем, мл", value: "60" },
      { name: "Срок годности в днях", value: "750" },
    ]);
  });

  it("reads the Wildberries shape (name plus a list of values)", () => {
    const raw =
      '[{"name":"Объём","values":["100 мл"]},{"name":"Особенности продукта","values":["без ГМО","без искусственных добавок"]}]';

    expect(readCharacteristics(raw)).toEqual([
      { name: "Объём", value: "100 мл" },
      { name: "Особенности продукта", value: "без ГМО; без искусственных добавок" },
    ]);
  });

  it("reads «Ключ: значение» lines, splitting on the first colon only", () => {
    const raw = "Состав: масло какао; календула\nНазначение: при варикозе: отёках";

    expect(readCharacteristics(raw)).toEqual([
      { name: "Состав", value: "масло какао; календула" },
      { name: "Назначение", value: "при варикозе: отёках" },
    ]);
  });

  it("reads an already-parsed array and a plain object", () => {
    expect(readCharacteristics([{ name: "Состав", value: "АСД" }])).toEqual([
      { name: "Состав", value: "АСД" },
    ]);
    expect(readCharacteristics({ Состав: "АСД" })).toEqual([{ name: "Состав", value: "АСД" }]);
  });

  it("gives an empty list for nothing, for broken JSON and for an empty value", () => {
    expect(readCharacteristics(null)).toEqual([]);
    expect(readCharacteristics(undefined)).toEqual([]);
    expect(readCharacteristics("")).toEqual([]);
    expect(readCharacteristics('[{"name":"Состав"')).toEqual([]);
    expect(readCharacteristics('[{"name":"Состав","value":"   "}]')).toEqual([]);
    expect(readCharacteristics('[{"value":"без имени"}]')).toEqual([]);
  });
});

describe("normaliseName and matchAttributeName", () => {
  it("folds ё, case and whitespace", () => {
    expect(normaliseName("  Объём   товара ")).toBe("объем товара");
  });

  it("maps every spelling the migrated catalog uses onto one characteristic", () => {
    expect(matchAttributeName("Страна производства")?.key).toBe("country");
    expect(matchAttributeName("Страна-изготовитель")?.key).toBe("country");
    expect(matchAttributeName("Состав")?.key).toBe("composition");
    expect(matchAttributeName("Артикул")?.key).toBe("sku");
    expect(matchAttributeName("Показания к применению")?.key).toBe("purpose");
    expect(matchAttributeName("Действие")?.key).toBe("purpose");
  });

  it("takes the unit out of the name when the value carries none", () => {
    expect(matchAttributeName("Объем, мл")).toEqual({ key: "volume", rank: 0, unit: "ml" });
    expect(matchAttributeName("Вес товара, г")).toEqual({ key: "weight", rank: 3, unit: "g" });
    expect(matchAttributeName("Срок годности в днях")).toEqual({
      key: "shelf_life",
      rank: 0,
      unit: "days",
    });
  });

  it("matches a name whole, so a bowl's volume is not the product's", () => {
    expect(matchAttributeName("Объем чаши")).toBeNull();
    expect(matchAttributeName("Максимальная температура хранения")).toBeNull();
    expect(matchAttributeName("Количество в упаковке, шт")).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("converts to the target unit", () => {
    expect(parseQuantity("0.3 кг", "g")).toBe(300);
    expect(parseQuantity("2.7 кг", "g")).toBe(2700);
    expect(parseQuantity("0.027 кг", "g")).toBe(27);
    expect(parseQuantity("70 г", "g")).toBe(70);
    expect(parseQuantity("250 мл", "ml")).toBe(250);
    expect(parseQuantity("2 л", "ml")).toBe(2000);
  });

  it("accepts a Russian decimal comma", () => {
    expect(parseQuantity("0,15 кг", "g")).toBe(150);
  });

  it("takes a bare number only when the name says which unit it is", () => {
    expect(parseQuantity("60", "ml", "ml")).toBe(60);
    expect(parseQuantity("60", "ml", null)).toBeNull();
    expect(parseQuantity("35", "g", "g")).toBe(35);
  });

  it("refuses a unit of the other quantity rather than converting it", () => {
    expect(parseQuantity("0.3 кг", "ml")).toBeNull();
    expect(parseQuantity("100 мл", "g")).toBeNull();
  });

  it("refuses what is not a number at all", () => {
    expect(parseQuantity("Дойпак с замком зип-лок", "g")).toBeNull();
    expect(parseQuantity("", "g")).toBeNull();
    expect(parseQuantity("15 см", "g")).toBeNull();
  });
});

describe("parseShelfLife", () => {
  it("keeps what the owner wrote", () => {
    expect(parseShelfLife("60 месяцев")).toBe("60 месяцев");
    expect(parseShelfLife("5 лет")).toBe("5 лет");
    expect(parseShelfLife("24 месяца")).toBe("24 месяца");
  });

  it("gives a bare number the word its name implies", () => {
    expect(parseShelfLife("750", "days")).toBe("750 дней");
    expect(parseShelfLife("1825", "days")).toBe("1825 дней");
    expect(parseShelfLife("1", "days")).toBe("1 день");
    expect(parseShelfLife("22", "days")).toBe("22 дня");
    expect(parseShelfLife("14", "days")).toBe("14 дней");
  });

  it("gives null for an empty value", () => {
    expect(parseShelfLife("  ")).toBeNull();
  });
});

describe("parseCharacteristics", () => {
  it("fills the schema from one product's bag and reports the rest", () => {
    const raw =
      '[{"name":"Длина упаковки","values":["15 см"]},{"name":"Вес (с упаковкой)","values":["0.3 кг"]},' +
      '{"name":"Объём","values":["100 мл"]},{"name":"Страна производства","values":["Россия"]},' +
      '{"name":"Состав","values":["АСД"]}]';

    const result = parseCharacteristics(raw);

    expect(result.values).toEqual({
      weight: 300,
      volume: 100,
      country: "Россия",
      composition: "АСД",
    });
    expect(result.sources.weight).toBe("Вес (с упаковкой)");
    expect(result.unrecognised.map((entry) => entry.name)).toEqual(["Длина упаковки"]);
  });

  it("prefers the better-ranked name whatever order they arrive in", () => {
    const withPackaging = '[{"name":"Вес (с упаковкой)","value":"400 г"},{"name":"Вес (без упаковки)","value":"350 г"}]';
    const reversed = '[{"name":"Вес (без упаковки)","value":"350 г"},{"name":"Вес (с упаковкой)","value":"400 г"}]';

    expect(parseCharacteristics(withPackaging).values.weight).toBe(350);
    expect(parseCharacteristics(reversed).values.weight).toBe(350);
  });

  it("reports a matched name whose value is not of that quantity", () => {
    const result = parseCharacteristics('[{"name":"Объём","value":"0.3 кг"}]');

    expect(result.values.volume).toBeUndefined();
    expect(result.rejected).toEqual([
      { name: "Объём", value: "0.3 кг", key: "volume", reason: "не число этой величины" },
    ]);
  });

  it("gives an empty result for a product with no bag", () => {
    expect(parseCharacteristics(null)).toEqual({
      values: {},
      sources: {},
      unrecognised: [],
      rejected: [],
    });
  });
});

describe("collectProductValues", () => {
  it("falls back to the plain metadata keys and to the variant SKU", () => {
    const result = collectProductValues({
      metadata: {
        composition: "мумие алтайское очищенное 100%",
        application: "Вводят по 1 свече 1 - 2 раза в день",
      },
      sku: "3501688032-CHERKASHINO",
    });

    expect(result.values).toEqual({
      composition: "мумие алтайское очищенное 100%",
      purpose: "Вводят по 1 свече 1 - 2 раза в день",
      sku: "3501688032-CHERKASHINO",
    });
    expect(result.sources.composition).toBe("metadata.composition");
    expect(result.sources.sku).toBe("variant.sku");
  });

  it("lets the bag win over the fallbacks", () => {
    const result = collectProductValues({
      metadata: {
        full_characteristics: '[{"name":"Артикул","value":"3501688032"},{"name":"Состав","value":"АСД"}]',
        composition: "что-то другое",
      },
      sku: "3501688032-CHERKASHINO",
    });

    expect(result.values.sku).toBe("3501688032");
    expect(result.values.composition).toBe("АСД");
    expect(result.sources.sku).toBe("Артикул");
  });

  it("fills a gap from the short bag", () => {
    const result = collectProductValues({
      metadata: {
        full_characteristics: '[{"name":"Состав","value":"АСД"}]',
        short_characteristics: '[{"key":"Volume_ML","name":"Объем, мл","values":["60"]}]',
      },
      sku: null,
    });

    expect(result.values).toEqual({ composition: "АСД", volume: 60 });
  });

  it("gives an empty result for a product whose metadata says nothing", () => {
    expect(collectProductValues({ metadata: { source: "ozon" }, sku: null }).values).toEqual({});
    expect(collectProductValues({ metadata: null }).values).toEqual({});
  });
});

describe("countryChoice", () => {
  it("maps a known country onto a stable machine value and its English label", () => {
    expect(countryChoice("Россия", toSlug)).toEqual({ value: "russia", label: "Россия", en: "Russia" });
    expect(countryChoice("Таиланд", toSlug)).toEqual({ value: "thailand", label: "Таиланд", en: "Thailand" });
  });

  it("transliterates an unknown one rather than dropping it", () => {
    expect(countryChoice("Шри-Ланка", toSlug)).toEqual({ value: "shri_lanka", label: "Шри-Ланка" });
  });

  it("gives null for an empty label", () => {
    expect(countryChoice("   ", toSlug)).toBeNull();
  });
});
