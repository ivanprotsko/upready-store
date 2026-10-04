import { MedusaError } from "@medusajs/framework/utils";

const refreshRun = jest.fn(async () => ({}));

jest.mock("@medusajs/medusa/core-flows", () => ({
  refreshCartItemsWorkflow: () => ({ run: refreshRun }),
}));

import { POST, dropShippingFromCart } from "../route";

/**
 * t-2026-10-04-23: `POST /store/carts/:id/drop-shipping` takes a stale shipping
 * method off a cart with nothing left to post, and refuses a cart that still
 * ships something.
 */
type Item = { requires_shipping?: boolean; product_id?: string };

const COURSE = { id: "prod_course", metadata: { digital: "true" } };
const KETTLE = { id: "prod_kettle", metadata: null };

const stand = ({
  items,
  methods,
  completed_at = null,
  digitalOptions = [],
}: {
  items: Item[];
  methods: { id: string; shipping_option_id: string }[];
  completed_at?: string | null;
  digitalOptions?: string[];
}) => {
  const softDeleteShippingMethods = jest.fn(async () => undefined);
  const info = jest.fn();
  const container = {
    resolve: (key: string) => {
      if (key === "cart") return { softDeleteShippingMethods };
      if (key === "logger") return { info };
      return {
        graph: async ({ entity, filters }: { entity: string; filters: { id: string | string[] } }) => {
          if (entity === "cart") {
            return {
              data:
                filters.id === "cart_missing"
                  ? []
                  : [{ id: filters.id, completed_at, items, shipping_methods: methods }],
            };
          }
          if (entity === "product") {
            return { data: [COURSE, KETTLE] };
          }
          return {
            data: (filters.id as string[]).map((id) => ({
              id,
              metadata: digitalOptions.includes(id) ? { digital_delivery: "true" } : null,
            })),
          };
        },
      };
    },
  } as never;
  return { container, softDeleteShippingMethods, info };
};

const DHL = { id: "casm_dhl", shipping_option_id: "so_dhl" };
const DIGITAL = { id: "casm_digital", shipping_option_id: "so_digital" };

beforeEach(() => refreshRun.mockClear());

describe("dropShippingFromCart", () => {
  it("drops DHL from a course-only cart and refreshes the cart (digital only)", async () => {
    const { container, softDeleteShippingMethods, info } = stand({
      items: [{ requires_shipping: true, product_id: "prod_course" }],
      methods: [DHL],
    });

    await expect(dropShippingFromCart(container, "cart_01")).resolves.toEqual(["casm_dhl"]);
    expect(softDeleteShippingMethods).toHaveBeenCalledWith(["casm_dhl"]);
    expect(refreshRun).toHaveBeenCalledWith({ input: { cart_id: "cart_01" } });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("cart_01"));
  });

  it("keeps the ₽0 digital-delivery method and drops only the stale one", async () => {
    const { container, softDeleteShippingMethods } = stand({
      items: [{ requires_shipping: false, product_id: "prod_course" }],
      methods: [DIGITAL, DHL],
      digitalOptions: ["so_digital"],
    });

    await expect(dropShippingFromCart(container, "cart_02")).resolves.toEqual(["casm_dhl"]);
    expect(softDeleteShippingMethods).toHaveBeenCalledWith(["casm_dhl"]);
  });

  it("is a no-op on a digital cart that holds only the digital-delivery method", async () => {
    const { container, softDeleteShippingMethods } = stand({
      items: [{ requires_shipping: true, product_id: "prod_course" }],
      methods: [DIGITAL],
      digitalOptions: ["so_digital"],
    });

    await expect(dropShippingFromCart(container, "cart_03")).resolves.toEqual([]);
    expect(softDeleteShippingMethods).not.toHaveBeenCalled();
    expect(refreshRun).not.toHaveBeenCalled();
  });

  it("refuses a mixed cart with 409 and keeps its method", async () => {
    const { container, softDeleteShippingMethods } = stand({
      items: [
        { requires_shipping: true, product_id: "prod_course" },
        { requires_shipping: true, product_id: "prod_kettle" },
      ],
      methods: [DHL],
    });

    const error = await dropShippingFromCart(container, "cart_04").catch((e) => e);
    expect(error).toBeInstanceOf(MedusaError);
    expect(error.type).toBe(MedusaError.Types.CONFLICT);
    expect(softDeleteShippingMethods).not.toHaveBeenCalled();
  });

  it("refuses a physical-only cart with 409", async () => {
    const { container, softDeleteShippingMethods } = stand({
      items: [{ requires_shipping: true, product_id: "prod_kettle" }],
      methods: [DHL],
    });

    await expect(dropShippingFromCart(container, "cart_05")).rejects.toMatchObject({
      type: MedusaError.Types.CONFLICT,
    });
    expect(softDeleteShippingMethods).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown cart and refuses a completed one", async () => {
    await expect(
      dropShippingFromCart(stand({ items: [], methods: [] }).container, "cart_missing"),
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND });

    await expect(
      dropShippingFromCart(
        stand({ items: [], methods: [DHL], completed_at: "2026-10-04T00:00:00Z" }).container,
        "cart_06",
      ),
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
  });
});

describe("POST /store/carts/:id/drop-shipping", () => {
  it("answers with the dropped method ids", async () => {
    const { container } = stand({
      items: [{ requires_shipping: true, product_id: "prod_course" }],
      methods: [DHL],
    });
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };

    await POST({ scope: container, params: { id: "cart_07" } } as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ cart_id: "cart_07", dropped: ["casm_dhl"] });
  });
});
