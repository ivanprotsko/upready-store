import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrdersWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";
import { guestOrderToken } from "../../src/store-order-access/token";

jest.setTimeout(180_000);

/**
 * Seam test of the Store API's order isolation (b07-store-api-isolation).
 *
 * The defect this pins down was found by the f03 acceptance and measured
 * again on the b07 stand: `GET /store/orders/:id` carried no authentication at
 * all in Medusa 2.19, so anyone holding ANY shop's publishable key could read
 * ANY order of ANY shop — email, phone and shipping address included — and
 * `GET /store/orders` filtered by `customer_id` alone, so one account with
 * orders in two shops saw both lists under either key.
 *
 * The negatives are the test. Each of them was a 200 before the fix:
 *
 *   - anonymous, with the shop's own key;
 *   - a logged-in customer who is not the owner;
 *   - the owner, under another shop's key;
 *   - a guest access token that belongs to a different order;
 *   - the same three doors on `POST /store/orders/:id/transfer/request`,
 *     `POST /store/returns` and `GET /store/carts/:id`.
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

const PASSWORD = "supersecret";
const CUSTOMER_PASSWORD = "supersecret-customer";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("store: an order is readable by its owner, and by nobody else", () => {
      let regionId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeHeaders = (
        owner: Registered,
        customerToken?: string,
        orderToken?: string,
      ) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(customerToken ? { authorization: `Bearer ${customerToken}` } : {}),
          ...(orderToken ? { "x-order-token": orderToken } : {}),
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

      /** An order in `owner`'s shop, on `customerId` when one is given. */
      const placeOrder = async (
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
              phone: "+491700000000",
            },
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });
        return order;
      };

      const readOrder = (
        owner: Registered,
        orderId: string,
        customerToken?: string,
        orderToken?: string,
      ) =>
        failed(
          api.get(
            `/store/orders/${orderId}?fields=id,email,*shipping_address`,
            storeHeaders(owner, customerToken, orderToken),
          ),
        );

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

      it("lets the owner read their own order", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const order = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);

        const read = await readOrder(a, order.id, buyer.token);
        expect(read.status).toBe(200);
        expect(read.data.order.id).toBe(order.id);
        expect(read.data.order.shipping_address.phone).toBe("+491700000000");
      });

      it("refuses an anonymous read with the shop's own key", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const order = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);

        const read = await readOrder(a, order.id);
        expect(read.status).toBe(404);
        expect(read.data.order).toBeUndefined();
      });

      it("refuses a logged-in customer who does not own the order", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const stranger = await registerCustomer(a, "stranger@example.com");
        const order = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);

        const read = await readOrder(a, order.id, stranger.token);
        expect(read.status).toBe(404);
      });

      it("refuses the owner when the call carries another shop's key", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const order = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);

        const read = await readOrder(b, order.id, buyer.token);
        expect(read.status).toBe(404);
      });

      it("serves a guest order to the holder of its own access token, and to no other token", async () => {
        const guestOrder = await placeOrder(a, "guest@example.com", "Acme mug");
        const otherOrder = await placeOrder(a, "other@example.com", "Acme cup");

        const withOwnToken = await readOrder(
          a,
          guestOrder.id,
          undefined,
          guestOrderToken(guestOrder.id),
        );
        expect(withOwnToken.status).toBe(200);
        expect(withOwnToken.data.order.email).toBe("guest@example.com");

        const withOtherToken = await readOrder(
          a,
          guestOrder.id,
          undefined,
          guestOrderToken(otherOrder.id),
        );
        expect(withOtherToken.status).toBe(404);

        const withJunk = await readOrder(a, guestOrder.id, undefined, "not-a-token");
        expect(withJunk.status).toBe(404);

        // The token is a capability, not a bypass of the shop boundary.
        const wrongShop = await readOrder(
          b,
          guestOrder.id,
          undefined,
          guestOrderToken(guestOrder.id),
        );
        expect(wrongShop.status).toBe(404);
      });

      it("scopes GET /store/orders to the shop whose key the call carries", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const inA = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);
        const inB = await placeOrder(b, "owner@example.com", "Globex shirt", buyer.id);

        const listedInA = await api.get("/store/orders?limit=50", storeHeaders(a, buyer.token));
        expect(listedInA.data.orders.map((o: { id: string }) => o.id)).toEqual([inA.id]);
        expect(listedInA.data.count).toBe(1);

        const listedInB = await api.get("/store/orders?limit=50", storeHeaders(b, buyer.token));
        expect(listedInB.data.orders.map((o: { id: string }) => o.id)).toEqual([inB.id]);

        // A sales_channel_id sent by the caller cannot widen the list. Two
        // things stop it, and this pins the outer one: `StoreGetOrdersParams`
        // is strict, so the parameter never reaches the handler at all. The
        // inner one is `scopeOrderListToShop`, which writes the shop's own
        // channels over `req.filterableFields` after the validator has run.
        const widened = await failed(
          api.get(
            `/store/orders?limit=50&sales_channel_id=${b.tenant.sales_channel.id}`,
            storeHeaders(a, buyer.token),
          ),
        );
        expect(widened.status).toBe(400);
        expect(widened.data.message).toContain("sales_channel_id");
      });

      it("refuses a transfer request aimed at another shop's order", async () => {
        const guestOrder = await placeOrder(a, "guest@example.com", "Acme mug");
        const stranger = await registerCustomer(b, "stranger@example.com");

        const requested = await failed(
          api.post(
            `/store/orders/${guestOrder.id}/transfer/request`,
            {},
            storeHeaders(b, stranger.token),
          ),
        );
        expect(requested.status).toBe(404);
      });

      it("answers a transfer request with the order id and email only", async () => {
        const guestOrder = await placeOrder(a, "guest@example.com", "Acme mug");
        const stranger = await registerCustomer(a, "stranger@example.com");

        const requested = await failed(
          api.post(
            `/store/orders/${guestOrder.id}/transfer/request?fields=id,email,*shipping_address,*items`,
            {},
            storeHeaders(a, stranger.token),
          ),
        );
        expect(requested.status).toBe(200);
        expect(requested.data.order.id).toBe(guestOrder.id);
        expect(requested.data.order.shipping_address).toBeUndefined();
        expect(requested.data.order.items).toBeUndefined();
      });

      it("refuses an anonymous return and a return on somebody else's order", async () => {
        const buyer = await registerCustomer(a, "owner@example.com");
        const stranger = await registerCustomer(a, "stranger@example.com");
        const order = await placeOrder(a, "owner@example.com", "Acme shirt", buyer.id);

        const body = {
          order_id: order.id,
          items: [{ id: "orli_does_not_matter", quantity: 1 }],
          return_shipping: { option_id: "so_does_not_matter" },
        };

        const anonymous = await failed(api.post("/store/returns", body, storeHeaders(a)));
        expect(anonymous.status).toBe(401);

        const byStranger = await failed(
          api.post("/store/returns", body, storeHeaders(a, stranger.token)),
        );
        expect(byStranger.status).toBe(404);
      });

      it("refuses a cart read that carries another shop's key", async () => {
        const created = await api.post(
          "/store/carts",
          { region_id: regionId, email: "cart@example.com" },
          storeHeaders(a),
        );
        const cartId = created.data.cart.id as string;

        const own = await failed(api.get(`/store/carts/${cartId}`, storeHeaders(a)));
        expect(own.status).toBe(200);
        expect(own.data.cart.email).toBe("cart@example.com");

        const foreign = await failed(api.get(`/store/carts/${cartId}`, storeHeaders(b)));
        expect(foreign.status).toBe(404);
      });
    });
  },
});
