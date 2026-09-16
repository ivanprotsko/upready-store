import { MARKETPLACES } from "../registry";
import * as fromWb from "../../wb/normalize";
import * as fromOzon from "../../ozon/normalize";

/**
 * The normalisers, over rows shaped like the real mirrors
 * (w12-marketplace-core, spec 2.3).
 *
 * What is being defended here is mostly ABSENCE. A marketplace that said
 * nothing about a stock must produce `null` and not `0`, because a zero is a
 * claim about an empty warehouse and it sorts, displays and alerts like one
 * (rule 20a). The same goes for `scheme` on a WB statistics order and for a
 * category name Ozon never sent.
 */

const wbProductRow = {
  id: "wbprod_1",
  tenant_id: "ten_1",
  nm_id: "71853946",
  imt_id: "3001",
  vendor_code: "Сбитень",
  title: "Сбитень медовый",
  brand: "Фабрика натуральных продуктов",
  subject_id: "1234",
  subject_name: "Напитки",
  photos: [{ big: "https://basket.wb.ru/1.jpg" }],
  dimensions: { length: 10 },
  sizes: [{ chrtID: "555", techSize: "0", skus: ["2000000000019"] }],
  fetched_at: new Date("2026-09-16T00:00:00Z"),
  wb_updated_at: new Date("2026-09-15T10:00:00Z"),
  raw: {},
};

describe("Wildberries -> mp_*", () => {
  it("maps a card onto the normalized product", () => {
    const [draft] = fromWb.products([wbProductRow]);

    expect(draft).toMatchObject({
      tenant_id: "ten_1",
      marketplace: "wb",
      external_id: "71853946",
      vendor_code: "Сбитень",
      title: "Сбитень медовый",
      category_name: "Напитки",
      source_row_id: "wbprod_1",
    });
    expect(draft.mp_updated_at).toEqual(new Date("2026-09-15T10:00:00Z"));
  });

  it("merges a price and a stock of the same size into one offer line", () => {
    const [offer] = fromWb.offers([
      {
        source: "price",
        row: {
          id: "wbprice_1",
          tenant_id: "ten_1",
          nm_id: "71853946",
          vendor_code: "Сбитень",
          currency_iso: "RUB",
          sizes: [{ sizeID: "555", price: 500, discountedPrice: 450 }],
          fetched_at: new Date("2026-09-16T00:00:00Z"),
        },
      },
      {
        source: "stock",
        row: {
          id: "wbstock_1",
          tenant_id: "ten_1",
          nm_id: "71853946",
          chrt_id: "555",
          sku: "2000000000019",
          warehouse_id: "77",
          warehouse_name: "Коледино",
          amount: 12,
          fetched_at: new Date("2026-09-16T00:00:00Z"),
        },
      },
    ]);

    expect(offer).toMatchObject({
      marketplace: "wb",
      offer_key: "71853946|555|77",
      external_id: "71853946",
      size_external: "555",
      warehouse_id: "77",
      warehouse_name: "Коледино",
      price: 500,
      discount_price: 450,
      currency: "RUB",
      stock: 12,
      vendor_code: "Сбитень",
    });
  });

  it("gives a priced size with no stock line a null stock, never a zero", () => {
    const offers = fromWb.offers([
      {
        source: "price",
        row: {
          id: "wbprice_1",
          tenant_id: "ten_1",
          nm_id: "71853946",
          vendor_code: "Сбитень",
          currency_iso: "RUB",
          sizes: [{ sizeID: "555", price: 500, discountedPrice: 450 }],
          fetched_at: new Date("2026-09-16T00:00:00Z"),
        },
      },
    ]);

    expect(offers).toHaveLength(1);
    expect(offers[0].stock).toBeNull();
    expect(offers[0].warehouse_id).toBeNull();
    expect(offers[0].offer_key).toBe("71853946|555|");
  });

  it("keeps two warehouses of one size apart", () => {
    const rows = ["77", "88"].map((warehouse, index) => ({
      source: "stock" as const,
      row: {
        id: `wbstock_${index}`,
        tenant_id: "ten_1",
        nm_id: "71853946",
        chrt_id: "555",
        warehouse_id: warehouse,
        amount: index,
        fetched_at: new Date("2026-09-16T00:00:00Z"),
      },
    }));

    const keys = fromWb.offers(rows).map((offer) => offer.offer_key);
    expect(new Set(keys).size).toBe(2);
  });

  it("does not invent a delivery scheme for a statistics order", () => {
    const [order] = fromWb.orders([
      {
        id: "wborder_1",
        tenant_id: "ten_1",
        srid: "srid-1",
        nm_id: "71853946",
        supplier_article: "Сбитень",
        finished_price: 450,
        discount_percent: 10,
        is_cancel: false,
        warehouse_name: "Коледино",
        region_name: "Москва",
        order_date: new Date("2026-09-10T08:00:00Z"),
        last_change_date: new Date("2026-09-11T08:00:00Z"),
        fetched_at: new Date("2026-09-16T00:00:00Z"),
        raw: {},
      },
    ]);

    expect(order.scheme).toBeNull();
    expect(order.is_cancelled).toBe(false);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({ vendor_code: "Сбитень", qty: 1, price: 450 });
  });

  it("maps a question and takes «answered» from WB's own flag", () => {
    const [answered, open] = fromWb.questions([
      {
        id: "wbq_1",
        tenant_id: "ten_1",
        question_id: "q1",
        nm_id: "71853946",
        supplier_article: "Сбитень",
        text: "Какой срок годности?",
        answer_text: "",
        is_answered: true,
        created_date: new Date("2026-09-12T08:00:00Z"),
        fetched_at: new Date("2026-09-16T00:00:00Z"),
      },
      {
        id: "wbq_2",
        tenant_id: "ten_1",
        question_id: "q2",
        text: "Есть ли доставка?",
        is_answered: false,
        fetched_at: new Date("2026-09-16T00:00:00Z"),
      },
    ]);

    expect(answered).toMatchObject({
      marketplace: "wb",
      external_id: "q1",
      vendor_code: "Сбитень",
      question_text: "Какой срок годности?",
      is_answered: true,
    });
    // Answered with an empty string is still answered: the flag is WB's fact,
    // the text is not our inference from it.
    expect(open.is_answered).toBe(false);
    expect(open.vendor_code).toBeNull();
  });
});

describe("Ozon -> mp_*", () => {
  it("maps a product and refuses to invent a category name", () => {
    const [draft] = fromOzon.products([
      {
        id: "ozprod_1",
        tenant_id: "ten_1",
        product_id: "1111",
        offer_id: "Сбитень",
        sku: "222222",
        name: "Сбитень медовый",
        category_id: "17028922",
        images: ["https://cdn1.ozone.ru/1.jpg"],
        fetched_at: new Date("2026-09-16T00:00:00Z"),
        raw: {},
      },
    ]);

    expect(draft).toMatchObject({
      marketplace: "ozon",
      external_id: "1111",
      vendor_code: "Сбитень",
      sku_external: "222222",
      title: "Сбитень медовый",
      category_name: null,
    });
  });

  it("keeps the FBO and FBS lines of one product apart, as storage types", () => {
    const offers = fromOzon.offers([
      {
        source: "price",
        row: {
          id: "ozprice_1",
          tenant_id: "ten_1",
          product_id: "1111",
          offer_id: "Сбитень",
          price: 450,
          old_price: 500,
          currency_code: "RUB",
          fetched_at: new Date("2026-09-16T00:00:00Z"),
        },
      },
      ...["fbo", "fbs"].map((type, index) => ({
        source: "stock" as const,
        row: {
          id: `ozstock_${index}`,
          tenant_id: "ten_1",
          product_id: "1111",
          offer_id: "Сбитень",
          sku: "222222",
          stock_type: type,
          shipment_type: "general",
          present: 5 + index,
          reserved: 1,
          fetched_at: new Date("2026-09-16T00:00:00Z"),
        },
      })),
    ]);

    expect(offers).toHaveLength(2);
    expect(offers.map((offer) => offer.storage_type).sort()).toEqual([
      "fbo/general",
      "fbs/general",
    ]);
    expect(new Set(offers.map((offer) => offer.offer_key)).size).toBe(2);
    expect(offers[0]).toMatchObject({ price: 500, discount_price: 450, warehouse_id: null });
  });

  it("sums a posting's total from its lines and leaves an empty posting null", () => {
    const [withLines, empty] = fromOzon.orders([
      {
        id: "ozpost_1",
        tenant_id: "ten_1",
        posting_number: "0001-1",
        scheme: "FBS",
        status: "delivering",
        products: [
          { sku: "222222", offer_id: "Сбитень", quantity: 2, price: "450" },
          { sku: "333333", offer_id: "Хлеб", quantity: 1, price: "300" },
        ],
        financial_data: { currency_code: "RUB" },
        analytics_data: { region: "Москва", warehouse_name: "Хоругвино" },
        posting_created_at: new Date("2026-09-10T08:00:00Z"),
        fetched_at: new Date("2026-09-16T00:00:00Z"),
        raw: {},
      },
      {
        id: "ozpost_2",
        tenant_id: "ten_1",
        posting_number: "0002-1",
        scheme: "FBO",
        status: "cancelled",
        products: [],
        fetched_at: new Date("2026-09-16T00:00:00Z"),
        raw: {},
      },
    ]);

    expect(withLines.total).toBe(1200);
    expect(withLines.lines).toHaveLength(2);
    expect(withLines.buyer_region).toBe("Москва");
    expect(empty.total).toBeNull();
    expect(empty.is_cancelled).toBe(true);
  });

  it("reads «answered» off the comment count rather than guessing", () => {
    const [answered, open] = fromOzon.reviews([
      {
        id: "ozrev_1",
        tenant_id: "ten_1",
        review_id: "r1",
        rating: 5,
        text: "Отлично",
        comments_amount: 1,
        vendor_code: "Сбитень",
        published_at: new Date("2026-09-12T08:00:00Z"),
        fetched_at: new Date("2026-09-16T00:00:00Z"),
      },
      {
        id: "ozrev_2",
        tenant_id: "ten_1",
        review_id: "r2",
        rating: 3,
        comments_amount: 0,
        fetched_at: new Date("2026-09-16T00:00:00Z"),
      },
    ]);

    expect(answered.is_answered).toBe(true);
    expect(answered.vendor_code).toBe("Сбитень");
    expect(open.is_answered).toBe(false);
  });
});

describe("both adapters", () => {
  it("stamp every draft with the raw row it came from", () => {
    for (const adapter of MARKETPLACES) {
      const rows =
        adapter.id === "wb"
          ? [wbProductRow]
          : [
              {
                id: "ozprod_1",
                tenant_id: "ten_1",
                product_id: "1111",
                offer_id: "Сбитень",
                fetched_at: new Date("2026-09-16T00:00:00Z"),
                raw: {},
              },
            ];

      for (const draft of adapter.normalize.products(rows)) {
        expect(draft.source_row_id).toBeTruthy();
        expect(draft.synced_at).toBeInstanceOf(Date);
        expect(draft.marketplace).toBe(adapter.id);
      }
    }
  });
});
