import {
  aggregateOfferLines,
  attributesOf,
  buildProductRow,
  candidatesBySku,
  cardUrl,
  facetOf,
  filterProducts,
  offerLinesOf,
  parseProductsQuery,
  photoUrls,
  productLink,
  productsPage,
  sortProducts,
  type OfferAggregate,
  type OfferLine,
  type ProductCard,
  type ProductRow,
} from "../products-list";

/**
 * «Wildberries → Товары» (task-02 of mp-section-design): the decisions behind
 * the list, one by one, without a database. The HTTP suite
 * (`integration-tests/http/tenants-marketplace-products.spec.ts`) runs the same
 * rules through the route against rows it seeds itself.
 */

const card = (over: Partial<ProductCard> = {}): ProductCard => ({
  id: "mpprod_1",
  marketplace: "wb",
  external_id: "123965561",
  vendor_code: "ART-1",
  sku_external: null,
  title: "Мумиё алтайское",
  brand: "Фабрика",
  category_name: "БАДы",
  photos: null,
  mp_updated_at: null,
  synced_at: "2026-10-02T14:40:00.000Z",
  ...over,
});

const line = (over: Partial<OfferLine> = {}): OfferLine => ({
  size_external: "217846095",
  warehouse_id: "1",
  warehouse_name: "Коледино",
  price: 1000,
  discount_price: 800,
  currency: "RUB",
  stock: 5,
  reserved: null,
  measured_at: "2026-10-02T15:00:00.000Z",
  ...over,
});

const noLink = productLink(card(), undefined, new Map(), new Map());

const row = (over: Partial<ProductCard>, offers?: Partial<OfferAggregate>): ProductRow =>
  buildProductRow(
    card(over),
    offers
      ? {
          external_id: over.external_id ?? "123965561",
          min_price: null,
          min_discount_price: null,
          currency: "RUB",
          stock_sum: null,
          lines: 1,
          ...offers,
        }
      : undefined,
    noLink,
  );

describe("parseProductsQuery", () => {
  it("defaults to 20 per page from the start, newest import first", () => {
    const query = parseProductsQuery({});
    expect(query).toEqual({
      limit: 20,
      offset: 0,
      q: null,
      order: { field: "synced_at", desc: true },
      link_state: null,
      category: null,
      brand: null,
      synced_at: null,
    });
  });

  it("reads the lists the filter row writes, comma-separated or repeated", () => {
    const query = parseProductsQuery({
      link_state: "not_found,needs_choice",
      category: ["Чай", "Мультиварки,Чай"],
      brand: "",
      q: "  1239 ",
      order: "price",
      limit: "40",
      offset: "20",
    });
    expect(query.link_state).toEqual(["not_found", "needs_choice"]);
    expect(query.category).toEqual(["Чай", "Мультиварки"]);
    expect(query.brand).toBeNull();
    expect(query.q).toBe("1239");
    expect(query.order).toEqual({ field: "price", desc: false });
    expect(query.limit).toBe(40);
    expect(query.offset).toBe(20);
  });

  it("reads the date filter the panel writes as JSON", () => {
    const query = parseProductsQuery({
      synced_at: JSON.stringify({ $gte: "2026-10-01T00:00:00.000Z", $lte: "2026-10-02T23:59:59.999Z" }),
    });
    expect(query.synced_at).toEqual({ $gte: "2026-10-01T00:00:00.000Z", $lte: "2026-10-02T23:59:59.999Z" });
  });

  it("refuses an unknown sort field, link state, operator or a broken number instead of falling back", () => {
    expect(() => parseProductsQuery({ order: "-created_at" })).toThrow(/order/);
    expect(() => parseProductsQuery({ link_state: "linked,maybe" })).toThrow(/maybe/);
    expect(() => parseProductsQuery({ synced_at: '{"$eq":"2026-10-01"}' })).toThrow(/\$eq/);
    expect(() => parseProductsQuery({ synced_at: "yesterday" })).toThrow(/synced_at/);
    expect(() => parseProductsQuery({ limit: "-1" })).toThrow(/limit/);
    expect(() => parseProductsQuery({ offset: "1.5" })).toThrow(/offset/);
  });

  it("caps the page size", () => {
    expect(parseProductsQuery({ limit: "100000" }).limit).toBe(200);
  });
});

describe("the price and the stock of a card", () => {
  it("takes the lowest price and the lowest discounted price, and sums the stock", () => {
    const aggregate = aggregateOfferLines("1", [
      line({ price: 1200, discount_price: 960, stock: 3 }),
      line({ price: 1000, discount_price: 800, stock: 7 }),
      line({ price: 1100, discount_price: 880, stock: 0 }),
    ]);
    expect(aggregate).toMatchObject({ min_price: 1000, min_discount_price: 800, stock_sum: 10, lines: 3 });
  });

  it("keeps the stock null when no line reported one — the marketplace said nothing, not «0 шт»", () => {
    const aggregate = aggregateOfferLines("1", [line({ stock: null }), line({ stock: null, warehouse_id: null })]);
    expect(aggregate.stock_sum).toBeNull();
    expect(aggregate.lines).toBe(2);
  });

  it("sums only the lines that reported, and keeps a real zero a zero", () => {
    expect(aggregateOfferLines("1", [line({ stock: null }), line({ stock: 0 })]).stock_sum).toBe(0);
    expect(aggregateOfferLines("1", [line({ stock: null }), line({ stock: 4 })]).stock_sum).toBe(4);
  });

  it("carries the aggregate onto the row as is, and a card with no lines has no price and no stock", () => {
    const priced = row({}, { min_price: 1000, min_discount_price: 800, stock_sum: null, lines: 2 });
    expect(priced).toMatchObject({ price: 1000, discount_price: 800, stock: null, offers: 2 });

    const bare = row({});
    expect(bare).toMatchObject({ price: null, discount_price: null, stock: null, offers: 0, currency: null });
  });
});

describe("the link to the shop", () => {
  const variants = [
    { id: "v1", product_id: "p1", sku: "ART-1" },
    { id: "v2", product_id: "p2", sku: " art-2 " },
    { id: "v3", product_id: "p3", sku: "ART-2" },
    { id: "v4", product_id: "p4", sku: null },
  ];
  const candidates = candidatesBySku(variants);

  it("counts variants per article the way the matcher compares them (trimmed, case-insensitive)", () => {
    expect(candidates.get("art-1")).toBe(1);
    expect(candidates.get("art-2")).toBe(2);
    expect(candidates.size).toBe(2);
  });

  it("is linked when a live mp_link row exists, whoever wrote it", () => {
    const link = productLink(
      card({ vendor_code: "ART-2" }),
      { id: "mplink_1", external_id: "123965561", product_id: "p2", variant_id: "v2", matched_by: "manual" },
      candidates,
      new Map([["p2", "Мазь"]]),
    );
    expect(link).toEqual({
      id: "mplink_1",
      state: "linked",
      product_id: "p2",
      product_title: "Мазь",
      variant_id: "v2",
      matched_by: "manual",
      candidates: 2,
    });
  });

  it("needs a choice when several variants carry the article and nothing is linked", () => {
    const link = productLink(card({ vendor_code: "art-2" }), undefined, candidates, new Map());
    expect(link).toMatchObject({ id: null, state: "needs_choice", candidates: 2, product_id: null });
  });

  it("needs a choice, not «нет в магазине», when one variant carries it and the auto-link has not run", () => {
    const link = productLink(card({ vendor_code: "ART-1" }), undefined, candidates, new Map());
    expect(link).toMatchObject({ state: "needs_choice", candidates: 1 });
  });

  it("is not found when no variant carries the article, or the card has none", () => {
    expect(productLink(card({ vendor_code: "ART-9" }), undefined, candidates, new Map()).state).toBe("not_found");
    expect(productLink(card({ vendor_code: null }), undefined, candidates, new Map()).state).toBe("not_found");
  });
});

describe("search, filters, order, page", () => {
  const rows: ProductRow[] = [
    row({ id: "a", external_id: "100", vendor_code: "MUM-1", title: "Мумиё", brand: "Фабрика", category_name: "БАДы", synced_at: "2026-10-02T10:00:00.000Z" }, { min_price: 500, min_discount_price: 400, stock_sum: 10 }),
    row({ id: "b", external_id: "200", vendor_code: "TEA-1", title: "Иван-чай", brand: null, category_name: "Чай", synced_at: "2026-10-02T12:00:00.000Z" }, { min_price: 300, min_discount_price: null, stock_sum: null }),
    row({ id: "c", external_id: "300", vendor_code: "TEA-2", title: "Чай с мятой", brand: "Фабрика", category_name: "Чай", synced_at: "2026-10-02T12:00:00.000Z" }, { min_price: 900, min_discount_price: 450, stock_sum: 0 }),
    row({ id: "d", external_id: "400", vendor_code: "MLT-1", title: "Мультиварка", brand: "Фабрика", category_name: "Мультиварки", synced_at: "2026-10-01T08:00:00.000Z" }),
  ];
  rows[0].link = { ...rows[0].link, id: "mplink_a", state: "linked", product_id: "p", matched_by: "manual", candidates: 1 };
  rows[2].link = { ...rows[2].link, state: "needs_choice", candidates: 2 };

  const ids = (list: ProductRow[]) => list.map((r) => r.id);

  it("searches the title, the article and the marketplace id, case-insensitively", () => {
    expect(ids(filterProducts(rows, parseProductsQuery({ q: "чай" })))).toEqual(["b", "c"]);
    expect(ids(filterProducts(rows, parseProductsQuery({ q: "tea-2" })))).toEqual(["c"]);
    expect(ids(filterProducts(rows, parseProductsQuery({ q: "40" })))).toEqual(["d"]);
  });

  it("combines link state, category, brand and date with AND, and values inside one filter with OR", () => {
    expect(ids(filterProducts(rows, parseProductsQuery({ link_state: "not_found" })))).toEqual(["b", "d"]);
    expect(ids(filterProducts(rows, parseProductsQuery({ link_state: "not_found", q: "TEA" })))).toEqual(["b"]);
    expect(ids(filterProducts(rows, parseProductsQuery({ category: "Чай,Мультиварки", brand: "Фабрика" })))).toEqual(["c", "d"]);
    expect(
      ids(filterProducts(rows, parseProductsQuery({ synced_at: JSON.stringify({ $gte: "2026-10-02T00:00:00.000Z" }) }))),
    ).toEqual(["a", "b", "c"]);
  });

  it("sorts by the price the owner sees (the discounted one where there is one)", () => {
    expect(ids(sortProducts(rows, { field: "price", desc: false }))).toEqual(["b", "a", "c", "d"]);
    expect(ids(sortProducts(rows, { field: "price", desc: true }))).toEqual(["c", "a", "b", "d"]);
  });

  it("puts an unknown stock last in both directions, a reported zero is a number", () => {
    expect(ids(sortProducts(rows, { field: "stock", desc: false }))).toEqual(["c", "a", "b", "d"]);
    expect(ids(sortProducts(rows, { field: "stock", desc: true }))).toEqual(["a", "c", "b", "d"]);
  });

  it("breaks ties by the marketplace id, so the pages are the same every time", () => {
    expect(ids(sortProducts(rows, { field: "synced_at", desc: true }))).toEqual(["b", "c", "a", "d"]);
    expect(ids(sortProducts(rows, { field: "title", desc: false }))).toEqual(["b", "d", "a", "c"]);
  });

  it("pages after filtering and sorting, counts the matches, and builds the facets over every card", () => {
    const page = productsPage(rows, parseProductsQuery({ limit: "2", offset: "2", order: "-price" }));
    expect(ids(page.products)).toEqual(["b", "d"]);
    expect(page.count).toBe(4);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(2);

    const filtered = productsPage(rows, parseProductsQuery({ category: "Чай" }));
    expect(filtered.count).toBe(2);
    expect(filtered.categories).toEqual([
      { value: "Чай", label: "Чай", count: 2 },
      { value: "БАДы", label: "БАДы", count: 1 },
      { value: "Мультиварки", label: "Мультиварки", count: 1 },
    ]);
    expect(filtered.brands).toEqual([{ value: "Фабрика", label: "Фабрика", count: 3 }]);
  });

  it("facets count only the cards that carry a value", () => {
    expect(facetOf(rows, (r) => r.brand).reduce((sum, f) => sum + f.count, 0)).toBe(3);
  });
});

describe("the card page", () => {
  const wbPhotos = [
    { big: "https://x/big/1.webp", tm: "https://x/tm/1.webp", c516x688: "https://x/c516/1.webp" },
    { big: "https://x/big/2.webp" },
    "not-an-object-but-a-url",
    { video: "ignored" },
  ];

  it("picks the small size for the list and the large one for the page", () => {
    expect(photoUrls(wbPhotos, "thumb")).toEqual(["https://x/tm/1.webp", "https://x/big/2.webp", "not-an-object-but-a-url"]);
    expect(photoUrls(wbPhotos, "large")).toEqual(["https://x/c516/1.webp", "https://x/big/2.webp", "not-an-object-but-a-url"]);
    expect(photoUrls(null)).toEqual([]);
    const listed = buildProductRow(card({ photos: wbPhotos }), undefined, noLink);
    expect(listed.thumbnail).toBe("https://x/tm/1.webp");
    expect(listed.photos_count).toBe(3);
  });

  it("links a WB card to its page on wildberries.ru by nmID, and nothing else", () => {
    expect(cardUrl({ marketplace: "wb", external_id: "123965561" })).toBe(
      "https://www.wildberries.ru/catalog/123965561/detail.aspx",
    );
    expect(cardUrl({ marketplace: "ozon", external_id: "123" })).toBeNull();
    expect(cardUrl({ marketplace: "wb", external_id: "../x" })).toBeNull();
  });

  const attributes = {
    imt_id: "110429144",
    subject_id: "821",
    dimensions: { width: 12, height: 7, length: 12, isValid: true, weightBrutto: 0.4 },
    sizes: [
      { chrtID: 217846095, techSize: "0", wbSize: "", skus: ["1"] },
      { chrtID: 217846096, techSize: "42", wbSize: "42", skus: ["2"] },
    ],
  };

  it("names the sizes from the card's own size table, «0» being WB's one-size item", () => {
    const lines = offerLinesOf(
      [
        line({ size_external: "217846096", warehouse_name: "Казань", stock: 2 }),
        line({ size_external: "217846095", warehouse_name: null, warehouse_id: null, stock: null }),
        line({ size_external: "217846095", warehouse_name: "Коледино", stock: 3 }),
        line({ size_external: "999", warehouse_name: "Тула", stock: 1 }),
      ],
      attributes,
    );
    expect(lines.map((l) => [l.size, l.warehouse, l.stock])).toEqual([
      [null, "Коледино", 3],
      [null, null, null],
      ["42", "Казань", 2],
      ["999", "Тула", 1],
    ]);
  });

  it("lists the marketplace's characteristics by their own names, then the structural fields", () => {
    expect(
      attributesOf(attributes, [
        { id: 1, name: "Страна производства", value: ["Япония"] },
        { id: 2, name: "Объем товара", value: 12000 },
        { id: 3, name: "Комплектация", value: ["Ванночка", "Щётка"] },
        { id: 4, name: "Пусто", value: [] },
      ]),
    ).toEqual({
      "Страна производства": "Япония",
      "Объем товара": "12000",
      "Комплектация": "Ванночка, Щётка",
      imt_id: "110429144",
      subject_id: "821",
      sizes: "42",
      dimensions_length: "12",
      dimensions_width: "12",
      dimensions_height: "7",
      dimensions_weight: "0.4",
    });
    expect(attributesOf(null, null)).toEqual({});
  });
});
