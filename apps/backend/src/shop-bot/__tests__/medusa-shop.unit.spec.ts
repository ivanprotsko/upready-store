import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * The "cart sync" requirement (t-cherk-23): the bot and the storefront must
 * land on the SAME customer and the SAME open cart. Everything here is
 * mocked — `query.graph`, the auth module, and every core-flows workflow —
 * so the test is purely about `createMedusaShop`'s OWN branching: which
 * customer it resolves, and whether it reuses or creates a cart.
 */

const createCartRun = jest.fn();
const addToCartRun = jest.fn();
const createCustomerAccountRun = jest.fn();
const updateLineItemRun = jest.fn();
const deleteLineItemsRun = jest.fn();

jest.mock("@medusajs/medusa/core-flows", () => ({
  createCartWorkflow: () => ({ run: createCartRun }),
  addToCartWorkflow: () => ({ run: addToCartRun }),
  createCustomerAccountWorkflow: () => ({ run: createCustomerAccountRun }),
  updateLineItemInCartWorkflow: () => ({ run: updateLineItemRun }),
  deleteLineItemsWorkflow: () => ({ run: deleteLineItemsRun }),
}));

import { createMedusaShop } from "../medusa-shop";

const REGION = { id: "reg_1", currency_code: "rub", countries: [{ iso_2: "ru" }] };

const TENANT = { id: "ten_1", salesChannelId: "sc_1", defaultCountry: "ru" };

const USER = { id: 555, username: "buyer555", first_name: "Buyer" };

type GraphCall = { entity: string; filters?: Record<string, unknown> };

const buildContainer = (opts: {
  carts?: Array<Record<string, unknown>>;
  existingIdentity?: Record<string, unknown> | null;
}) => {
  const graphCalls: GraphCall[] = [];
  const listAuthIdentities = jest.fn(async () =>
    opts.existingIdentity ? [opts.existingIdentity] : [],
  );
  const createAuthIdentities = jest.fn(async () => ({
    id: "authid_new",
    app_metadata: {},
  }));

  const query = {
    graph: jest.fn(async ({ entity, filters }: GraphCall) => {
      graphCalls.push({ entity, filters });
      if (entity === "region") {
        return { data: [REGION] };
      }
      if (entity === "cart") {
        return { data: opts.carts ?? [] };
      }
      return { data: [] };
    }),
  };

  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.QUERY]: query,
    [Modules.AUTH]: { listAuthIdentities, createAuthIdentities },
    [ContainerRegistrationKeys.PG_CONNECTION]: {},
    tenant: {},
    wishlist: { listWishlistItems: jest.fn(async () => []), createWishlistItems: jest.fn() },
  };

  const container = {
    resolve: (key: string) => {
      if (!(key in services)) {
        throw new Error(`test container has no ${key}`);
      }
      return services[key];
    },
  };

  return { container: container as never, graphCalls, listAuthIdentities, createAuthIdentities };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createMedusaShop — customer resolution", () => {
  it("reuses the customer linked to the telegram identity's app_metadata", async () => {
    const { container, createAuthIdentities } = buildContainer({
      carts: [{ id: "cart_1", currency_code: "rub", completed_at: null, total: 0, items: [] }],
      existingIdentity: { id: "authid_1", app_metadata: { customer_id: "cus_existing" } },
    });
    const shop = createMedusaShop(container, TENANT);

    const cart = await shop.getCart(USER);

    expect(createAuthIdentities).not.toHaveBeenCalled();
    expect(createCustomerAccountRun).not.toHaveBeenCalled();
    expect(cart?.id).toBe("cart_1");
  });

  it("creates the identity and the customer on a buyer's first message, same as the site's first Telegram sign-in", async () => {
    createCustomerAccountRun.mockResolvedValue({ result: { id: "cus_new" } });
    const { container, createAuthIdentities } = buildContainer({
      carts: [],
      existingIdentity: null,
    });
    const shop = createMedusaShop(container, TENANT);

    await shop.getCart(USER);

    expect(createAuthIdentities).toHaveBeenCalledWith({
      provider_identities: [
        expect.objectContaining({ provider: "telegram", entity_id: "telegram:555" }),
      ],
    });
    expect(createCustomerAccountRun).toHaveBeenCalledTimes(1);
    const input = createCustomerAccountRun.mock.calls[0][0].input;
    expect(input.authIdentityId).toBe("authid_new");
    expect(input.customerData.email).toBe("tg_555@telegram.local");
    expect(input.customerData.metadata).toEqual({ tenant_id: "ten_1" });
  });
});

describe("createMedusaShop — cart sync", () => {
  it("reuses the customer's newest open cart in this shop's sales channel", async () => {
    const { container } = buildContainer({
      carts: [
        { id: "cart_old", currency_code: "rub", completed_at: "2026-01-01T00:00:00Z", total: 0, items: [] },
        { id: "cart_open", currency_code: "rub", completed_at: null, total: 500, items: [] },
      ],
      existingIdentity: { id: "authid_1", app_metadata: { customer_id: "cus_1" } },
    });
    const shop = createMedusaShop(container, TENANT);

    const cart = await shop.getCart(USER);

    expect(cart?.id).toBe("cart_open");
    expect(createCartRun).not.toHaveBeenCalled();
  });

  it("creates a new cart when the customer has none open in this channel", async () => {
    createCartRun.mockResolvedValue({
      result: { id: "cart_fresh", currency_code: "rub", items: [], total: 0 },
    });
    addToCartRun.mockResolvedValue(undefined);
    const { container } = buildContainer({
      carts: [],
      existingIdentity: { id: "authid_1", app_metadata: { customer_id: "cus_1" } },
    });
    const shop = createMedusaShop(container, TENANT);

    await shop.addToCart(USER, "variant_1", 2);

    expect(createCartRun).toHaveBeenCalledTimes(1);
    const cartInput = createCartRun.mock.calls[0][0].input;
    expect(cartInput.sales_channel_id).toBe("sc_1");
    expect(cartInput.customer_id).toBe("cus_1");
    expect(cartInput.region_id).toBe("reg_1");
    expect(cartInput.currency_code).toBe("rub");

    expect(addToCartRun).toHaveBeenCalledWith({
      input: { cart_id: "cart_fresh", items: [{ variant_id: "variant_1", quantity: 2 }] },
    });
  });

  it("getCart answers null, never a completed cart, when the customer's only cart on file is completed", async () => {
    const { container } = buildContainer({
      carts: [{ id: "cart_done", currency_code: "rub", completed_at: "2026-01-01T00:00:00Z", total: 0, items: [] }],
      existingIdentity: { id: "authid_1", app_metadata: { customer_id: "cus_1" } },
    });
    const shop = createMedusaShop(container, TENANT);

    const cart = await shop.getCart(USER);

    expect(cart).toBeNull();
    expect(createCartRun).not.toHaveBeenCalled();
  });
});
