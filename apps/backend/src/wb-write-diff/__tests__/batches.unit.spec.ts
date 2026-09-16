import { WB_WRITE_ENDPOINTS } from "../../modules/wb-write/write-endpoints";
import {
  priceBatches,
  stockBatches,
  WB_PRICES_BATCH_MAX,
  WB_STOCKS_BATCH_MAX,
} from "../batches";
import type { PriceDiffRow, StockDiffRow } from "../types";

/**
 * The batch limits WB documents, and the rule that only `update` rows travel
 * (w21-wb-write-stocks-prices).
 */

const stockRow = (over: Partial<StockDiffRow> = {}): StockDiffRow => ({
  kind: "stocks",
  product_id: "prod_1",
  product_title: "Мумиё",
  variant_id: "var_1",
  variant_sku: "sku-1",
  nm_id: "94372564",
  barcode: "2037031652319",
  chrt_id: "1000",
  warehouse_id: "985793",
  warehouse_name: "Фабрика Натуральных Продуктов",
  store_value: 7,
  wb_value: 3,
  action: "update",
  reason: null,
  ...over,
});

const priceRow = (over: Partial<PriceDiffRow> = {}): PriceDiffRow => ({
  kind: "prices",
  product_id: "prod_1",
  product_title: "Мумиё",
  variant_id: "var_1",
  variant_sku: "sku-1",
  nm_id: "94372564",
  currency: "rub",
  store_value: 1100,
  wb_value: 990,
  wb_price: 1980,
  wb_discount: 50,
  proposed_price: 2200,
  action: "update",
  reason: null,
  ...over,
});

describe("stock batches", () => {
  it("builds the documented body and puts the warehouse in the path", () => {
    const [batch, ...rest] = stockBatches([stockRow()]);

    expect(rest).toEqual([]);
    expect(batch).toEqual({
      endpointId: "wb.stocks.update",
      params: { warehouseId: "985793" },
      body: { stocks: [{ sku: "2037031652319", amount: 7 }] },
      rows: 1,
    });
  });

  it("names an endpoint the write registry actually holds", () => {
    const ids = WB_WRITE_ENDPOINTS.map((entry) => entry.id);
    expect(ids).toContain(stockBatches([stockRow()])[0].endpointId);
    expect(ids).toContain(priceBatches([priceRow()])[0].endpointId);
  });

  it("never mixes two warehouses into one request", () => {
    const batches = stockBatches([
      stockRow({ warehouse_id: "1" }),
      stockRow({ warehouse_id: "2", variant_id: "var_2" }),
    ]);

    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.params.warehouseId).sort()).toEqual(["1", "2"]);
  });

  it("carries only rows whose action is update", () => {
    const batches = stockBatches([
      stockRow({ action: "equal" }),
      stockRow({ action: "skipped", reason: "card_has_several_barcodes", barcode: null }),
    ]);

    expect(batches).toEqual([]);
  });

  it("splits at the documented 1000 items per request", () => {
    expect(WB_STOCKS_BATCH_MAX).toBe(1000);

    const rows = Array.from({ length: 2_001 }, (_unused, index) =>
      stockRow({ variant_id: `var_${index}`, barcode: `bar_${index}` }),
    );
    const batches = stockBatches(rows);

    expect(batches.map((batch) => batch.rows)).toEqual([1000, 1000, 1]);
    for (const batch of batches) {
      expect((batch.body.stocks as unknown[]).length).toBeLessThanOrEqual(WB_STOCKS_BATCH_MAX);
      expect((batch.body.stocks as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("price batches", () => {
  it("builds the documented body and keeps WB's own discount", () => {
    const [batch] = priceBatches([priceRow()]);

    expect(batch).toEqual({
      endpointId: "wb.prices.upload-task",
      params: {},
      body: { data: [{ nmID: 94372564, price: 2200, discount: 50 }] },
      rows: 1,
    });
  });

  it("leaves out a row whose price it could not propose", () => {
    expect(
      priceBatches([
        priceRow({ action: "skipped", reason: "wb_price_absent", proposed_price: null }),
        priceRow({ action: "update", proposed_price: null }),
      ]),
    ).toEqual([]);
  });

  it("splits at the documented 1000 items per request", () => {
    expect(WB_PRICES_BATCH_MAX).toBe(1000);

    const rows = Array.from({ length: 1_001 }, (_unused, index) =>
      priceRow({ nm_id: String(90_000_000 + index) }),
    );

    expect(priceBatches(rows).map((batch) => batch.rows)).toEqual([1000, 1]);
  });
});
