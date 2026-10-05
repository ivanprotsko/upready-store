import { POST as updateMethod } from "../[id]/route";
import { POST as reorderMethods } from "../reorder/route";
import { POST as saveSettings } from "../settings/route";
import { toMethod, type TenantShippingMethod, type TenantWarehouse } from "../helpers";
import { TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";

const workflowRun = jest.fn(async () => ({ result: {} }));

jest.mock("@medusajs/medusa/core-flows", () => ({
  updateShippingOptionsWorkflow: jest.fn(() => ({ run: workflowRun })),
}));

jest.mock("../../../../workflows/tenant/shipping-methods/update-tenant-shipping-method", () => ({
  __esModule: true,
  default: jest.fn(() => ({ run: workflowRun })),
}));

// Imported by the `[id]` route next to the update; composing it needs the real core flows.
jest.mock("../../../../workflows/tenant/shipping-methods/delete-tenant-shipping-method", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../helpers", () => {
  const actual = jest.requireActual("../helpers");
  return {
    ...actual,
    getTenantWarehouse: jest.fn(),
    assertOwnedMethod: jest.fn(),
    listTenantMethods: jest.fn(),
    saveDefaultWeight: jest.fn(async () => undefined),
  };
});

/**
 * t-2026-10-04-19 (DHL on cherkashino.com/ru): a method's Russian description
 * lives in `data.i18n`, because Medusa's translations cover the option's `name`
 * and not its `data`. The panel has no field for it, and three routes rebuild
 * `data` from the fields they know. This pins that each of them carries
 * `i18n` over, so the owner's next save, reorder or weight change cannot
 * silently put the English text back on the Russian checkout.
 */

const I18N = {
  ru: {
    description: "Международная доставка DHL Express. Трек-номер придёт письмом после отправки заказа.",
    delivery_hint: "3–10 дней",
  },
};

const WAREHOUSE: TenantWarehouse = {
  tenant_id: "ten_1",
  stock_location_id: "sloc_1",
  fulfillment_set_id: "fuset_1",
  base_service_zone_id: "serzo_base",
  service_zone_ids: ["serzo_base"],
  currency_codes: ["usd"],
  default_weight_g: 500,
  currency_code: "usd",
};

const DATA: TenantMethodData = {
  schema: TENANT_METHOD_SCHEMA,
  tariff: { kind: "per_kg", base_amount: 3500, per_kg_amount: 900, min_weight_g: null },
  description: "International delivery by DHL Express. The tracking number will be e-mailed to you once the order ships.",
  delivery_hint: "3–10 days",
  sort_order: 5,
  default_weight_g: 500,
  own_zone: false,
  zone: null,
  carrier: "dhl",
  i18n: I18N,
};

const dhl = (data: TenantMethodData = DATA): TenantShippingMethod =>
  toMethod(
    {
      id: "so_dhl",
      name: "DHL Express — international delivery",
      price_type: "calculated",
      provider_id: "tariff_tariff",
      service_zone_id: "serzo_base",
      data,
      created_at: "2026-10-02T00:00:00.000Z",
      rules: [],
      prices: [],
    } as unknown as Parameters<typeof toMethod>[0],
    WAREHOUSE,
    0,
  );

const res = () => ({ json: jest.fn() }) as never;
const helpers = jest.requireMock("../helpers") as Record<string, jest.Mock>;
const writtenData = () => {
  const [[{ input }]] = workflowRun.mock.calls as unknown as [[{ input: unknown }]];
  return Array.isArray(input) ? input.map((update: { data: TenantMethodData }) => update.data) : [(input as { data: TenantMethodData }).data];
};

beforeEach(() => {
  workflowRun.mockClear();
  helpers.getTenantWarehouse.mockResolvedValue(WAREHOUSE);
  helpers.assertOwnedMethod.mockResolvedValue(dhl());
  helpers.listTenantMethods.mockResolvedValue([dhl()]);
});

describe("a method's texts in other languages survive every panel write", () => {
  it("reads them out of the option's data", () => {
    expect(dhl().i18n).toEqual(I18N);
    expect(dhl({ ...DATA, i18n: undefined }).i18n).toBeNull();
  });

  it("keeps them when the owner saves the method", async () => {
    await updateMethod({ params: { id: "so_dhl" }, validatedBody: { name: "DHL Express" } } as never, res());

    expect(writtenData()).toEqual([expect.objectContaining({ i18n: I18N, carrier: "dhl" })]);
  });

  it("keeps them when the owner reorders the methods", async () => {
    await reorderMethods({ validatedBody: { ids: ["so_dhl"] } } as never, res());

    expect(writtenData()).toEqual([expect.objectContaining({ i18n: I18N, sort_order: 0 })]);
  });

  it("keeps them when the owner changes the default weight", async () => {
    await saveSettings({ validatedBody: { default_weight_g: 700 } } as never, res());

    expect(writtenData()).toEqual([expect.objectContaining({ i18n: I18N, default_weight_g: 700 })]);
  });

  it("writes no i18n key for a method that has none", async () => {
    helpers.assertOwnedMethod.mockResolvedValue(dhl({ ...DATA, i18n: undefined }));

    await updateMethod({ params: { id: "so_dhl" }, validatedBody: { name: "DHL Express" } } as never, res());

    expect(writtenData()[0]).not.toHaveProperty("i18n");
  });
});
