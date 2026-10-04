import { MedusaError } from "@medusajs/framework/utils";

jest.mock("@medusajs/medusa/core-flows", () => ({
  completeCartWorkflow: { hooks: { validate: jest.fn() } },
}));

import {
  assertPostableShippingAddress,
  missingPostableFields,
  provinceRequiredFor,
} from "../validate-cart-shipping-address";

const FULL = {
  address_1: "ул. Ленина, д. 1, кв. 2",
  postal_code: "101000",
  city: "Москва",
  province: "г Москва",
  country_code: "ru",
};

const containerWith = (
  types: string[],
  metadata: (Record<string, unknown> | null)[] = [],
) =>
  ({
    resolve: () => ({
      graph: async () => ({
        data: types.map((type, index) => ({
          id: `so_0${index}`,
          metadata: metadata[index] ?? null,
          service_zone: { fulfillment_set: { type } },
        })),
      }),
    }),
  }) as never;

const COURIER = containerWith(["shipping"]);
const DIGITAL_DELIVERY = containerWith(["shipping"], [{ digital_delivery: "true" }]);

describe("missingPostableFields", () => {
  it("accepts a complete Russian address", () => {
    expect(missingPostableFields(FULL)).toEqual([]);
  });

  it("names every field the live order #5 was missing", () => {
    expect(
      missingPostableFields({
        address_1: "ул. Ленина, д. 1, кв. 2",
        postal_code: "",
        city: "",
        province: "",
        country_code: "ru",
      }),
    ).toEqual(["postal_code", "city", "province"]);
  });

  it("treats whitespace as empty", () => {
    expect(missingPostableFields({ ...FULL, city: "   " })).toEqual(["city"]);
  });

  it("reports everything for an absent address", () => {
    expect(missingPostableFields(null)).toEqual(["address_1", "postal_code", "city"]);
  });

  it("asks for a province only where a region list exists", () => {
    expect(provinceRequiredFor("ru")).toBe(true);
    expect(provinceRequiredFor("RU")).toBe(true);
    expect(provinceRequiredFor("de")).toBe(false);
    expect(provinceRequiredFor(undefined)).toBe(false);
    expect(missingPostableFields({ ...FULL, country_code: "de", province: "" })).toEqual([]);
  });
});

describe("assertPostableShippingAddress", () => {
  it("passes a courier cart with a full address", async () => {
    await expect(
      assertPostableShippingAddress(COURIER, {
        shipping_address: FULL,
        shipping_methods: [{ shipping_option_id: "so_00" }],
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses a courier cart with no city and no index", async () => {
    await expect(
      assertPostableShippingAddress(COURIER, {
        shipping_address: { ...FULL, city: "", postal_code: "" },
        shipping_methods: [{ shipping_option_id: "so_00" }],
      }),
    ).rejects.toThrow(MedusaError);

    await expect(
      assertPostableShippingAddress(COURIER, {
        shipping_address: { ...FULL, city: "", postal_code: "" },
        shipping_methods: [{ shipping_option_id: "so_00" }],
      }),
    ).rejects.toThrow(/postal_code, city/);
  });

  it("lets a pickup cart through with its address blanked on purpose", async () => {
    await expect(
      assertPostableShippingAddress(containerWith(["pickup"]), {
        shipping_address: {
          address_1: "",
          postal_code: "",
          city: "",
          province: "",
          country_code: "ru",
        },
        shipping_methods: [{ shipping_option_id: "so_00" }],
      }),
    ).resolves.toBeUndefined();
  });

  it("still guards a cart that mixes a pickup option with a courier one", async () => {
    await expect(
      assertPostableShippingAddress(containerWith(["pickup", "shipping"]), {
        shipping_address: { ...FULL, city: "" },
        shipping_methods: [
          { shipping_option_id: "so_00" },
          { shipping_option_id: "so_01" },
        ],
      }),
    ).rejects.toThrow(/city/);
  });

  it("lets a digital-delivery cart through with its address blanked on purpose (o24-courses)", async () => {
    await expect(
      assertPostableShippingAddress(DIGITAL_DELIVERY, {
        shipping_address: {
          address_1: "",
          postal_code: "",
          city: "",
          province: "",
          country_code: "ru",
        },
        shipping_methods: [{ shipping_option_id: "so_00" }],
      }),
    ).resolves.toBeUndefined();
  });

  it("still guards a cart that mixes a digital-delivery option with a courier one", async () => {
    await expect(
      assertPostableShippingAddress(
        containerWith(["shipping", "shipping"], [{ digital_delivery: "true" }]),
        {
          shipping_address: { ...FULL, city: "" },
          shipping_methods: [
            { shipping_option_id: "so_00" },
            { shipping_option_id: "so_01" },
          ],
        },
      ),
    ).rejects.toThrow(/city/);
  });

  it("skips a cart with nothing to ship", async () => {
    await expect(
      assertPostableShippingAddress(COURIER, {
        shipping_address: null,
        shipping_methods: [],
      }),
    ).resolves.toBeUndefined();
  });
});

/**
 * t-2026-10-04-23: a physical item picked with DHL and then removed left a
 * course-only cart carrying the DHL method, and the address check refused it
 * with 400 although nothing was left to post (stand cart
 * `cart_01M3YKC6VAKK5CEY2AM5E2CGKF`, 2026-10-04).
 */
describe("assertPostableShippingAddress: a stale method on a cart with nothing to ship", () => {
  const BLANK = { address_1: "", postal_code: "", city: "", province: "", country_code: "ru" };

  const store = (products: { id: string; metadata?: Record<string, unknown> | null }[]) => {
    const warn = jest.fn();
    const container = {
      resolve: (key: string) =>
        key === "logger"
          ? { warn }
          : {
              graph: async ({ entity }: { entity: string }) => ({
                data:
                  entity === "product"
                    ? products
                    : [{ id: "so_dhl", metadata: null, service_zone: { fulfillment_set: { type: "shipping" } } }],
              }),
            },
    } as never;
    return { container, warn };
  };

  const COURSE = { id: "prod_course", metadata: { digital: "true" } };
  const KETTLE = { id: "prod_kettle", metadata: null };
  const DHL = [{ shipping_option_id: "so_dhl" }];

  it("lets a course-only cart through and logs the cart id (digital only)", async () => {
    const { container, warn } = store([COURSE]);
    await expect(
      assertPostableShippingAddress(container, {
        id: "cart_01M3YKC6VAKK5CEY2AM5E2CGKF",
        items: [{ requires_shipping: true, product_id: "prod_course" }],
        shipping_address: BLANK,
        shipping_methods: DHL,
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cart_01M3YKC6VAKK5CEY2AM5E2CGKF"));
  });

  it("lets a cart of lines with requires_shipping=false through without reading products", async () => {
    const { container } = store([]);
    await expect(
      assertPostableShippingAddress(container, {
        id: "cart_1",
        items: [{ requires_shipping: false, product_id: "prod_course" }],
        shipping_address: null,
        shipping_methods: DHL,
      }),
    ).resolves.toBeUndefined();
  });

  it("still guards a mixed cart (course + physical)", async () => {
    const { container } = store([COURSE, KETTLE]);
    await expect(
      assertPostableShippingAddress(container, {
        id: "cart_2",
        items: [
          { requires_shipping: true, product_id: "prod_course" },
          { requires_shipping: true, product_id: "prod_kettle" },
        ],
        shipping_address: BLANK,
        shipping_methods: DHL,
      }),
    ).rejects.toThrow(/postal_code, city, province/);
  });

  it("still guards a physical-only cart", async () => {
    const { container } = store([KETTLE]);
    await expect(
      assertPostableShippingAddress(container, {
        id: "cart_3",
        items: [{ requires_shipping: true, product_id: "prod_kettle" }],
        shipping_address: { ...FULL, city: "" },
        shipping_methods: DHL,
      }),
    ).rejects.toThrow(/city/);
  });

  it("passes a physical-only cart with a full address", async () => {
    const { container } = store([KETTLE]);
    await expect(
      assertPostableShippingAddress(container, {
        id: "cart_4",
        items: [{ requires_shipping: true, product_id: "prod_kettle" }],
        shipping_address: FULL,
        shipping_methods: DHL,
      }),
    ).resolves.toBeUndefined();
  });
});
