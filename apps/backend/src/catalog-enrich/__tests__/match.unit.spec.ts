import { matchCatalog, nmIdFromMetadata, nmIdFromSku, type CatalogProduct, type MirrorCard } from "../match";

/**
 * The matcher of w07-tenant-catalog-enrich, against the shapes measured on the
 * Cherkashina catalog and the mirrored cabinet (2026-09-16).
 */

const product = (
  handle: string,
  skus: (string | null)[],
  metadata: Record<string, unknown> | null = null,
): CatalogProduct => ({
  id: `prod_${handle}`,
  title: handle,
  handle,
  variants: skus.map((sku, index) => ({ id: `var_${handle}_${index}`, sku })),
  metadata,
});

const card = (nmId: string, vendorCode: string | null, title = "карточка"): MirrorCard => ({
  nm_id: nmId,
  vendor_code: vendorCode,
  title,
});

describe("catalog-enrich/match — nmIdFromSku", () => {
  it("reads the item number the migrated SKU carries", () => {
    expect(nmIdFromSku("94372564-CHERKASHINO")).toBe("94372564");
    expect(nmIdFromSku("1650264976-CHERKASHINO")).toBe("1650264976");
  });

  it("refuses a short internal code, so «PL-28» is never item number 28", () => {
    expect(nmIdFromSku("PL-28-CHERKASHINO")).toBeNull();
    expect(nmIdFromSku("COURSE-BOX-OCHISHCHENIE-PECHENI-CHERKASHINO")).toBeNull();
    expect(nmIdFromSku("12345-CHERKASHINO")).toBeNull();
  });

  it("is anchored at the start: a number in the middle is not the item number", () => {
    expect(nmIdFromSku("SKU-94372564")).toBeNull();
  });

  it("gives null for an absent SKU rather than an empty string", () => {
    expect(nmIdFromSku(null)).toBeNull();
    expect(nmIdFromSku("")).toBeNull();
  });
});

describe("catalog-enrich/match — nmIdFromMetadata", () => {
  it("reads the number a migration or an earlier run wrote", () => {
    expect(nmIdFromMetadata({ wb_nm_id: "94372564" })).toBe("94372564");
    expect(nmIdFromMetadata({ nmID: 94372564 })).toBe("94372564");
  });

  it("ignores anything that is not an item number", () => {
    expect(nmIdFromMetadata({ wb_nm_id: "нет" })).toBeNull();
    expect(nmIdFromMetadata(null)).toBeNull();
  });
});

describe("catalog-enrich/match — matchCatalog", () => {
  it("ties a product to the card whose item number its SKU carries", () => {
    const report = matchCatalog(
      [product("mumie", ["94372564-CHERKASHINO"])],
      [card("94372564", "Мумие банка", "Мумие алтайское")],
    );

    expect(report.matched).toHaveLength(1);
    expect(report.matched[0]).toMatchObject({
      product_id: "prod_mumie",
      nm_id: "94372564",
      vendor_code: "Мумие банка",
      matched_by: "sku_nm_id",
      variant_sku: "94372564-CHERKASHINO",
    });
    expect(report.unmatched_products).toHaveLength(0);
  });

  it("ties a product whose SKU IS the seller's article, whatever its case", () => {
    const report = matchCatalog(
      [product("sbiten", ["  СБИТЕНЬ "])],
      [card("71853946", "Сбитень")],
    );

    expect(report.matched[0]).toMatchObject({ nm_id: "71853946", matched_by: "vendor_code" });
  });

  it("falls back to the item number in metadata when no SKU matches", () => {
    const report = matchCatalog(
      [product("kurs", ["COURSE-BOX-CHERKASHINO"], { wb_nm_id: "94372564" })],
      [card("94372564", "Мумие банка")],
    );

    expect(report.matched[0]).toMatchObject({ matched_by: "metadata_nm_id", variant_id: null });
  });

  it("matches NOTHING by title: a near-name never becomes a link", () => {
    const report = matchCatalog(
      [product("pasta-gvozdika", ["PL-21-CHERKASHINO"])],
      [card("142213628", "Зубная паста тайская", "Зубная паста тайская от кариеса")],
    );

    expect(report.matched).toHaveLength(0);
    expect(report.unmatched_products).toEqual([
      { id: "prod_pasta-gvozdika", handle: "pasta-gvozdika", title: "pasta-gvozdika", sku: "PL-21-CHERKASHINO" },
    ]);
    expect(report.unmatched_cards).toHaveLength(1);
  });

  it("reports both sides, so a half-empty cabinet is never read as a full one", () => {
    const report = matchCatalog(
      [product("a", ["94372564-X"]), product("b", ["PL-09-X"])],
      [card("94372564", "A"), card("999999", "C")],
    );

    expect(report.matched.map((one) => one.product_id)).toEqual(["prod_a"]);
    expect(report.unmatched_products.map((one) => one.handle)).toEqual(["b"]);
    expect(report.unmatched_cards.map((one) => one.nm_id)).toEqual(["999999"]);
  });

  it("takes the FIRST card of a duplicated article, so pagination order cannot change the answer", () => {
    const cards = [card("1", "дубль"), card("2", "дубль")];
    const forwards = matchCatalog([product("p", ["дубль"])], cards);
    const backwards = matchCatalog([product("p", ["дубль"])], [...cards]);

    expect(forwards.matched[0].nm_id).toBe("1");
    expect(backwards.matched[0].nm_id).toBe("1");
  });

  it("lets two products share one card: a listing sold as two products keeps both links", () => {
    const report = matchCatalog(
      [product("a", ["94372564-A"]), product("b", ["94372564-B"])],
      [card("94372564", "A")],
    );

    expect(report.matched).toHaveLength(2);
    expect(report.unmatched_cards).toHaveLength(0);
  });
});
