import { assertPochtaPointChosen, methodHasPochtaPoint } from "../validate-cart-pochta-point";

/**
 * The completion gate for a Russian Post cart (46df-pochta): the point must be
 * one the provider recorded.
 */

const containerWith = (options: Array<{ id: string; provider_id: string }>, cartMethods?: unknown[]) => {
  const asked: string[] = [];
  return {
    asked,
    container: {
      resolve: () => ({
        graph: async ({ entity }: { entity: string }) => {
          asked.push(entity);
          if (entity === "cart") return { data: [{ shipping_methods: cartMethods ?? [] }] };
          return { data: options };
        },
      }),
    } as never,
  };
};

const RECORDED = { provider: "pochta", pochta_point_index: "980063", pochta_point_kind: "pvz" };

describe("methodHasPochtaPoint", () => {
  it("wants the provider's own mark and a six-digit index", () => {
    expect(methodHasPochtaPoint(RECORDED)).toBe(true);
    expect(methodHasPochtaPoint({ pochta_point_index: "980063" })).toBe(false);
    expect(methodHasPochtaPoint({ provider: "pochta", pochta_point_index: "" })).toBe(false);
    expect(methodHasPochtaPoint(null)).toBe(false);
  });
});

describe("assertPochtaPointChosen", () => {
  it("passes a Russian Post method that carries its point", async () => {
    const { container } = containerWith([{ id: "so_p", provider_id: "pochta_pochta" }]);
    await expect(
      assertPochtaPointChosen(container, { shipping_methods: [{ shipping_option_id: "so_p", data: RECORDED }] }),
    ).resolves.toBeUndefined();
  });

  it("refuses a Russian Post method without a point", async () => {
    const { container } = containerWith([{ id: "so_p", provider_id: "pochta_pochta" }]);
    await expect(
      assertPochtaPointChosen(container, { shipping_methods: [{ shipping_option_id: "so_p", data: {} }] }),
    ).rejects.toThrow(/Выберите пункт выдачи Почты России/);
  });

  it("leaves every other carrier alone", async () => {
    const { container } = containerWith([{ id: "so_c", provider_id: "cdek_cdek" }]);
    await expect(
      assertPochtaPointChosen(container, { shipping_methods: [{ shipping_option_id: "so_c", data: {} }] }),
    ).resolves.toBeUndefined();
  });

  it("reads the methods back when the hook's cart came without their data", async () => {
    const { container, asked } = containerWith(
      [{ id: "so_p", provider_id: "pochta_pochta" }],
      [{ shipping_option_id: "so_p", data: {} }],
    );
    await expect(
      assertPochtaPointChosen(container, { id: "cart_1", shipping_methods: [{ shipping_option_id: "so_p" }] }),
    ).rejects.toThrow();
    expect(asked).toEqual(["cart", "shipping_option"]);
  });

  it("asks nothing for a cart without shipping methods", async () => {
    const { container, asked } = containerWith([]);
    await assertPochtaPointChosen(container, { shipping_methods: [] });
    expect(asked).toEqual([]);
  });
});
