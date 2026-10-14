import {
  deliveryTypeFor,
  isApishipMethodData,
  pickupTypeFor,
  requestedPointId,
  selectApishipTariff,
  tariffDays,
  APISHIP_METHOD_SCHEMA,
} from "../method";
import type { ApishipCalculatorGroup, ApishipCalculatorTariff } from "../client";

/**
 * The arithmetic of an ApiShip quote (t-2026-10-14-58): which tariff of the
 * calculator's answer becomes the card, and what the buyer pays for it.
 */
const tariff = (over: Partial<ApishipCalculatorTariff>): ApishipCalculatorTariff => ({
  tariffId: 1,
  tariffName: "Посылка",
  tariffProviderId: null,
  deliveryCost: 100,
  deliveryCostOriginal: null,
  feesIncluded: null,
  insuranceFee: null,
  cashServiceFee: null,
  daysMin: null,
  daysMax: null,
  calendarDaysMin: null,
  calendarDaysMax: null,
  workDaysMin: null,
  workDaysMax: null,
  pickupTypes: [1, 2],
  deliveryTypes: [1],
  pointIds: null,
  ...over,
});

const groups: ApishipCalculatorGroup[] = [
  {
    providerKey: "cdek",
    tariffs: [
      tariff({ tariffId: 56, tariffName: "Посылка дверь-дверь", deliveryCost: 420, calendarDaysMin: 2, calendarDaysMax: 4 }),
      tariff({ tariffId: 17, tariffName: "Супер-экспресс", deliveryCost: 990, calendarDaysMin: 1, calendarDaysMax: 1 }),
    ],
  },
  {
    providerKey: "rupost",
    tariffs: [tariff({ tariffId: 692, tariffName: "EMS", deliveryCost: 650, daysMin: 3, daysMax: 6 })],
  },
];

describe("apiship: tariff selection", () => {
  it("takes the cheapest tariff of the requested carrier and applies the markup", () => {
    const selected = selectApishipTariff(groups, {
      provider_key: "cdek",
      markup_amount: 50,
      markup_percent: 10,
    });
    expect(selected?.tariff.tariffId).toBe(56);
    expect(selected?.carrier_amount).toBe(420);
    // 420 × 1.1 + 50
    expect(selected?.amount).toBe(512);
    expect(selected?.period_min).toBe(2);
    expect(selected?.period_max).toBe(4);
    expect(selected?.free).toBe(false);
  });

  it("prefers the pinned tariff when the answer carries it, and the cheapest when it does not", () => {
    expect(selectApishipTariff(groups, { provider_key: "cdek", tariff_id: 17 })?.tariff.tariffId).toBe(17);
    expect(selectApishipTariff(groups, { provider_key: "cdek", tariff_id: 999 })?.tariff.tariffId).toBe(56);
  });

  it("answers null for a carrier that returned nothing, so the option drops out", () => {
    expect(selectApishipTariff(groups, { provider_key: "boxberry" })).toBeNull();
    expect(selectApishipTariff([{ providerKey: "cdek", tariffs: [] }], { provider_key: "cdek" })).toBeNull();
    expect(selectApishipTariff(null, { provider_key: "cdek" })).toBeNull();
  });

  it("makes the delivery free above the threshold and keeps the carrier price on record", () => {
    const selected = selectApishipTariff(groups, {
      provider_key: "rupost",
      free_above_total: 5000,
      subtotal: 6000,
    });
    expect(selected?.amount).toBe(0);
    expect(selected?.carrier_amount).toBe(650);
    expect(selected?.free).toBe(true);
  });

  it("reads calendar days first and the deprecated days as the fallback", () => {
    expect(tariffDays(tariff({ calendarDaysMin: 2, calendarDaysMax: 5, daysMin: 9, daysMax: 9 }))).toEqual({ min: 2, max: 5 });
    expect(tariffDays(tariff({ daysMin: 3, daysMax: 6 }))).toEqual({ min: 3, max: 6 });
    expect(tariffDays(tariff({}))).toEqual({ min: 0, max: 0 });
  });
});

describe("apiship: method data", () => {
  it("recognises its own option data and nothing else", () => {
    expect(
      isApishipMethodData({ schema: APISHIP_METHOD_SCHEMA, tenant_id: "ten_1", provider_key: "cdek", kind: "courier" }),
    ).toBe(true);
    expect(isApishipMethodData({ schema: "upready.cdek-method/v1", tenant_id: "ten_1" })).toBe(false);
    expect(isApishipMethodData({ schema: APISHIP_METHOD_SCHEMA, tenant_id: "ten_1" })).toBe(false);
    expect(isApishipMethodData(null)).toBe(false);
  });

  it("maps kinds and sender modes onto ApiShip's numeric types", () => {
    expect(deliveryTypeFor("courier")).toBe(1);
    expect(deliveryTypeFor("pickup")).toBe(2);
    expect(pickupTypeFor("courier")).toBe(1);
    expect(pickupTypeFor("point")).toBe(2);
  });

  it("reads the point the storefront asked for as a number or a numeric string, else null", () => {
    expect(requestedPointId({ apiship_point_id: 491 })).toBe(491);
    expect(requestedPointId({ apiship_point_id: " 2358 " })).toBe(2358);
    expect(requestedPointId({ apiship_point_id: "SPB3" })).toBeNull();
    expect(requestedPointId({ apiship_point_id: 0 })).toBeNull();
    expect(requestedPointId({})).toBeNull();
    expect(requestedPointId(undefined)).toBeNull();
  });
});
