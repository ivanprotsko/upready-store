import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrdersWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

jest.setTimeout(180_000);

/**
 * Seam test of `POST /store/customers/me/claim-orders`
 * (f03-guest-order-not-in-account): a buyer who checked out as a guest and
 * registered afterwards with the same address finds the order in the account,
 * and nobody else ever does.
 *
 * The negatives carry the weight here, and each is asserted through the Store
 * API rather than against the selector alone:
 *
 * - another address claims nothing and lists nothing;
 * - another shop's publishable key claims nothing, so a customer account,
 *   which is store-wide on this stack, cannot pull one shop's orders into
 *   another shop's screen;
 * - an order that already belongs to a registered account is never taken from
 *   it, however well the address matches.
 *
 * Runner facts, the same as the other specs here: the database is restored
 * from its post-`beforeAll` snapshot before every test, so a test reads only
 * the rows it created, and `DB_HOST` has to be the literal `localhost` or the
 * runner forces SSL and nothing connects.
 */
type Registered = {
  token: string;
  tenant: {
    id: string;
    handle: string;
    sales_channel: { id: string; name: string };
    api_key: { id: string; token: string };
  };
};

const PASSWORD = "supersecret-owner";
const CUSTOMER_PASSWORD = "supersecret-customer";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("store: a customer claims the guest orders of their own address", () => {
      let regionId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeHeaders = (owner: Registered, customerToken?: string) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(customerToken ? { authorization: `Bearer ${customerToken}` } : {}),
        },
      });

      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        return { token: login.data.token, tenant: created.data.tenant };
      };

      /** A checkout with an email and no account behind it. */
      const placeGuestOrder = async (
        owner: Registered,
        email: string,
        title: string,
        customerId?: string,
      ) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email,
            ...(customerId ? { customer_id: customerId } : {}),
            sales_channel_id: owner.tenant.sales_channel.id,
            items: [{ title, quantity: 1, unit_price: 10 }],
            shipping_address: {
              first_name: "Test",
              last_name: "Shopper",
              address_1: "1 Test street",
              city: "Berlin",
              country_code: "de",
              postal_code: "10115",
            },
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });
        return order;
      };

      /** Registers an account on `email` in `owner`'s storefront and returns its token and id. */
      const registerCustomer = async (owner: Registered, email: string) => {
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: CUSTOMER_PASSWORD },
          { headers: { "x-publishable-api-key": owner.tenant.api_key.token } },
        );
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "Buyer" },
          {
            headers: {
              "x-publishable-api-key": owner.tenant.api_key.token,
              authorization: `Bearer ${registration.data.token}`,
            },
          },
        );
        expect(created.status).toBe(200);
        const login = await api.post(
          "/auth/customer/emailpass",
          { email, password: CUSTOMER_PASSWORD },
          { headers: { "x-publishable-api-key": owner.tenant.api_key.token } },
        );
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      const claim = (owner: Registered, customerToken: string) =>
        api.post("/store/customers/me/claim-orders", {}, storeHeaders(owner, customerToken));

      const listOrders = (owner: Registered, customerToken: string) =>
        api.get("/store/orders?limit=50", storeHeaders(owner, customerToken));

      beforeAll(async () => {
        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("hands the guest order to the account registered on the same address", async () => {
        const order = await placeGuestOrder(a, "buyer@example.com", "Acme shirt");

        const buyer = await registerCustomer(a, "buyer@example.com");

        // Before the claim the account is empty: this is the defect the task
        // reports, reproduced here rather than assumed.
        const before = await listOrders(a, buyer.token);
        expect(before.data.orders).toHaveLength(0);

        const claimed = await claim(a, buyer.token);
        expect(claimed.status).toBe(200);
        expect(claimed.data.claimed).toBe(1);
        expect(claimed.data.orders[0].id).toBe(order.id);

        const after = await listOrders(a, buyer.token);
        expect(after.data.orders.map((o: { id: string }) => o.id)).toEqual([order.id]);

        // Idempotent: nothing is left to move, and nothing fails.
        const again = await claim(a, buyer.token);
        expect(again.data.claimed).toBe(0);
      });

      it("matches the address case-insensitively", async () => {
        const order = await placeGuestOrder(a, "Mixed.Case@Example.com", "Acme mug");
        const buyer = await registerCustomer(a, "mixed.case@example.com");

        const claimed = await claim(a, buyer.token);
        expect(claimed.data.claimed).toBe(1);
        expect(claimed.data.orders[0].id).toBe(order.id);
      });

      it("never hands an order to an account on another address", async () => {
        const order = await placeGuestOrder(a, "buyer@example.com", "Acme shirt");
        const stranger = await registerCustomer(a, "stranger@example.com");

        const claimed = await claim(a, stranger.token);
        expect(claimed.status).toBe(200);
        expect(claimed.data.claimed).toBe(0);

        const listed = await listOrders(a, stranger.token);
        expect(listed.data.orders).toHaveLength(0);

        // And the order is still where it was: the rightful address still gets it.
        const buyer = await registerCustomer(a, "buyer@example.com");
        const mine = await claim(a, buyer.token);
        expect(mine.data.claimed).toBe(1);
        expect(mine.data.orders[0].id).toBe(order.id);
      });

      it("never reaches across shops, even for the right address", async () => {
        const order = await placeGuestOrder(a, "buyer@example.com", "Acme shirt");
        const buyer = await registerCustomer(a, "buyer@example.com");

        // The same account, asking through the OTHER shop's publishable key.
        const throughB = await claim(b, buyer.token);
        expect(throughB.status).toBe(200);
        expect(throughB.data.claimed).toBe(0);

        const listed = await listOrders(a, buyer.token);
        expect(listed.data.orders).toHaveLength(0);

        // Asking through its own shop still works, so the zero above is the
        // shop filter and not a broken fixture.
        const throughA = await claim(a, buyer.token);
        expect(throughA.data.claimed).toBe(1);
        expect(throughA.data.orders[0].id).toBe(order.id);
      });

      it("never takes an order away from the registered account that owns it", async () => {
        const owner = await registerCustomer(a, "owner@example.com");
        // An order that belongs to `owner`'s account but carries somebody
        // else's address: registering that address must not pull it out.
        const order = await placeGuestOrder(a, "buyer@example.com", "Acme shirt", owner.id);

        const buyer = await registerCustomer(a, "buyer@example.com");
        const claimed = await claim(a, buyer.token);
        expect(claimed.data.claimed).toBe(0);

        const buyerSees = await listOrders(a, buyer.token);
        expect(buyerSees.data.orders).toHaveLength(0);

        const ownerSees = await listOrders(a, owner.token);
        expect(ownerSees.data.orders.map((o: { id: string }) => o.id)).toEqual([order.id]);
      });

      it("refuses the route without a customer behind the call", async () => {
        const anonymous = await failed(
          api.post("/store/customers/me/claim-orders", {}, storeHeaders(a)),
        );
        expect(anonymous.status).toBe(401);
      });
    });
  },
});
