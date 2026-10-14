import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import PochtaFulfillmentService, { POCHTA_NO_POINTS } from "../service";
import { POCHTA_METHOD_SCHEMA, type PochtaStorePoint } from "../../../pochta/method";
import { directoryBuyerPoints, quoteToPoint } from "../../../pochta/quote";

/**
 * t-2026-10-14-58. On the live shop on 14.10 the Russian Post card for
 * с. Константиново (391103) said 487 ₽, the price to the village's own postcode.
 * The village has no pickup point; the sheet's points were in Рязань at 426 ₽.
 * The card now costs what the first point of the sheet costs.
 */

jest.mock("../../../pochta/quote", () => ({
  ...jest.requireActual("../../../pochta/quote"),
  directoryBuyerPoints: jest.fn(),
  quoteToPoint: jest.fn(),
}));

jest.mock("../../../tenant-secrets/pochta", () => ({
  readPochtaSecret: jest.fn(async () => ({
    tenant_id: "ten_1",
    credentials: { sender_index: "101000", default_weight_g: 1000 },
  })),
  pochtaApiCredentials: jest.fn(() => ({ token: "t", key: "k", user_key: null })),
}));

const point = (index: string, city: string, region: string): PochtaStorePoint => ({
  index,
  kind: "pvz",
  name: `Почта Еком ${index}`,
  address: "ул. Кальная, 75",
  city,
  region,
  lat: 54.6,
  lng: 39.7,
  work_time: [],
  weight_limit_g: 31500,
  card_payment: false,
  cash_payment: false,
  directions: null,
});

const DIRECTORY = [
  point("986260", "Рязань", "обл. Рязанская"),
  point("986270", "Рязань", "обл. Рязанская"),
  point("980089", "Москва", "г. Москва"),
];

const quote = (amount: number) => ({
  amount,
  carrier_amount: amount,
  period_min: 3,
  period_max: 3,
  term_label: "3 дня",
  tariff_source: "public-retail-estimate",
  weight_g: 1000,
});

const optionData = { schema: POCHTA_METHOD_SCHEMA, tenant_id: "ten_1", kind: "pickup", default_weight_g: 1000 };

const build = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return new PochtaFulfillmentService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never);
};

const card = (city: string, postal_code: string) =>
  build().calculatePrice(optionData, {}, {
    shipping_address: { city, postal_code, province: "Рязанская обл" },
    items: [{ quantity: 1, unit_price: 1008.78 }],
  } as never);

describe("the Russian Post card before a point is chosen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (directoryBuyerPoints as jest.Mock).mockResolvedValue(DIRECTORY);
    (quoteToPoint as jest.Mock).mockImplementation(async ({ point: p }: { point: PochtaStorePoint }) =>
      quote(p.city === "Рязань" ? 426 : 361),
    );
  });

  it("costs what the first point of the sheet costs, not the trip to the buyer's postcode", async () => {
    await expect(card("Рязань", "390000")).resolves.toEqual({
      calculated_amount: 426,
      is_calculated_price_tax_inclusive: false,
    });
    expect(quoteToPoint).toHaveBeenCalledTimes(1);
    expect((quoteToPoint as jest.Mock).mock.calls[0][0].point.index).toBe("986260");
  });

  it("answers the no-points code where the city has no point", async () => {
    const error = await card("Константиново", "391103").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MedusaError);
    expect((error as MedusaError).message).toBe(POCHTA_NO_POINTS);
    expect(POCHTA_NO_POINTS.startsWith("pochta_no_points:")).toBe(true);
    expect(quoteToPoint).not.toHaveBeenCalled();
  });

  it("leaves the card without a price, not «no points», when the carrier fails", async () => {
    (quoteToPoint as jest.Mock).mockRejectedValue(new Error("tariff.pochta.ru answered 502"));
    const error = (await card("Рязань", "390000").catch((e: unknown) => e)) as MedusaError;
    expect(error.message).toBe("Почта России не рассчитала доставку по этому адресу");

    (directoryBuyerPoints as jest.Mock).mockRejectedValue(new Error("directory down"));
    const down = (await card("Рязань", "390000").catch((e: unknown) => e)) as MedusaError;
    expect(down.message).toBe("Почта России не рассчитала доставку по этому адресу");
  });
});
