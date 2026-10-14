import type { ResolvedCdekSecret } from "../../tenant-secrets/cdek";
import type { CdekCreateOrderInput } from "../client";
import type { ApishipOrderRequest } from "../../apiship/orders";

/**
 * t-2026-10-14-58: the price weighs a unit by its variant, then its product,
 * then the shop's default; the order sent to CDEK and to ApiShip used to take
 * the variant only. On 14.10 ten products of the live shop had a weight on the
 * product alone, so the checkout priced 250 g and the carrier was told 400 g.
 * Now the orders weigh a unit with the price's own function, and the provider
 * reads the product weight Medusa's order does not carry.
 */

const cdekSent: CdekCreateOrderInput[] = [];
const apishipSent: ApishipOrderRequest[] = [];

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return {
    ...actual,
    createOrder: jest.fn(async (_credentials: unknown, input: CdekCreateOrderInput) => {
      cdekSent.push(input);
      return { entity: { uuid: "order-uuid-1" }, requests: [{ state: "ACCEPTED", errors: [] }] };
    }),
  };
});

jest.mock("../../apiship/orders", () => {
  const actual = jest.requireActual("../../apiship/orders");
  return {
    ...actual,
    createOrder: jest.fn(async (_credentials: unknown, request: ApishipOrderRequest) => {
      apishipSent.push(request);
      return { orderId: 501, created: null };
    }),
    getOrderStatus: jest.fn(async () => null),
  };
});

// Imported after the mocks, so the services call the stubs.
/* eslint-disable @typescript-eslint/no-require-imports */
const CdekFulfillmentService = require("../../modules/cdek-fulfillment/service").default;
const ApishipFulfillmentService = require("../../modules/apiship-fulfillment/service").default;
const { cartWeightGrams } = require("../method");
const { packageItems } = require("../package-items");
const { apishipParcel } = require("../../apiship/order-request");
const { withProductWeights, productIdsWithoutVariantWeight } = require("../product-weights");
const { emptyApishipCredentials } = require("../../tenant-secrets/apiship");
/* eslint-enable @typescript-eslint/no-require-imports */

/** A knex stand-in for `pg("product").whereIn("id", ids).whereNull("deleted_at").select(...)`. */
const fakePg = (products: Record<string, number | null>) => {
  const calls: string[][] = [];
  const pg = (table: string) => {
    expect(table).toBe("product");
    return {
      whereIn: (_column: string, ids: string[]) => {
        calls.push(ids);
        return {
          whereNull: () => ({
            select: async () => ids.filter((id) => id in products).map((id) => ({ id, weight: products[id] })),
          }),
        };
      },
    };
  };
  return { pg, calls };
};

/** Castor oil: no weight on its variant, 250 g on the product, as on cherkashino.ru on 14.10. */
const ORDER = {
  id: "order_1",
  display_id: 1043,
  email: "buyer@example.com",
  shipping_address: {
    first_name: "Пётр",
    last_name: "Петров",
    phone: "8 (921) 123-45-67",
    address_1: "Невский пр-кт, 1",
    city: "Санкт-Петербург",
    province: "г Санкт-Петербург",
    postal_code: "191186",
    country_code: "ru",
  },
  items: [
    {
      id: "ordli_oil",
      product_id: "prod_oil",
      product_title: "Касторовое масло",
      variant_title: "Default variant",
      variant_sku: "OIL",
      unit_price: 390,
      variant: { sku: "OIL", weight: null, product: { id: "prod_oil" }, inventory_items: [] },
    },
  ],
};

const FULFILLED = [{ line_item_id: "ordli_oil", quantity: 1, title: "Default variant", sku: "OIL" }];

const CDEK_SECRET: ResolvedCdekSecret = {
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

const CDEK_METHOD = {
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

const APISHIP_METHOD = {
  provider: "apiship",
  tenant_id: "tenant_1",
  provider_key: "cdek",
  kind: "courier",
  apiship_connection_id: "1700",
  apiship_point_id: null,
  apiship_point_code: null,
  apiship_point_name: null,
  apiship_point_address: null,
  tariff_id: 56,
  tariff_name: "Посылка дверь-дверь",
  period_min: 2,
  period_max: 4,
  term_label: "2-4 дня",
  carrier_amount: 420,
  weight_g: 250,
  default_weight_g: 400,
};

const cdekService = (pg: unknown) => {
  const instance = new CdekFulfillmentService({ logger: { info: jest.fn(), warn: jest.fn() }, __pg_connection__: pg });
  instance.secret = async () => CDEK_SECRET;
  return instance;
};

const apishipService = (pg: unknown) => {
  const instance = new ApishipFulfillmentService({ logger: { info: jest.fn(), warn: jest.fn() }, __pg_connection__: pg });
  instance.credentials = async () => ({
    secret: {
      credentials: {
        ...emptyApishipCredentials(),
        token: "tok",
        sender_name: "Иванов Иван",
        sender_phone: "+7 (925) 000-11-15",
        sender_address: "г Москва, ул Машкова, д 21",
      },
    },
    credentials: { token: "tok" },
  });
  return instance;
};

beforeEach(() => {
  cdekSent.length = 0;
  apishipSent.length = 0;
});

describe("a variant without a weight is sent at its product's weight", () => {
  it("CDEK: the order weighs the castor oil 250 g, not the shop's 400 g", async () => {
    const { pg, calls } = fakePg({ prod_oil: 250 });
    await cdekService(pg).createFulfillment(CDEK_METHOD, FULFILLED, ORDER, { id: "ful_1" });

    expect(calls).toEqual([["prod_oil"]]);
    const [pack] = cdekSent[0].packages;
    expect(pack.items?.[0].weight).toBe(250);
    expect(pack.weight).toBe(250);
  });

  it("ApiShip: the order weighs it 250 g as well", async () => {
    const { pg } = fakePg({ prod_oil: 250 });
    const result = await apishipService(pg).createFulfillment(APISHIP_METHOD, FULFILLED, ORDER, { id: "ful_1" });

    expect(apishipSent[0].places[0].items[0].weight).toBe(250);
    expect(apishipSent[0].places[0].weight).toBe(250);
    expect(apishipSent[0].order.weight).toBe(250);
    expect(result.data.weight_g).toBe(250);
  });

  it("a product with no weight either keeps the shop's default", async () => {
    const { pg } = fakePg({ prod_oil: null });
    await cdekService(pg).createFulfillment(CDEK_METHOD, FULFILLED, ORDER, { id: "ful_1" });

    expect(cdekSent[0].packages[0].items?.[0].weight).toBe(400);
  });
});

describe("withProductWeights", () => {
  it("reads nothing when every variant has a weight", async () => {
    const { pg, calls } = fakePg({ prod_oil: 250 });
    const weighed = {
      items: [{ id: "ordli_x", product_id: "prod_oil", variant: { weight: 120, product: { id: "prod_oil" } } }],
    };
    expect(await withProductWeights(pg, weighed)).toBe(weighed);
    expect(calls).toEqual([]);
  });

  it("asks once for each product whose variant has none, by the variant's product or the line's", () => {
    expect(
      productIdsWithoutVariantWeight({
        items: [
          { product_id: "prod_a", variant: { weight: null, product: { id: "prod_a" } } },
          { product_id: "prod_a", variant: { weight: 0 } },
          { product_id: "prod_b", variant: null },
          { product_id: "prod_c", variant: { weight: 300 } },
        ],
      }),
    ).toEqual(["prod_a", "prod_b"]);
  });
});

describe("the price and both orders weigh a unit the same way", () => {
  const cases: Array<[string, { weight?: number | null; product_weight?: number | null }, number]> = [
    ["variant only", { weight: 650 }, 650],
    ["variant over product", { weight: 200, product_weight: 35 }, 200],
    ["product only", { weight: null, product_weight: 250 }, 250],
    ["variant zero, product set", { weight: 0, product_weight: 90 }, 90],
    ["neither", { weight: null, product_weight: null }, 400],
  ];

  it.each(cases)("%s", (_name, unit, grams) => {
    const quantity = 3;
    const price = cartWeightGrams([{ quantity, unit_price: 100, ...unit }], 400);
    const order = {
      items: [
        {
          id: "ordli_1",
          product_title: "Товар",
          unit_price: 100,
          variant: { weight: unit.weight, product: { weight: unit.product_weight } },
        },
      ],
    };
    const fulfilled = [{ line_item_id: "ordli_1", quantity }];
    const cdek = packageItems(fulfilled, order, 400);
    const apiship = apishipParcel(fulfilled, order, 400);

    expect(price).toBe(grams * quantity);
    expect(cdek.weight).toBe(price);
    expect(apiship.weight).toBe(price);
  });
});
