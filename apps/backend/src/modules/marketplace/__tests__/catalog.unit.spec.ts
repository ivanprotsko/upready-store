import {
  buildCatalogRows,
  catalogCounts,
  catalogSummary,
  DEFAULT_THRESHOLDS,
  type CatalogCard,
  type CatalogOffer,
  type ShopVariant,
  type StoredLink,
} from "../catalog";

/**
 * The catalog screen's arithmetic and its three linking outcomes
 * (w14-mp-catalog-link).
 *
 * The invariant under test is the one the screen promises: every distinct
 * article of the union lands in exactly ONE tab, so the four tab counts sum to
 * the total. A row that fell into two buckets, or into none, would show up
 * here as `accounted_for !== total` instead of as a number on a screen nobody
 * can reconcile.
 */

const card = (
  external_id: string,
  vendor_code: string | null,
  extra: Partial<CatalogCard> = {},
): CatalogCard => ({
  marketplace: "wb",
  external_id,
  vendor_code,
  title: `Карточка ${external_id}`,
  photos: 3,
  mp_updated_at: null,
  ...extra,
});

const offer = (external_id: string, extra: Partial<CatalogOffer> = {}): CatalogOffer => ({
  marketplace: "wb",
  external_id,
  price: 1000,
  discount_price: 800,
  currency: "RUB",
  stock: 5,
  ...extra,
});

const variant = (
  id: string,
  product_id: string,
  sku: string | null,
  extra: Partial<ShopVariant> = {},
): ShopVariant => ({
  id,
  product_id,
  product_title: `Товар ${product_id}`,
  sku,
  prices: { rub: 900 },
  stock: 7,
  photos: 2,
  ...extra,
});

const storedLink = (external_id: string, extra: Partial<StoredLink> = {}): StoredLink => ({
  id: `mplink_${external_id}`,
  marketplace: "wb",
  external_id,
  product_id: "prod_1",
  variant_id: "var_1",
  matched_by: "vendor_code",
  linked_at: null,
  ...extra,
});

describe("buildCatalogRows — the three outcomes of linking", () => {
  it("puts an article with a stored link into «связано»", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_1", "prod_1", "Сбитень")],
      links: [storedLink("100")],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("linked");
    expect(rows[0].reason).toBeNull();
    expect(rows[0].shop?.variant_id).toBe("var_1");
    expect(rows[0].cards[0].link?.matched_by).toBe("vendor_code");
  });

  it("puts a card whose article no variant carries into «не найдено в магазине»", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_2", "prod_2", "Дегельминтик")],
      links: [],
    });

    const row = rows.find((candidate) => candidate.vendor_code === "Сбитень");
    expect(row?.state).toBe("not_found_in_shop");
    expect(row?.shop).toBeNull();
    expect(row?.differences).toEqual([]);
  });

  it("puts an article carried by two variants into «требует выбора» and links nothing", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_1", "prod_1", "Сбитень"), variant("var_2", "prod_2", "сбитень")],
      links: [],
    });

    expect(rows[0].state).toBe("needs_choice");
    expect(rows[0].reason).toBe("ambiguous");
    expect(rows[0].candidates.map((candidate) => candidate.variant_id)).toEqual(["var_1", "var_2"]);
    /** Nothing was chosen, so there is no shop half and no difference to show. */
    expect(rows[0].shop).toBeNull();
  });

  it("separates «совпало, но не связано» from «требует выбора» by its reason", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_1", "prod_1", "Сбитень")],
      links: [],
    });

    expect(rows[0].state).toBe("needs_choice");
    expect(rows[0].reason).toBe("not_linked_yet");
    /** One candidate, so the differences are already computable. */
    expect(rows[0].shop?.variant_id).toBe("var_1");
  });

  it("puts a shop article no card carries into «нет на площадке»", () => {
    const rows = buildCatalogRows({
      cards: [],
      offers: [],
      variants: [variant("var_1", "prod_1", "HOODIE-M")],
      links: [],
    });

    expect(rows[0].state).toBe("missing_on_marketplace");
    expect(rows[0].cards).toEqual([]);
  });
});

describe("catalogCounts — the four tabs partition the articles", () => {
  it("sums to the number of distinct articles", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень"), card("200", "Дегельминтик"), card("300", "Крем")],
      offers: [offer("100"), offer("200"), offer("300")],
      variants: [
        variant("var_1", "prod_1", "Сбитень"),
        variant("var_2", "prod_2", "Дегельминтик"),
        variant("var_3", "prod_3", "дегельминтик"),
        variant("var_9", "prod_9", "HOODIE-M"),
      ],
      links: [storedLink("100")],
    });

    const counts = catalogCounts(rows);

    expect(counts).toMatchObject({
      linked: 1,
      needs_choice: 1,
      not_found_in_shop: 1,
      missing_on_marketplace: 1,
      total: 4,
      accounted_for: 4,
    });
    expect(counts.accounted_for).toBe(counts.total);
  });

  it("counts one article once even when it is on two marketplaces", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень"), card("ozon-1", "Сбитень", { marketplace: "ozon" })],
      offers: [offer("100"), offer("ozon-1", { marketplace: "ozon" })],
      variants: [variant("var_1", "prod_1", "Сбитень")],
      links: [storedLink("100")],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].cards.map((side) => side.marketplace)).toEqual(["wb", "ozon"]);
    expect(catalogCounts(rows)).toMatchObject({ linked: 1, total: 1, accounted_for: 1 });
  });
});

describe("differences", () => {
  const rows = () =>
    buildCatalogRows({
      cards: [card("100", "Сбитень", { photos: 10 })],
      offers: [
        offer("100", { price: 1214, discount_price: 607, stock: 4 }),
        offer("100", { price: 1300, discount_price: 650, stock: 6 }),
      ],
      variants: [variant("var_1", "prod_1", "Сбитень", { prices: { rub: 900 }, stock: 7, photos: 2 })],
      links: [storedLink("100")],
    });

  it("compares the price inside the marketplace's own currency and names the basis", () => {
    const price = rows()[0].differences.find((difference) => difference.metric === "price");

    expect(price).toMatchObject({
      shop: 900,
      marketplace: 607,
      unit: "RUB",
      abs: 293,
      highlighted: true,
    });
    expect(price?.pct).toBeCloseTo(48.27, 1);
    expect(price?.note).toContain("наименьшая цена со скидкой");
  });

  it("sums the stock of the card's lines and keeps the unit on the number", () => {
    const stock = rows()[0].differences.find((difference) => difference.metric === "stock");

    expect(stock).toMatchObject({ shop: 7, marketplace: 10, abs: -3, unit: "шт", highlighted: true });
  });

  it("counts photos on both sides", () => {
    const photos = rows()[0].differences.find((difference) => difference.metric === "photos");

    expect(photos).toMatchObject({ shop: 2, marketplace: 10, abs: -8, unit: "фото" });
  });

  it("says «цены нет» instead of comparing against a currency the shop has no price in", () => {
    const built = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_1", "prod_1", "Сбитень", { prices: { usd: 12 } })],
      links: [storedLink("100")],
    });

    const price = built[0].differences.find((difference) => difference.metric === "price");
    expect(price?.shop).toBeNull();
    expect(price?.abs).toBeNull();
    expect(price?.highlighted).toBe(false);
    expect(price?.note).toContain("цены в RUB нет");
  });

  it("leaves a stock nobody reported as null rather than zero", () => {
    const built = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100", { stock: null })],
      variants: [variant("var_1", "prod_1", "Сбитень", { stock: null })],
      links: [storedLink("100")],
    });

    const stock = built[0].differences.find((difference) => difference.metric === "stock");
    expect(stock?.marketplace).toBeNull();
    expect(stock?.shop).toBeNull();
    expect(stock?.abs).toBeNull();
    expect(stock?.note).toContain("площадка остаток не назвала");
  });

  it("highlights nothing below the thresholds it was given", () => {
    const built = buildCatalogRows({
      cards: [card("100", "Сбитень", { photos: 2 })],
      offers: [offer("100", { price: 1000, discount_price: 900, stock: 7 })],
      variants: [variant("var_1", "prod_1", "Сбитень", { prices: { rub: 900 }, stock: 7, photos: 2 })],
      links: [storedLink("100")],
      thresholds: DEFAULT_THRESHOLDS,
    });

    expect(built[0].differences.every((difference) => !difference.highlighted)).toBe(true);
  });
});

describe("происхождение содержимого (w07-tenant-catalog-enrich)", () => {
  it("несёт запись обогащения рядом с товаром магазина", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [
        variant("var_1", "prod_1", "Сбитень", {
          enriched: {
            marketplace: "wb",
            external_id: "71853946",
            matched_by: "vendor_code",
            linked_at: "2026-09-16T04:13:20.000Z",
          },
        }),
      ],
      links: [storedLink("100")],
    })

    expect(rows[0].shop?.enriched).toMatchObject({
      marketplace: "wb",
      external_id: "71853946",
      linked_at: "2026-09-16T04:13:20.000Z",
    })
  })

  it("оставляет null там, где обогащение не запускалось — а не выдуманную дату", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [offer("100")],
      variants: [variant("var_1", "prod_1", "Сбитень")],
      links: [storedLink("100")],
    })

    expect(rows[0].shop?.enriched).toBeNull()
  })
})

describe("catalogSummary — a zero is an error of setup, never «нет данных»", () => {
  const sources = {
    matcher: "/abs/path/link.ts",
    cards: "mp_product (tenant_id=ten_1)",
    variants: "product_variant через tenant_tenant_product_product (tenant_id=ten_1)",
    links: "mp_link (tenant_id=ten_1)",
  };

  it("names the count and the sources when cards exist and no link does", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень"), card("200", "Крем")],
      offers: [],
      variants: [],
      links: [],
    });

    const summary = catalogSummary(catalogCounts(rows), { total: 2 }, sources);

    expect(summary).toContain("Сопоставление не сработало: 0 из 2");
    expect(summary).toContain("/abs/path/link.ts");
    expect(summary).toContain("mp_product (tenant_id=ten_1)");
  });

  it("reports the real counts once something is linked", () => {
    const rows = buildCatalogRows({
      cards: [card("100", "Сбитень")],
      offers: [],
      variants: [variant("var_1", "prod_1", "Сбитень")],
      links: [storedLink("100")],
    });

    expect(catalogSummary(catalogCounts(rows), { total: 1 }, sources)).toContain(
      "Связано 1 из 1 артикулов",
    );
  });
});
