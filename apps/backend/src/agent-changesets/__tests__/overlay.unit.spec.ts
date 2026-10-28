import { overlayAnswer, overlayStagedProductsOnAnswer, resetOverlayCache, type ProductOverlay } from "../overlay";

jest.mock("../../api/store/tenant/resolve-tenant", () => ({
  resolveTenantFromPublishableKeyHeader: jest.fn(),
}));

const resolveMock = jest.requireMock("../../api/store/tenant/resolve-tenant")
  .resolveTenantFromPublishableKeyHeader as jest.Mock;

const overlay: ProductOverlay = {
  ops: [
    { method: "POST", path: "/tenants/products/prod_1", body: { title: "Новый чай", categories: [{ id: "pcat_1" }] } },
    { method: "POST", path: "/tenants/products/prod_1/variants/variant_1", body: { prices: [{ amount: 500, currency_code: "rub" }] } },
    { method: "POST", path: "/tenants/products/prod_1/attributes", body: { values: [{ key: "taste", value: "sweet" }, { key: "color", value: null }] } },
  ],
  categories: new Map([["pcat_1", { id: "pcat_1", name: "Чай", handle: "tea" }]]),
};

const product = {
  id: "prod_1",
  title: "Чай",
  description: "d",
  categories: [],
  variants: [
    { id: "variant_1", calculated_price: { currency_code: "RUB", calculated_amount: 900, original_amount: 900 } },
    { id: "variant_2", calculated_price: { currency_code: "RUB", calculated_amount: 700 } },
  ],
};

describe("stage product overlay (t-2026-10-27-04)", () => {
  it("lays title, categories and the price over the product", () => {
    const body = overlayAnswer({ product }, overlay, null) as { product: typeof product & { categories: unknown[] } };
    expect(body.product.title).toBe("Новый чай");
    expect(body.product.description).toBe("d");
    expect(body.product.categories).toEqual([{ id: "pcat_1", name: "Чай", handle: "tea" }]);
    expect(body.product.variants[0].calculated_price).toMatchObject({ calculated_amount: 500, original_amount: 500 });
    expect(body.product.variants[1].calculated_price).toMatchObject({ calculated_amount: 700 });
  });

  it("leaves another product as it is", () => {
    const other = { ...product, id: "prod_2" };
    expect((overlayAnswer({ products: [other] }, overlay, null) as { products: unknown[] }).products[0]).toEqual(other);
  });

  it("puts staged characteristics in place and drops a cleared one", () => {
    const body = overlayAnswer(
      {
        product_attributes: [
          { key: "taste", value: "bitter", label: "Горький" },
          { key: "color", value: "green" },
          { key: "size", value: "s" },
        ],
        count: 3,
      },
      overlay,
      "prod_1",
    ) as { product_attributes: unknown[]; count: number };
    expect(body.product_attributes).toEqual([
      { key: "taste", value: "sweet", label: null },
      { key: "size", value: "s" },
    ]);
    expect(body.count).toBe(2);
  });

  describe("the middleware", () => {
    const run = async (path: string, mainOf: string | null, staged: unknown[] = [{ ops: overlay.ops }]) => {
      resetOverlayCache();
      resolveMock.mockResolvedValue(mainOf === null ? { id: "tenant_main", metadata: {} } : { id: "tenant_stage", metadata: { stage_of: mainOf } });
      const listAgentChangesets = jest.fn().mockResolvedValue(staged);
      const scope = {
        resolve: (key: string) =>
          key === "query"
            ? { graph: async () => ({ data: [{ id: "pcat_1", name: "Чай", handle: "tea" }] }) }
            : key === "logger"
              ? { warn: jest.fn() }
              : { listAgentChangesets },
      };
      const req = { method: "GET", originalUrl: path, query: {}, scope, get: () => "pk_key" };
      const sent: unknown[] = [];
      const res = { json: (body: unknown) => sent.push(body) };
      const next = jest.fn();
      await overlayStagedProductsOnAnswer(req as never, res as never, next);
      res.json({ product });
      return { sent, next, listAgentChangesets };
    };

    it("overlays a stage site's product read", async () => {
      const { sent, next, listAgentChangesets } = await run("/store/products/prod_1", "tenant_main");
      expect(next).toHaveBeenCalled();
      expect(listAgentChangesets).toHaveBeenCalledWith({ tenant_id: "tenant_main", status: "staged" }, expect.anything());
      expect((sent[0] as { product: { title: string } }).product.title).toBe("Новый чай");
    });

    it("never reads a changeset for the main site's key", async () => {
      const { sent, listAgentChangesets } = await run("/store/products/prod_1", null);
      expect(listAgentChangesets).not.toHaveBeenCalled();
      expect(sent[0]).toEqual({ product });
    });

    it("passes a request that is not a product read untouched", async () => {
      const { sent, listAgentChangesets } = await run("/store/carts/cart_1", "tenant_main");
      expect(listAgentChangesets).not.toHaveBeenCalled();
      expect(sent[0]).toEqual({ product });
    });
  });
});
