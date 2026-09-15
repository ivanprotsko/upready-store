import { matchReviewProduct } from "../cherkashina-rules";

/**
 * The corpus these rules were written against is 53 distinct product names
 * over 166 reviews. The cases below are the ones the OLD fuzzy matcher got
 * wrong or missed: every «правила нет» line of the measurement on 2026-09-15,
 * plus the mumijo shampoo, which the old matcher attached reviews to.
 */
describe("matchReviewProduct", () => {
  const handles = (name: string | null) => matchReviewProduct(name)?.handles;

  it("reads the four dosage forms of the ASD line apart", () => {
    expect(handles("Асд свечи фракция АСД-2, 2 банки - 20 шт")).toEqual([
      "svechi-asd-s-chesnokom-10-sht",
    ]);
    expect(handles("Мазь с АСД 3 15%, 100 мл")).toEqual(["maz-s-asd-3-15-100-ml"]);
    expect(handles("Антисептиком стумулятором Дорогова, таблетки, 120 штук")).toEqual([
      "antiseptikom-stumulyatorom-dorogova-tabletki-60-shtuk",
    ]);
    expect(handles("Антисептик стимулятор Д2, капсулы 60 шт")).toEqual([
      "kapsuly-s-asd-fraktsiya-2-dorogova-30-sht",
    ]);
    expect(handles("Антисептик стимулятор Д2, 2 флакона по 100 мл")).toEqual([
      "asd-2-fraktsiya-armavir-dorogova",
    ]);
  });

  it("keeps «Мазь 50 мл с АСД» an ointment and not a bottle of the fraction", () => {
    expect(handles("Мазь 50 мл с АСД")).toEqual(["maz-s-asd-3-15-100-ml"]);
  });

  it("reads the spellings the old matcher missed", () => {
    expect(handles("Свечи с АСД 3 упаковки 30 свечей ректально")).toEqual([
      "svechi-asd-s-chesnokom-10-sht",
    ]);
    expect(handles("Фитосвечи АСД с фракцией 2 от геморроя")).toEqual([
      "svechi-asd-s-chesnokom-10-sht",
    ]);
    expect(handles("Свечи с касторовым маслом и Антисептик Стимулятор Д2")).toEqual([
      "svechi-asd-s-chesnokom-10-sht",
    ]);
    expect(handles("Капсулы с АДФ фракция 2 Дорогова 60 шт")).toEqual([
      "kapsuly-s-asd-fraktsiya-2-dorogova-30-sht",
    ]);
    expect(handles("Натуральный сорбент от отравлений от температуры")).toEqual([
      "naturalnyy-sorbent-ot-otravleniy-ot-temperatury",
    ]);
  });

  it("separates the two mumijo products and never reaches the shampoo", () => {
    expect(handles("Мумие Бальзам Горного Алтая 100 грамм")).toEqual([
      "mumie-balzam-gornogo-altaya-100-gramm",
    ]);
    expect(handles("Мумие алтайское очищенное натуральное 100%")).toEqual([
      "mumie-altayskoe-ochischennoe-naturalnoe-100",
    ]);
    expect(handles("Мумие алтайское натуральное")).toEqual([
      "mumie-altayskoe-ochischennoe-naturalnoe-100",
    ]);
    const everyHandle = [
      "Мумие Бальзам Горного Алтая 100 грамм",
      "Мумие алтайское натуральное",
    ].flatMap((name) => handles(name) ?? []);
    expect(everyHandle).not.toContain("shampun-mumie");
  });

  it("calls honey honey, even when the honey has mumijo in it", () => {
    expect(handles("Мед натуральный с мумие для массажа, Алтайский мед с мумие")).toEqual([]);
    expect(handles("Мед ассорти 4 шт. 350 г")).toEqual([]);
  });

  it("answers «recognised, not sold here» with an empty list, not with null", () => {
    expect(matchReviewProduct("Фабрика Натуральных Продуктов Масло для волос, 1000 мл")).toEqual({
      handles: [],
      reason: "масло для волос поставщика — в этом магазине не продаётся",
    });
    expect(handles("Серебряный Дон, Санитайзер для рук Универсальный")).toEqual([]);
  });

  it("answers null for a name no rule has read, and for no name at all", () => {
    expect(matchReviewProduct("Капсулы 120 штук")).toBeNull();
    expect(matchReviewProduct(null)).toBeNull();
    expect(matchReviewProduct("")).toBeNull();
    expect(matchReviewProduct("   ")).toBeNull();
  });

  it("does not attach an ASD review to the varicose line that shares its dosage form", () => {
    expect(matchReviewProduct("Свечи от варикоза и отёков, с каштаном")).toBeNull();
    expect(matchReviewProduct("Капсулы от варикоза и отёков, с каштаном")).toBeNull();
  });
});
