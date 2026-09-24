import { methodsToCopy } from "../steps/copy-shipping";

/**
 * t-2026-09-24-n12: which delivery methods «Создать сайт» copies, read off the
 * export bundle's `warehouse.stock_locations`.
 */
describe("methodsToCopy", () => {
  const tariffData = (amount: number, zone: unknown = null) => ({
    schema: "upready.shipping-method/v1",
    tariff: { kind: "per_kg", base_amount: amount, per_kg_amount: 120 },
    description: null,
    delivery_hint: null,
    sort_order: 0,
    default_weight_g: 700,
    own_zone: true,
    zone,
  });

  const location = (options: unknown[], type = "shipping") => ({
    fulfillment_sets: [{ type, service_zones: [{ shipping_options: options }] }],
  });

  it("copies tariffs, names and the enabled rule, oldest first, and never the source's own zone flag", () => {
    const copies = methodsToCopy([
      location([
        {
          id: "so_2",
          name: "DHL",
          provider_id: "tariff_tariff",
          shipping_profile_id: "sp_1",
          created_at: "2026-09-02",
          data: tariffData(3500),
          rules: [{ attribute: "enabled_in_store", value: "false" }],
        },
        {
          id: "so_1",
          name: "Почта России",
          provider_id: "tariff_tariff",
          shipping_profile_id: "sp_1",
          created_at: "2026-09-01",
          data: tariffData(350, { country_code: "ru", provinces: [] }),
          rules: [{ attribute: "enabled_in_store", value: "true" }],
        },
      ]),
    ]);

    expect(copies.map((c) => [c.name, c.enabled, c.data.own_zone])).toEqual([
      ["Почта России", true, false],
      ["DHL", false, false],
    ]);
    expect(copies[0].data.zone).toEqual({ country_code: "ru", provinces: [] });
    expect(copies[1].data.tariff).toEqual({ kind: "per_kg", base_amount: 3500, per_kg_amount: 120 });
  });

  it("reads an option from before tariffs as a flat method at its first price", () => {
    const [copy] = methodsToCopy([
      location([{ id: "so_1", name: "Самовывоз", provider_id: "manual_manual", prices: [{ currency_code: "rub", amount: 0 }] }]),
    ]);
    expect(copy.data.tariff).toEqual({ kind: "flat", amount: 0 });
    expect(copy.enabled).toBe(true);
  });

  it("skips return options and non-shipping sets", () => {
    expect(
      methodsToCopy([
        location([{ id: "so_r", name: "Возврат", rules: [{ attribute: "is_return", value: "true" }] }]),
        location([{ id: "so_p", name: "Pickup" }], "pickup"),
      ]),
    ).toEqual([]);
  });
});
