import type { ResolvedCdekSecret } from "../../tenant-secrets/cdek";
import type { CdekCreateOrderInput } from "../client";

/**
 * t-2026-10-09-57: CDEK refuses an online-shop order whose package has no
 * `items` (`400 v2_field_is_empty: [packages[0].items] is empty`, measured on the
 * sandbox contour on 09.10.2026). The order the panel ships must carry every
 * line with its name, article, price, weight and count, and a parcel weight
 * equal to the sum of them.
 *
 * The fulfillment `items` and the `order` below have the shape Medusa 2.19's
 * `createOrderFulfillmentWorkflow` hands the provider: a fulfillment item knows
 * its line, its count, a VARIANT title and a SKU; the order line knows the rest.
 */

const sent: CdekCreateOrderInput[] = [];

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return {
    ...actual,
    createOrder: jest.fn(async (_credentials: unknown, input: CdekCreateOrderInput) => {
      sent.push(input);
      return { entity: { uuid: "order-uuid-1" }, requests: [{ state: "ACCEPTED", errors: [] }] };
    }),
  };
});

// Imported after the mock, so the service calls the stub.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CdekFulfillmentService = require("../../modules/cdek-fulfillment/service").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { packageItems, WARE_KEY_MAX, FALLBACK_UNIT_WEIGHT_G, amountOf } = require("../package-items");

const SECRET: ResolvedCdekSecret = {
  id: "tsec_1",
  tenant_id: "tenant_1",
  is_test: true,
  is_enabled: true,
  credentials: {
    account: "",
    password: "",
    test_account: "test-account",
    test_password: "test-password",
    sender_mode: "warehouse",
    sender_city_code: 44,
    sender_city_name: "Москва",
    sender_address: null,
    sender_name: "Магазин",
    sender_phone: "+70000000000",
    shipment_point: "MSK1",
    webhook_token: null,
    webhook_uuid: null,
  },
};

const METHOD = {
  provider: "cdek",
  tenant_id: "tenant_1",
  kind: "pickup",
  cdek_point_code: "SPB1",
  cdek_point_name: "Пункт",
  tariff_code: 136,
  tariff_name: "Посылка склад-склад",
  period_min: 1,
  period_max: 2,
  term_label: "1–2 дня",
  carrier_amount: 300,
  default_weight_g: 400,
};

/** Two lines: honey with a weight, tea without one. */
const ORDER = {
  id: "order_1",
  display_id: 1042,
  currency_code: "rub",
  email: "buyer@example.com",
  shipping_address: { city: "Санкт-Петербург", country_code: "ru" },
  items: [
    {
      id: "ordli_honey",
      title: "Мёд липовый",
      product_title: "Мёд липовый",
      variant_title: "500 г",
      variant_sku: "HONEY-500",
      variant_id: "variant_honey",
      unit_price: 450,
      quantity: 2,
      variant: { sku: "HONEY-500", weight: 650, inventory_items: [{ required_quantity: 1, inventory: { id: "iitem_honey" } }] },
    },
    {
      id: "ordli_tea",
      title: "Иван-чай",
      product_title: "Иван-чай",
      variant_title: "Default variant",
      variant_sku: null,
      variant_id: "variant_tea",
      // Medusa may hand an amount over as a BigNumber.
      unit_price: { value: "320", precision: 20, numeric: 320 },
      quantity: 1,
      variant: { sku: null, weight: null, inventory_items: [] },
    },
  ],
};

const FULFILLED = [
  { id: "fulit_1", line_item_id: "ordli_honey", inventory_item_id: "iitem_honey", quantity: 2, title: "500 г", sku: "HONEY-500" },
  { id: "fulit_2", line_item_id: "ordli_tea", inventory_item_id: null, quantity: 1, title: "Default variant", sku: "" },
];

const service = () => {
  const instance = new CdekFulfillmentService({ logger: { info: jest.fn(), warn: jest.fn() }, __pg_connection__: {} });
  instance.secret = async () => SECRET;
  return instance;
};

beforeEach(() => {
  sent.length = 0;
});

describe("createFulfillment sends the parcel's goods to CDEK", () => {
  it("puts both lines of a two-line order into packages[0].items, with and without a weight", async () => {
    const result = await service().createFulfillment(METHOD, FULFILLED, ORDER, { id: "ful_1" });

    expect(sent).toHaveLength(1);
    const [pack] = sent[0].packages;
    expect(pack.items).toEqual([
      { name: "Мёд липовый, 500 г", ware_key: "HONEY-500", payment: { value: 0 }, cost: 450, weight: 650, amount: 2 },
      { name: "Иван-чай", ware_key: "variant_tea", payment: { value: 0 }, cost: 320, weight: 400, amount: 1 },
    ]);
    // CDEK checks the parcel against its goods.
    expect(pack.weight).toBe(650 * 2 + 400 * 1);
    for (const item of pack.items ?? []) {
      for (const [field, value] of Object.entries(item)) {
        expect(value === "" || value === null || value === undefined).toBe(false);
        if (field === "weight" || field === "amount") expect(value).toBeGreaterThanOrEqual(1);
      }
    }
    expect(result.data).toMatchObject({ cdek_order_uuid: "order-uuid-1" });
  });

  it("weighs a unit without a weight at 1000 g when the order predates the shop's default", async () => {
    const { default_weight_g: _dropped, ...older } = METHOD;
    await service().createFulfillment(older, FULFILLED, ORDER, { id: "ful_1" });

    const [pack] = sent[0].packages;
    expect(pack.items?.[1].weight).toBe(FALLBACK_UNIT_WEIGHT_G);
    expect(pack.weight).toBe(650 * 2 + FALLBACK_UNIT_WEIGHT_G);
  });
});

describe("packageItems", () => {
  it("counts a kit line once, by its own quantity, not by its inventory items", () => {
    const order = {
      items: [
        {
          id: "ordli_kit",
          product_title: "Набор",
          variant_title: "Большой",
          variant_sku: "KIT-L",
          unit_price: 1500,
          variant: {
            weight: 900,
            inventory_items: [
              { required_quantity: 2, inventory: { id: "iitem_jar" } },
              { required_quantity: 1, inventory: { id: "iitem_box" } },
            ],
          },
        },
      ],
    };
    const fulfilled = [
      { line_item_id: "ordli_kit", inventory_item_id: "iitem_jar", quantity: 6, title: "Банка", sku: "JAR" },
      { line_item_id: "ordli_kit", inventory_item_id: "iitem_box", quantity: 3, title: "Коробка", sku: "BOX" },
    ];
    const { items, weight } = packageItems(fulfilled, order, 400);
    expect(items).toEqual([
      { name: "Набор, Большой", ware_key: "KIT-L", payment: { value: 0 }, cost: 1500, weight: 900, amount: 3 },
    ]);
    expect(weight).toBe(2700);
  });

  it("cuts a long article to CDEK's limit and never sends an empty name or key", () => {
    const { items } = packageItems(
      [{ line_item_id: "ordli_x", quantity: 1, sku: "" }],
      { items: [{ id: "ordli_x", title: "", variant_sku: "A".repeat(80), unit_price: "99.5" }] },
      null,
    );
    expect(items[0].ware_key).toHaveLength(WARE_KEY_MAX);
    expect(items[0].name).toBe("Товар");
    expect(items[0].cost).toBe(99.5);
    expect(items[0].weight).toBe(FALLBACK_UNIT_WEIGHT_G);
  });

  it("reads Medusa amounts in every shape they arrive in", () => {
    expect(amountOf(450)).toBe(450);
    expect(amountOf("320.5")).toBe(320.5);
    expect(amountOf({ numeric: 12 })).toBe(12);
    expect(amountOf({ value: "7" })).toBe(7);
    expect(amountOf(undefined)).toBe(0);
  });
});
