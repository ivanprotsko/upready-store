import { parseWeightValue, unitFromName, weightFromMetadata, weightFromTitle } from "../weight-from-metadata";

describe("product weight: reading one value", () => {
  it("reads a number with its unit", () => {
    expect(parseWeightValue("70 г")).toEqual({ grams: 70, had_unit: true });
    expect(parseWeightValue("1,2 кг")).toEqual({ grams: 1200, had_unit: true });
    expect(parseWeightValue("0.5 kg")).toEqual({ grams: 500, had_unit: true });
  });

  it("marks a bare number as having no unit of its own", () => {
    expect(parseWeightValue("30")).toEqual({ grams: 30, had_unit: false });
    expect(parseWeightValue(250)).toEqual({ grams: 250, had_unit: false });
  });

  it("refuses a unit that is not a weight, and anything unreadable", () => {
    expect(parseWeightValue("120 капсул")).toBeNull();
    expect(parseWeightValue("11 мл")).toBeNull();
    expect(parseWeightValue("")).toBeNull();
    expect(parseWeightValue(null)).toBeNull();
    expect(parseWeightValue(0)).toBeNull();
  });

  it("takes the unit a characteristic name declares", () => {
    expect(unitFromName("Вес товара, г")).toBe(1);
    expect(unitFromName("Вес (с упаковкой)")).toBeNull();
    expect(unitFromName("Вес, кг")).toBe(1000);
  });
});

describe("product weight: reading a card", () => {
  // The two shapes measured on the cherkashino catalog, 2026-09-15.
  it("reads «Вес товара, г»: «30» from short_characteristics", () => {
    const reading = weightFromMetadata({
      short_characteristics: [
        { key: "Type", name: "Тип", values: ["Травяной сбор"] },
        { key: "Weight", name: "Вес товара, г", values: ["30"] },
      ],
    });
    expect(reading.weight_g).toBe(30);
    expect(reading.source).toBe("characteristics");
  });

  it("reads «Вес (с упаковкой)»: «70 г» from full_characteristics", () => {
    const reading = weightFromMetadata({
      full_characteristics: [
        { name: "Срок годности", values: ["60 месяцев"] },
        { name: "Вес (с упаковкой)", values: ["70 г"] },
      ],
    });
    expect(reading.weight_g).toBe(70);
    expect(reading.evidence).toBe("Вес (с упаковкой): 70 г");
  });

  it("prefers the packed weight over the net one — that is what the parcel weighs", () => {
    const reading = weightFromMetadata({
      full_characteristics: [
        { name: "Вес товара без упаковки", value: "120 г" },
        { name: "Вес (с упаковкой)", value: "155 г" },
      ],
    });
    expect(reading.weight_g).toBe(155);
  });

  it("skips a bare number whose name names no unit — 30 kg and 30 g are both plausible", () => {
    const reading = weightFromMetadata({ full_characteristics: [{ name: "Вес", value: "30" }] });
    expect(reading.weight_g).toBeNull();
    expect(reading.source).toBe("none");
  });

  it("reads a plain metadata key when there are no characteristics", () => {
    expect(weightFromMetadata({ weight_g: 450 }).weight_g).toBe(450);
    expect(weightFromMetadata({ вес: "1,5 кг" })).toMatchObject({ weight_g: 1500, source: "metadata-key" });
  });

  it("does not guess from the title unless asked", () => {
    const metadata = { source: "catalog-pricelist-2026-08-31" };
    expect(weightFromMetadata(metadata, { title: "Сеннол 125 гр" }).weight_g).toBeNull();
    expect(weightFromMetadata(metadata, { title: "Сеннол 125 гр", fromTitle: true })).toMatchObject({
      weight_g: 125,
      source: "title",
    });
  });

  it("does not read a count in the title as a weight", () => {
    expect(weightFromTitle("Тройчатка плюс от глистов и паразитов 120 капсул").weight_g).toBeNull();
    expect(weightFromTitle("Свечи АСД с чесноком, 10 шт").weight_g).toBeNull();
    expect(weightFromTitle("Мумиё Бальзам Горного Алтая 100 грамм").weight_g).toBe(100);
  });

  it("answers «nothing found» for metadata that is not an object", () => {
    expect(weightFromMetadata(null).weight_g).toBeNull();
    expect(weightFromMetadata("500 г").weight_g).toBeNull();
  });
});
