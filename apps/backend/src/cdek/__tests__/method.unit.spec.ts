import {
  cartSubtotal,
  cartWeightGrams,
  CDEK_DELIVERY_MODES,
  CDEK_METHOD_SCHEMA,
  deliveryModeFor,
  isCdekMethodData,
  isPointKind,
  selectTariff,
  termLabel,
} from "../method";
import type { CdekTariff } from "../client";

/**
 * Tariff rows copied verbatim from the live answer of
 * `POST https://api.cdek.ru/v2/calculator/tarifflist` (Moscow 44 → Saint
 * Petersburg 137, one 1 kg package, 2026-09-16). The full response is saved in
 * `artifacts/docs/i02-apiship-cdek-shipping/probes/cdek-prod-tarifflist.json`.
 */
const LIVE_TARIFFS: CdekTariff[] = [
  {
    tariff_code: 136,
    tariff_name: "Посылка склад-склад",
    delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE,
    delivery_sum: 250,
    period_min: 1,
    period_max: 2,
  },
  {
    tariff_code: 368,
    tariff_name: "Посылка склад-постамат",
    delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_POSTAMAT,
    delivery_sum: 250,
    period_min: 1,
    period_max: 2,
  },
  {
    tariff_code: 137,
    tariff_name: "Посылка склад-дверь",
    delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR,
    delivery_sum: 600,
    period_min: 1,
    period_max: 2,
  },
  {
    tariff_code: 483,
    tariff_name: "Экспресс склад-дверь",
    delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR,
    delivery_sum: 540,
    period_min: 2,
    period_max: 3,
  },
  {
    tariff_code: 59,
    tariff_name: "Супер-экспресс до 12 дверь-дверь",
    delivery_mode: CDEK_DELIVERY_MODES.DOOR_DOOR,
    delivery_sum: 2380,
    period_min: 1,
    period_max: 1,
  },
];

describe("cdek/method", () => {
  describe("deliveryModeFor", () => {
    it("pairs the sender mode with the delivery kind", () => {
      expect(deliveryModeFor("warehouse", "pickup")).toBe(CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE);
      expect(deliveryModeFor("warehouse", "courier")).toBe(CDEK_DELIVERY_MODES.WAREHOUSE_DOOR);
      expect(deliveryModeFor("warehouse", "postamat")).toBe(CDEK_DELIVERY_MODES.WAREHOUSE_POSTAMAT);
      expect(deliveryModeFor("door", "courier")).toBe(CDEK_DELIVERY_MODES.DOOR_DOOR);
      expect(deliveryModeFor("door", "pickup")).toBe(CDEK_DELIVERY_MODES.DOOR_WAREHOUSE);
      expect(deliveryModeFor("door", "postamat")).toBe(CDEK_DELIVERY_MODES.DOOR_POSTAMAT);
    });

    it("knows which kinds need a point", () => {
      expect(isPointKind("courier")).toBe(false);
      expect(isPointKind("pickup")).toBe(true);
      expect(isPointKind("postamat")).toBe(true);
    });
  });

  describe("selectTariff", () => {
    it("takes the cheapest tariff of the requested mode", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR,
      });
      expect(selected?.tariff.tariff_code).toBe(483);
      expect(selected?.amount).toBe(540);
      expect(selected?.period_max).toBe(3);
    });

    it("honours a pinned tariff code when the carrier still offers it", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR,
        tariff_code: 137,
      });
      expect(selected?.tariff.tariff_code).toBe(137);
      expect(selected?.amount).toBe(600);
    });

    it("falls back to the cheapest when the pinned code is missing from the answer", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR,
        tariff_code: 999,
      });
      expect(selected?.tariff.tariff_code).toBe(483);
    });

    it("returns null when no tariff serves the mode, so the option disappears instead of costing zero", () => {
      expect(selectTariff(LIVE_TARIFFS, { delivery_mode: CDEK_DELIVERY_MODES.DOOR_WAREHOUSE })).toBeNull();
      expect(selectTariff([], { delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_DOOR })).toBeNull();
    });

    it("applies the shop's markup, flat and percent, and rounds to kopecks", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE,
        markup_amount: 50,
        markup_percent: 10,
      });
      expect(selected?.carrier_amount).toBe(250);
      expect(selected?.amount).toBe(325); // 250 * 1.1 + 50
    });

    it("gives the delivery away above the shop's threshold but keeps the carrier price visible", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE,
        free_above_total: 5000,
        subtotal: 5000,
      });
      expect(selected?.free).toBe(true);
      expect(selected?.amount).toBe(0);
      expect(selected?.carrier_amount).toBe(250);
    });

    it("does not give it away one kopeck below the threshold", () => {
      const selected = selectTariff(LIVE_TARIFFS, {
        delivery_mode: CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE,
        free_above_total: 5000,
        subtotal: 4999.99,
      });
      expect(selected?.free).toBe(false);
      expect(selected?.amount).toBe(250);
    });
  });

  describe("cartWeightGrams", () => {
    it("sums the variant weights times their quantity", () => {
      expect(
        cartWeightGrams([{ quantity: 2, unit_price: 100, weight: 300 }], 500),
      ).toBe(600);
    });

    it("falls back to the product weight, then to the shop default", () => {
      expect(cartWeightGrams([{ quantity: 1, unit_price: 100, product_weight: 700 }], 500)).toBe(700);
      expect(cartWeightGrams([{ quantity: 3, unit_price: 100 }], 500)).toBe(1500);
    });

    it("never returns zero, because a zero-weight parcel quotes a price nobody can ship for", () => {
      expect(cartWeightGrams([], 500)).toBe(1);
      expect(cartWeightGrams([{ quantity: 1, unit_price: 100, weight: 0 }], 400)).toBe(400);
    });
  });

  it("cartSubtotal multiplies price by quantity", () => {
    expect(
      cartSubtotal([
        { quantity: 2, unit_price: 1500 },
        { quantity: 1, unit_price: 2000 },
      ]),
    ).toBe(5000);
  });

  describe("termLabel", () => {
    it("declines the Russian word for a day", () => {
      expect(termLabel(1, 1)).toBe("1 день");
      expect(termLabel(1, 2)).toBe("1-2 дня");
      expect(termLabel(3, 5)).toBe("3-5 дней");
      expect(termLabel(11, 11)).toBe("11 дней");
      expect(termLabel(21, 21)).toBe("21 день");
      expect(termLabel(0, 0)).toBe("");
    });
  });

  describe("isCdekMethodData", () => {
    it("accepts the schema it wrote and rejects a tenant tariff method", () => {
      expect(isCdekMethodData({ schema: CDEK_METHOD_SCHEMA, tenant_id: "ten_1" })).toBe(true);
      expect(isCdekMethodData({ schema: "upready.shipping-method/v1", tariff: {} })).toBe(false);
      expect(isCdekMethodData(null)).toBe(false);
      expect(isCdekMethodData({ schema: CDEK_METHOD_SCHEMA })).toBe(false);
    });
  });
});
