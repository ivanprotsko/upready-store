import { readFileSync } from "node:fs";
import { join } from "node:path";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrderPaymentCollectionWorkflow,
  createOrdersWorkflow,
  createRegionsWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

jest.setTimeout(180_000);

/**
 * The order's one stage (t-2026-10-14-58, step C) is computed on the client
 * from fields the storefront and the panel now ask for: the fulfillments'
 * dates, `data` and labels, the shipping methods' `data`, the payment
 * sessions. A field the API does not accept is a 400 for the whole page, and a
 * field it drops silently is a stage stuck on «Собирается». So this spec sends
 * the exact `fields` strings the code sends, read from the source files, to the
 * real API, and checks for a 200 and for every field in the answer:
 *
 *   - storefront `retrieveOrder` and `listOrders` (`apps/storefront/src/lib/data/orders.ts`);
 *   - panel orders list (`DEFAULT_FIELDS`, `routes/orders/order-list/const.ts`);
 *   - panel customer page (`ORDER_FIELDS`, `routes/customers/customer-detail/customer-detail.tsx`).
 *
 * Runner facts, the same as the other specs here: the database is restored
 * from its post-`beforeAll` snapshot before every test, and `DB_HOST` has to be
 * the literal `localhost`.
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

// Jest runs from `apps/backend`.
const read = (path: string) => readFileSync(join(process.cwd(), "..", path), "utf8");

const storefrontOrders = read("storefront/src/lib/data/orders.ts");
/** The `fields` string of the storefront fetch whose call starts with `marker`. */
const storefrontFields = (marker: string) => {
  const at = storefrontOrders.indexOf(marker);
  if (at < 0) throw new Error(`orders.ts has no ${marker}`);
  const fields = storefrontOrders.slice(storefrontOrders.indexOf("fields:", at)).match(/"([^"]+)"/);
  if (!fields) throw new Error(`no fields after ${marker}`);
  return fields[1];
};
/** The strings of `const <name> = [ … ]`. */
const arrayIn = (source: string, name: string) => {
  const block = source.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\]`));
  if (!block) throw new Error(`no ${name}`);
  return Array.from(block[1].matchAll(/"([^"]+)"/g), (m) => m[1]);
};

const RETRIEVE_FIELDS = storefrontFields("fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`");
const LIST_FIELDS = storefrontFields("fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`");
const panelList = read("tenant-panel/src/routes/orders/order-list/const.ts");
const PANEL_LIST_FIELDS = [
  ...arrayIn(panelList, "DEFAULT_PROPERTIES"),
  ...arrayIn(panelList, "DEFAULT_RELATIONS"),
].join(",");
const PANEL_CUSTOMER_FIELDS = arrayIn(
  read("tenant-panel/src/routes/customers/customer-detail/customer-detail.tsx"),
  "ORDER_FIELDS",
).join(",");

const FULFILLMENT_KEYS = ["packed_at", "shipped_at", "delivered_at", "canceled_at", "data"];

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("order stage: the fields the storefront and the panel ask for", () => {
      let regionId: string;
      let locationId: string;
      let shop: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const answer = (promise: Promise<any>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        return { token: login.data.token, tenant: created.data.tenant };
      };

      const storeHeaders = (customerToken: string) => ({
        headers: {
          "x-publishable-api-key": shop.tenant.api_key.token,
          authorization: `Bearer ${customerToken}`,
        },
      });

      const registerCustomer = async (email: string) => {
        const key = { headers: { "x-publishable-api-key": shop.tenant.api_key.token } };
        const registration = await api.post("/auth/customer/emailpass/register", { email, password: CUSTOMER_PASSWORD }, key);
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Ольга", last_name: "Смирнова" },
          storeHeaders(registration.data.token),
        );
        expect(created.status).toBe(200);
        const login = await api.post("/auth/customer/emailpass", { email, password: CUSTOMER_PASSWORD }, key);
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      /** A paid, packed and shipped order of `customerId` with a tracking label. */
      const shippedOrder = async (customerId: string) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "olga@example.com",
            customer_id: customerId,
            sales_channel_id: shop.tenant.sales_channel.id,
            items: [{ title: "Зубная паста", quantity: 1, unit_price: 10 }],
            shipping_methods: [{ name: "СДЭК — пункт выдачи", amount: 3, data: { pickup_point_code: "MSK123" } }],
            shipping_address: {
              first_name: "Ольга",
              last_name: "Смирнова",
              address_1: "ул. Тайнинская, 26",
              city: "Berlin",
              country_code: "de",
              postal_code: "10115",
            },
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });

        const { result: collections } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: order.id, amount: 13 },
        });
        const collection = Array.isArray(collections) ? collections[0] : collections;
        const payments = container.resolve(Modules.PAYMENT);
        const session = await payments.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          currency_code: "eur",
          amount: 13,
          data: {},
        });
        await payments.authorizePaymentSession(session.id, {});

        const itemId = order.items![0].id;
        const fulfilled = await api.post(
          `/tenants/orders/${order.id}/fulfillments`,
          { items: [{ id: itemId, quantity: 1 }], location_id: locationId },
          bearer(shop.token),
        );
        expect(fulfilled.status).toBe(200);
        const read = await api.get(`/tenants/orders/${order.id}?fields=id,*fulfillments`, bearer(shop.token));
        const fulfillmentId = read.data.order.fulfillments[0].id;
        const shipped = await api.post(
          `/tenants/orders/${order.id}/fulfillments/${fulfillmentId}/shipments`,
          {
            items: [{ id: itemId, quantity: 1 }],
            labels: [{ tracking_number: "1110019201", tracking_url: "https://www.cdek.ru/ru/tracking?order_id=1110019201", label_url: "#" }],
          },
          bearer(shop.token),
        );
        expect(shipped.status).toBe(200);
        return order;
      };

      /** Every key the stage reads is in the answer: selected, not dropped. */
      const expectStageFields = (order: any) => {
        expect(order.fulfillments).toHaveLength(1);
        const [fulfillment] = order.fulfillments;
        for (const key of FULFILLMENT_KEYS) expect(fulfillment).toHaveProperty(key);
        expect(fulfillment.packed_at).toBeTruthy();
        expect(fulfillment.shipped_at).toBeTruthy();
      };

      beforeAll(async () => {
        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;
        const {
          result: [location],
        } = await createStockLocationsWorkflow(container).run({
          input: { locations: [{ name: "Склад" }] },
        });
        locationId = location.id;
        shop = await registerTenant("cherk", "Черкашино");
      });

      it("reads the field strings from the code", () => {
        for (const fields of [RETRIEVE_FIELDS, LIST_FIELDS]) {
          expect(fields).toContain("+fulfillments.canceled_at");
          expect(fields).toContain("+fulfillments.data");
          expect(fields).toContain("*fulfillments.labels");
          expect(fields).toContain("+shipping_methods.data");
        }
        expect(RETRIEVE_FIELDS).toContain("+payment_collections.payment_sessions.status");
        for (const fields of [PANEL_LIST_FIELDS, PANEL_CUSTOMER_FIELDS]) {
          expect(fields).toContain("fulfillments.data");
          expect(fields).toContain("payment_collections.payments.canceled_at");
          expect(fields).toContain("payment_collections.payment_sessions.status");
        }
      });

      it("storefront: retrieveOrder and listOrders answer 200 with every stage field", async () => {
        const buyer = await registerCustomer("olga@example.com");
        const order = await shippedOrder(buyer.id);

        const one = await answer(
          api.get(`/store/orders/${order.id}?fields=${encodeURIComponent(RETRIEVE_FIELDS)}`, storeHeaders(buyer.token)),
        );
        console.log(`[t58c] GET /store/orders/:id → ${one.status}${one.status === 200 ? "" : ` ${JSON.stringify(one.data)}`}`);
        expect(one.status).toBe(200);
        expectStageFields(one.data.order);
        expect(one.data.order.fulfillments[0].labels[0].tracking_number).toBe("1110019201");
        expect(one.data.order.shipping_methods[0].data).toEqual({ pickup_point_code: "MSK123" });
        expect(one.data.order.payment_collections[0].payment_sessions[0]).toMatchObject({
          provider_id: "pp_system_default",
          status: "authorized",
        });

        const list = await answer(
          api.get(
            `/store/orders?limit=10&offset=0&order=-created_at&fields=${encodeURIComponent(LIST_FIELDS)}`,
            storeHeaders(buyer.token),
          ),
        );
        console.log(`[t58c] GET /store/orders → ${list.status}${list.status === 200 ? "" : ` ${JSON.stringify(list.data)}`}`);
        expect(list.status).toBe(200);
        expect(list.data.orders).toHaveLength(1);
        expectStageFields(list.data.orders[0]);
        expect(list.data.orders[0].fulfillments[0].labels[0].tracking_number).toBe("1110019201");
        expect(list.data.orders[0].shipping_methods[0].data).toEqual({ pickup_point_code: "MSK123" });
      });

      it("panel: the orders list and the customer page answer 200 with every stage field", async () => {
        const buyer = await registerCustomer("olga@example.com");
        const order = await shippedOrder(buyer.id);

        const list = await answer(
          api.get(`/tenants/orders?limit=20&offset=0&fields=${encodeURIComponent(PANEL_LIST_FIELDS)}`, bearer(shop.token)),
        );
        console.log(`[t58c] GET /tenants/orders (list) → ${list.status}${list.status === 200 ? "" : ` ${JSON.stringify(list.data)}`}`);
        expect(list.status).toBe(200);
        expect(list.data.orders.map((o: any) => o.id)).toEqual([order.id]);

        const customer = await answer(
          api.get(
            `/tenants/orders?customer_id=${buyer.id}&order=-created_at&limit=50&fields=${encodeURIComponent(PANEL_CUSTOMER_FIELDS)}`,
            bearer(shop.token),
          ),
        );
        console.log(`[t58c] GET /tenants/orders (customer) → ${customer.status}${customer.status === 200 ? "" : ` ${JSON.stringify(customer.data)}`}`);
        expect(customer.status).toBe(200);
        expect(customer.data.orders.map((o: any) => o.id)).toEqual([order.id]);

        for (const row of [list.data.orders[0], customer.data.orders[0]]) {
          expectStageFields(row);
          const [collection] = row.payment_collections;
          expect(collection.payments[0]).toHaveProperty("canceled_at");
          expect(collection.payments[0].provider_id).toBe("pp_system_default");
          expect(collection.payment_sessions[0]).toMatchObject({ provider_id: "pp_system_default", status: "authorized" });
        }
      });
    });
  },
});
