import { buildExportRow, type ExportedProduct } from "../product-translations";

/**
 * t-cherk-37: the pure half of the export/import CLI, checked without a
 * database. The integration half (resolving a tenant's own products, writing
 * through `upsertTranslationFields`) is exactly what `translations-helpers.unit.spec.ts`
 * already proves idempotent, and what the stand's manual check exercises
 * end to end.
 */

const product = {
  id: "prod_1",
  handle: "blue-scarf",
  title: "Синий шарф",
  subtitle: "100% шерсть",
  description: "Тёплый шарф ручной вязки.",
  options: [{ id: "opt_1", title: "Цвет" }],
  variants: [{ id: "variant_1", title: "Синий" }],
};

describe("buildExportRow", () => {
  it("falls back to null translated fields when the locale has nothing yet", () => {
    const row = buildExportRow(product, "en", new Map(), new Map(), new Map());

    expect(row).toEqual<ExportedProduct>({
      product_id: "prod_1",
      handle: "blue-scarf",
      title: "Синий шарф",
      subtitle: "100% шерсть",
      description: "Тёплый шарф ручной вязки.",
      translated_title: null,
      translated_subtitle: null,
      translated_description: null,
      options: [{ id: "opt_1", title: "Цвет", translated_title: null }],
      variants: [{ id: "variant_1", title: "Синий", translated_title: null }],
    });
  });

  it("carries the requested locale's translation, never another locale's", () => {
    const productTranslations = new Map([
      [
        "prod_1",
        new Map([
          ["en", { title: "Blue Scarf", description: "A warm hand-knit scarf." }],
          ["fr", { title: "Écharpe bleue" }],
        ]),
      ],
    ]);
    const optionTranslations = new Map([["opt_1", new Map([["en", { title: "Colour" }]])]]);
    const variantTranslations = new Map([["variant_1", new Map([["en", { title: "Blue" }]])]]);

    const row = buildExportRow(
      product,
      "en",
      productTranslations,
      optionTranslations,
      variantTranslations,
    );

    expect(row.translated_title).toBe("Blue Scarf");
    expect(row.translated_subtitle).toBeNull();
    expect(row.translated_description).toBe("A warm hand-knit scarf.");
    expect(row.options).toEqual([{ id: "opt_1", title: "Цвет", translated_title: "Colour" }]);
    expect(row.variants).toEqual([{ id: "variant_1", title: "Синий", translated_title: "Blue" }]);
  });
});
