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
 * Seam test of the tenant order detail (piece 2) and the orders export
 * (piece 3): `/tenants/orders/:id` and everything under it, the payment
 * capture, the read-only references and `POST /tenants/orders/export`.
 *
 * Two things are asserted for every route: the happy path in the Admin's own
 * shape, and the isolation path, where tenant B gets a 404 (never a 403, never
 * a body that confirms A's row exists) or an empty page.
 *
 * Runner facts, same as tenants.spec.ts: the database is restored from its
 * post-`beforeAll` snapshot before every test, so each test reads only rows it
 * created itself, and `DB_HOST` must be the literal `localhost` or the runner
 * forces SSL and nothing connects.
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

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: order detail, actions and export", () => {
      let regionId: string;
      let locationId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      /** Every 404 assertion goes through this: axios rejects on a 4xx. */
      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: unknown },
          (error) => error.response as { status: number; data: unknown },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        expect(registration.status).toBe(200);

        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);

        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);

        return { token: login.data.token, tenant: created.data.tenant };
      };

      const placeOrder = async (owner: Registered, title: string) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "shopper@example.com",
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
          input: { locations: [{ name: "Test warehouse" }] },
        });
        locationId = location.id;

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("answers GET /tenants/orders/:id for the owner and 404 for anyone else", async () => {
        const order = await placeOrder(a, "Acme shirt");

        const mine = await api.get(`/tenants/orders/${order.id}`, bearer(a.token));
        expect(mine.status).toBe(200);
        expect(mine.data.order.id).toBe(order.id);
        expect(mine.data.order.items).toHaveLength(1);
        expect(mine.data.order.total).toBe(10);

        const foreign = await failed(api.get(`/tenants/orders/${order.id}`, bearer(b.token)));
        expect(foreign.status).toBe(404);

        // A missing id answers exactly like a foreign one: the status is the
        // same and the message names the id, never the owner.
        const missing = await failed(api.get("/tenants/orders/order_nope", bearer(a.token)));
        expect(missing.status).toBe(404);
      });

      it("answers preview, changes and line items for the owner only", async () => {
        const order = await placeOrder(a, "Acme shirt");

        const preview = await api.get(`/tenants/orders/${order.id}/preview`, bearer(a.token));
        expect(preview.status).toBe(200);
        expect(preview.data.order.id).toBe(order.id);

        const changes = await api.get(`/tenants/orders/${order.id}/changes`, bearer(a.token));
        expect(changes.status).toBe(200);
        expect(changes.data.order_changes).toEqual([]);

        const items = await api.get(`/tenants/orders/${order.id}/line-items`, bearer(a.token));
        expect(items.status).toBe(200);
        expect(items.data.order_items).toHaveLength(1);

        for (const path of ["preview", "changes", "line-items"]) {
          const foreign = await failed(
            api.get(`/tenants/orders/${order.id}/${path}`, bearer(b.token)),
          );
          expect(foreign.status).toBe(404);
        }
      });

      it("fulfils and ships an order for the owner, and refuses both for anyone else", async () => {
        const order = await placeOrder(a, "Acme shirt");
        const itemId = order.items![0].id;

        const foreignFulfil = await failed(
          api.post(
            `/tenants/orders/${order.id}/fulfillments`,
            { items: [{ id: itemId, quantity: 1 }], location_id: locationId },
            bearer(b.token),
          ),
        );
        expect(foreignFulfil.status).toBe(404);

        const fulfilled = await api.post(
          `/tenants/orders/${order.id}/fulfillments`,
          { items: [{ id: itemId, quantity: 1 }], location_id: locationId },
          bearer(a.token),
        );
        expect(fulfilled.status).toBe(200);

        // The statuses are read back from the detail route, not from the
        // mutation's own body: the Admin's `retrieveTransformQueryConfig`
        // (which both routes use) selects neither `fulfillment_status` nor
        // `fulfillments`, so the Admin's own fulfillment response does not
        // carry them either. The panel behaves the same way, invalidating its
        // order query after the mutation.
        const statusFields =
          "fields=id,status,fulfillment_status,payment_status,*fulfillments";

        const afterFulfil = await api.get(
          `/tenants/orders/${order.id}?${statusFields}`,
          bearer(a.token),
        );
        expect(afterFulfil.data.order.fulfillment_status).toBe("fulfilled");
        expect(afterFulfil.data.order.fulfillments).toHaveLength(1);

        const fulfillmentId = afterFulfil.data.order.fulfillments[0].id;

        const foreignShip = await failed(
          api.post(
            `/tenants/orders/${order.id}/fulfillments/${fulfillmentId}/shipments`,
            { items: [{ id: itemId, quantity: 1 }] },
            bearer(b.token),
          ),
        );
        expect(foreignShip.status).toBe(404);

        const shipped = await api.post(
          `/tenants/orders/${order.id}/fulfillments/${fulfillmentId}/shipments`,
          { items: [{ id: itemId, quantity: 1 }] },
          bearer(a.token),
        );
        expect(shipped.status).toBe(200);

        const afterShip = await api.get(
          `/tenants/orders/${order.id}?${statusFields}`,
          bearer(a.token),
        );
        expect(afterShip.data.order.fulfillment_status).toBe("shipped");

        const delivered = await api.post(
          `/tenants/orders/${order.id}/fulfillments/${fulfillmentId}/mark-as-delivered`,
          {},
          bearer(a.token),
        );
        expect(delivered.status).toBe(200);

        const afterDelivery = await api.get(
          `/tenants/orders/${order.id}?${statusFields}`,
          bearer(a.token),
        );
        expect(afterDelivery.data.order.fulfillment_status).toBe("delivered");
      });

      it("cancels an order for the owner and 404s for anyone else", async () => {
        const order = await placeOrder(a, "Acme shirt");

        const foreign = await failed(
          api.post(`/tenants/orders/${order.id}/cancel`, {}, bearer(b.token)),
        );
        expect(foreign.status).toBe(404);

        // The refused call changed nothing.
        const stillOpen = await api.get(`/tenants/orders/${order.id}`, bearer(a.token));
        expect(stillOpen.data.order.status).not.toBe("canceled");

        const canceled = await api.post(`/tenants/orders/${order.id}/cancel`, {}, bearer(a.token));
        expect(canceled.status).toBe(200);
        expect(canceled.data.order.status).toBe("canceled");
      });

      it("captures a payment of an owned order and 404s on another tenant's payment", async () => {
        const container = getContainer();
        const order = await placeOrder(a, "Acme shirt");

        const { result: collections } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: order.id, amount: 10 },
        });
        const collection = Array.isArray(collections) ? collections[0] : collections;

        const paymentModule = container.resolve(Modules.PAYMENT);
        const session = await paymentModule.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          currency_code: "eur",
          amount: 10,
          data: {},
        });
        const payment = await paymentModule.authorizePaymentSession(session.id, {});
        expect(payment).toBeTruthy();
        const paymentId = payment!.id;

        const foreign = await failed(
          api.post(`/tenants/payments/${paymentId}/capture`, {}, bearer(b.token)),
        );
        expect(foreign.status).toBe(404);

        const missing = await failed(
          api.post("/tenants/payments/pay_nope/capture", {}, bearer(a.token)),
        );
        expect(missing.status).toBe(404);

        const captured = await api.post(
          `/tenants/payments/${paymentId}/capture`,
          {},
          bearer(a.token),
        );
        expect(captured.status).toBe(200);
        expect(captured.data.payment.id).toBe(paymentId);
        expect(captured.data.payment.captured_at).toBeTruthy();
      });

      it("exports only the calling tenant's own orders as CSV", async () => {
        const orderA = await placeOrder(a, "Acme shirt");
        const orderB = await placeOrder(b, "Globex widget");

        const detailA = await api.get(`/tenants/orders/${orderA.id}`, bearer(a.token));
        const detailB = await api.get(`/tenants/orders/${orderB.id}`, bearer(b.token));
        const displayA = String(detailA.data.order.display_id);
        const displayB = String(detailB.data.order.display_id);

        const exportA = await api.post("/tenants/orders/export", {}, bearer(a.token));
        expect(exportA.status).toBe(200);
        expect(exportA.data.url).toEqual(expect.any(String));
        expect(exportA.data.count).toBe(1);

        const exportB = await api.post("/tenants/orders/export", {}, bearer(b.token));
        expect(exportB.status).toBe(200);
        expect(exportB.data.count).toBe(1);

        // The file itself: the local file provider writes into
        // apps/backend/static, so the rows are read from disk rather than from
        // the URL, whose port belongs to the provider's own configuration.
        const readCsv = async (url: string) => {
          const name = url.split("/").pop()!;
          const fs = await import("node:fs/promises");
          const path = await import("node:path");
          return fs.readFile(path.join(process.cwd(), "static", name), "utf8");
        };

        const csvA = await readCsv(exportA.data.url);
        const csvB = await readCsv(exportB.data.url);

        expect(csvA.split("\n")[0]).toBe(
          '"display_id","created_at","status","payment_status","fulfillment_status","email","currency","total","items_count","sales_channel"',
        );

        // The first column of every data row, and nothing else: `"1"` also
        // appears as the items_count of an unrelated order, so a substring
        // match on the whole file proves nothing.
        const displayIds = (csv: string) =>
          csv
            .trim()
            .split("\n")
            .slice(1)
            .map((line) => line.split(",")[0].replace(/"/g, ""));

        expect(displayIds(csvA)).toEqual([displayA]);
        expect(displayIds(csvB)).toEqual([displayB]);
        expect(csvA).toContain('"Acme"');
        expect(csvA).not.toContain('"Globex"');
        expect(csvB).toContain('"Globex"');
        expect(csvB).not.toContain('"Acme"');
      });

      it("keeps the order-detail reference lists tenant-safe", async () => {
        const order = await placeOrder(a, "Acme shirt");

        // Reservations are scoped to the tenant's own line items; neither
        // tenant has any here, and B must not see A's.
        for (const owner of [a, b]) {
          const reservations = await api.get("/tenants/reservations", bearer(owner.token));
          expect(reservations.status).toBe(200);
          expect(reservations.data.reservations).toEqual([]);
          expect(reservations.data.count).toBe(0);
        }

        // RMA lists are empty pages by design (see the route files).
        for (const [path, key] of [
          ["returns", "returns"],
          ["claims", "claims"],
          ["exchanges", "exchanges"],
          ["order-edits", "order_edits"],
        ]) {
          const page = await api.get(`/tenants/${path}`, bearer(a.token));
          expect(page.status).toBe(200);
          expect(page.data[key]).toEqual([]);
          expect(page.data.count).toBe(0);
        }

        // Warehouses are the shop's own since b06-order-tracking scoped the list
        // (review finding T-5): B reads its own and not the one this spec made
        // outside every shop.
        const locations = await api.get("/tenants/stock-locations", bearer(b.token));
        expect(locations.status).toBe(200);
        expect(locations.data.stock_locations.length).toBeGreaterThan(0);
        expect(locations.data.stock_locations.map((l: { id: string }) => l.id)).not.toContain(
          locationId,
        );

        for (const path of ["fulfillment-providers", "shipping-options"]) {
          const page = await api.get(`/tenants/${path}`, bearer(a.token));
          expect(page.status).toBe(200);
          expect(page.data.count).toEqual(expect.any(Number));
        }

        // `createOrdersWorkflow` creates a customer from the order's email, so
        // the order has one: A may read it, B may not, and an id nobody has is
        // the same 404 as a foreign one.
        const customerId = order.customer_id as string;
        expect(customerId).toEqual(expect.any(String));

        const mine = await api.get(`/tenants/customers/${customerId}`, bearer(a.token));
        expect(mine.status).toBe(200);
        expect(mine.data.customer.id).toBe(customerId);

        const foreignCustomer = await failed(
          api.get(`/tenants/customers/${customerId}`, bearer(b.token)),
        );
        expect(foreignCustomer.status).toBe(404);

        const missingCustomer = await failed(
          api.get("/tenants/customers/cus_nope", bearer(a.token)),
        );
        expect(missingCustomer.status).toBe(404);
      });
    });
  },
});
