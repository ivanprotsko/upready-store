import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import CdekFulfillmentService, { CDEK_NO_POINTS } from "../service";
import { listTariffs, type CdekTariff } from "../../../cdek/client";
import { CDEK_METHOD_SCHEMA } from "../../../cdek/method";
import type { ResolvedCdekSecret } from "../../../tenant-secrets/cdek";

/**
 * t-2026-10-14-58. On the live shop on 14.10, с. Константиново (391103) had CDEK's
 * courier at 955 ₽ and no CDEK point; the pickup card said «Недоступно: не удалось
 * рассчитать стоимость», as if the site were broken. CDEK answered the route, just
 * with no tariff that ends at a point.
 */

jest.mock("../../../cdek/client", () => ({
  ...jest.requireActual("../../../cdek/client"),
  listTariffs: jest.fn(),
}));

const VILLAGE = { city: "Константиново", postal_code: "391103", country_code: "ru" };

const tariff = (delivery_mode: number, delivery_sum: number): CdekTariff => ({
  tariff_code: 100 + delivery_mode,
  tariff_name: `mode ${delivery_mode}`,
  delivery_mode,
  delivery_sum,
  period_min: 2,
  period_max: 3,
});

const SECRET: ResolvedCdekSecret = {
  id: "sec_1",
  tenant_id: "ten_1",
  is_test: false,
  is_enabled: true,
  credentials: {
    account: "acc",
    password: "pwd",
    test_account: "",
    test_password: "",
    sender_mode: "warehouse",
    sender_city_code: 44,
    sender_city_name: "Москва",
    sender_address: null,
    sender_name: null,
    sender_phone: null,
    shipment_point: null,
  } as ResolvedCdekSecret["credentials"],
};

const optionData = (kind: "pickup" | "courier") => ({
  schema: CDEK_METHOD_SCHEMA,
  tenant_id: "ten_1",
  kind,
  tariff_code: null,
  sender_mode: "warehouse",
  default_weight_g: 500,
  markup_amount: 0,
  markup_percent: 0,
  free_above_total: null,
});

class TestService extends CdekFulfillmentService {
  protected async secret(): Promise<ResolvedCdekSecret | null> {
    return SECRET;
  }
}

const build = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never);
};

const calculate = (kind: "pickup" | "courier") =>
  build().calculatePrice(optionData(kind), {}, {
    shipping_address: VILLAGE,
    items: [{ quantity: 1, unit_price: 1008.78 }],
  } as never);

describe("CDEK pickup where the place has no CDEK point", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Warehouse → door only, the way CDEK answered for Константиново.
    (listTariffs as jest.Mock).mockResolvedValue([tariff(3, 955)]);
  });

  it("answers the no-points code the storefront reads, not «could not calculate»", async () => {
    const error = await calculate("pickup").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MedusaError);
    expect((error as MedusaError).type).toBe(MedusaError.Types.NOT_ALLOWED);
    expect((error as MedusaError).message).toBe(CDEK_NO_POINTS);
    expect(CDEK_NO_POINTS.startsWith("cdek_no_points:")).toBe(true);
  });

  it("still prices the courier on the same route", async () => {
    await expect(calculate("courier")).resolves.toEqual({
      calculated_amount: 955,
      is_calculated_price_tax_inclusive: false,
    });
  });

  it("prices the pickup as before once CDEK has a tariff to a point", async () => {
    (listTariffs as jest.Mock).mockResolvedValue([tariff(3, 955), tariff(4, 410)]);
    await expect(calculate("pickup")).resolves.toEqual({
      calculated_amount: 410,
      is_calculated_price_tax_inclusive: false,
    });
  });

  it("keeps a courier without a tariff on the old sentence, with no code", async () => {
    (listTariffs as jest.Mock).mockResolvedValue([tariff(4, 410)]);
    const error = (await calculate("courier").catch((e: unknown) => e)) as MedusaError;
    expect(error.message).toBe("СДЭК не возит по этому адресу выбранным способом");
  });

  it("lets a failed calculation go on as it was, not as «no points»", async () => {
    const down = new Error("socket hang up");
    (listTariffs as jest.Mock).mockRejectedValue(down);
    await expect(calculate("pickup")).rejects.toBe(down);
  });
});
