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

const containerWith = (types: string[]) =>
  ({
    resolve: () => ({
      graph: async () => ({
        data: types.map((type, index) => ({
          id: `so_0${index}`,
          service_zone: { fulfillment_set: { type } },
        })),
      }),
    }),
  }) as never;

const COURIER = containerWith(["shipping"]);

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

  it("skips a cart with nothing to ship", async () => {
    await expect(
      assertPostableShippingAddress(COURIER, {
        shipping_address: null,
        shipping_methods: [],
      }),
    ).resolves.toBeUndefined();
  });
});
