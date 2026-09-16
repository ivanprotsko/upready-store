import { linkSummary, matchByVendorCode } from "../link";

/**
 * The three outcomes of the article matcher (w12-marketplace-core, spec 2.4).
 *
 * The third one is why this file exists. Taking the first of several matches
 * silently is a value substituted for an absence (rule 20a): the card would
 * look linked, nobody would be asked, and the wrong product would carry the
 * marketplace's price from then on.
 */

const card = (external_id: string, vendor_code: string | null) => ({ external_id, vendor_code });
const variant = (id: string, product_id: string, sku: string | null) => ({ id, product_id, sku });

describe("matchByVendorCode", () => {
  it("links a card whose article matches exactly one variant", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_1", "prod_1", "Сбитень"), variant("var_2", "prod_2", "Дегельминтик")],
    );

    expect(report.linked).toEqual([
      { external_id: "100", outcome: "linked", product_id: "prod_1", variant_id: "var_1" },
    ]);
    expect(report.notFound).toEqual([]);
    expect(report.ambiguous).toEqual([]);
  });

  it("leaves a card with no matching variant in «не связано»", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_2", "prod_2", "Дегельминтик")],
    );

    expect(report.linked).toEqual([]);
    expect(report.notFound).toEqual([
      { external_id: "100", outcome: "not_found", vendor_code: "Сбитень" },
    ]);
  });

  it("does NOT link a card whose article matches several variants", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_1", "prod_1", "Сбитень"), variant("var_9", "prod_9", "сбитень")],
    );

    expect(report.linked).toEqual([]);
    expect(report.ambiguous).toEqual([
      {
        external_id: "100",
        outcome: "ambiguous",
        vendor_code: "Сбитень",
        variant_ids: ["var_1", "var_9"],
      },
    ]);
  });

  it("treats a card with no article at all as «не связано», never as a match", () => {
    const report = matchByVendorCode(
      [card("100", null), card("101", "   ")],
      [variant("var_1", "prod_1", "Сбитень")],
    );

    expect(report.linked).toEqual([]);
    expect(report.notFound).toHaveLength(2);
  });

  it("ignores a variant with no SKU rather than matching an empty article to it", () => {
    const report = matchByVendorCode(
      [card("100", "Сбитень")],
      [variant("var_1", "prod_1", null), variant("var_2", "prod_2", "")],
    );

    expect(report.notFound).toHaveLength(1);
    expect(report.ambiguous).toEqual([]);
  });

  it("compares case-insensitively and trims, and nothing else", () => {
    const report = matchByVendorCode(
      [card("100", " Сбитень "), card("101", "СБИТЕНЬ-2"), card("102", "Сбитень2")],
      [variant("var_1", "prod_1", "сбитень"), variant("var_2", "prod_2", "сбитень-2")],
    );

    expect(report.linked.map((entry) => entry.external_id)).toEqual(["100", "101"]);
    // A dash is part of an article, not noise: `Сбитень2` must not reach `сбитень-2`.
    expect(report.notFound.map((entry) => entry.external_id)).toEqual(["102"]);
  });

  it("accounts for every card exactly once", () => {
    const report = matchByVendorCode(
      [card("1", "a"), card("2", "b"), card("3", "c"), card("4", null)],
      [
        variant("v1", "p1", "a"),
        variant("v2", "p2", "b"),
        variant("v3", "p3", "B"),
        variant("v4", "p4", "z"),
      ],
    );

    expect(report.total).toBe(4);
    expect(report.accountedFor).toBe(4);
    expect(report.linked.length + report.notFound.length + report.ambiguous.length).toBe(4);
  });
});

describe("linkSummary", () => {
  it("calls zero links with a non-empty card list a failure, not an empty screen", () => {
    const report = matchByVendorCode([card("1", "a"), card("2", "b")], []);
    expect(linkSummary(report)).toBe(
      "Сопоставление не сработало: 0 из 2. Не найдено: 2, требует выбора: 0.",
    );
  });

  it("says the import has not run when there are no cards at all", () => {
    expect(linkSummary(matchByVendorCode([], []))).toBe("Карточек нет: импорт ещё не выполнялся.");
  });

  it("reports the three numbers when something did link", () => {
    const report = matchByVendorCode(
      [card("1", "a"), card("2", "b")],
      [variant("v1", "p1", "a")],
    );
    expect(linkSummary(report)).toBe("Связано 1 из 2. Не найдено: 1, требует выбора: 0.");
  });
});
