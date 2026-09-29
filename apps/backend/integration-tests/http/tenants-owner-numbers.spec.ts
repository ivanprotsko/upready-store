import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  cancelOrderWorkflow,
  createOrdersWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

jest.setTimeout(180_000);

/**
 * Seam test of the two screens that answer «сколько я заработала»
 * (b01-owner-numbers): `GET /tenants/analytics/summary` («Обзор») and
 * `GET /tenants/customers` («Клиенты»).
 *
 * Both used to read `order_summary` and `order_item` by `order_id` alone.
 * Both tables are VERSIONED — one row per order version — so an order that had
 * been through any change (a cancellation, an edit, a fulfillment) counted
 * twice, and the live shop was shown 12 orders and ₽16 100 where it had 6
 * orders and ₽8 050. The fix is `src/api/tenants/order-totals.ts`, and this
 * file is what keeps both screens on it.
 *
 * The second version is written here with SQL rather than by driving an order
 * edit through its workflow, because what has to be reproduced is the SHAPE of
 * the live rows (`order_summary` and `order_item` at `version` 1 and 2 with
 * `order.version` = 2, measured on a clone of the platform database), not the
 * flow that happened to produce it. The seed scripts under `src/scripts`
 * (`t13-`, `t17-seed-test-tenant.ts`) write those tables the same way.
 *
 * Runner facts, same as the other specs here: the database is restored from
 * its post-`beforeAll` snapshot before EVERY test, so each test places its own
 * orders and reads only its own rows, and `DB_HOST` must be the literal
 * `localhost` or the runner forces SSL and nothing connects.
 */

type Registered = {
  token: string;
  tenant: { id: string; handle: string; sales_channel: { id: string } };
};

const PASSWORD = "supersecret-owner";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the owner's own numbers", () => {
      let regionId: string;
      let a: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

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

      /**
       * An order of this tenant, with as many line items as the caller asks
       * for. Every item carries a `product_id`, because «Топ товаров» groups by
       * it and skips an item without one — the id is a plain string on purpose,
       * as the query joins `order_item` to `order_line_item` only and never to
       * `product`.
       */
      const placeOrder = async (
        owner: Registered,
        email: string,
        items: { title: string; product_id: string; quantity: number; unit_price: number }[],
      ) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email,
            sales_channel_id: owner.tenant.sales_channel.id,
            items,
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

      /**
       * A second version of the order, exactly as a change leaves it: the
       * summary and every item copied at `version` 2, the old rows kept, and
       * the order pointing at the new version. `jsonb_populate_record` copies
       * whatever columns the table has, so a Medusa upgrade that adds one does
       * not turn this into a wrong fixture.
       */
      const addSecondVersion = async (orderId: string): Promise<void> => {
        const pg = getContainer().resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

        await pg.raw(
          `insert into order_summary
             select (jsonb_populate_record(
               null::order_summary,
               to_jsonb(os) || jsonb_build_object('id', os.id || '_v2', 'version', 2)
             )).*
             from order_summary os
             where os.order_id = ? and os.version = 1`,
          [orderId],
        );

        await pg.raw(
          `insert into order_item
             select (jsonb_populate_record(
               null::order_item,
               to_jsonb(oi) || jsonb_build_object('id', oi.id || '_v2', 'version', 2)
             )).*
             from order_item oi
             where oi.order_id = ? and oi.version = 1`,
          [orderId],
        );

        await pg("order").where({ id: orderId }).update({ version: 2 });
      };

      const summaryOf = async (owner: Registered) => {
        const response = await api.get(
          "/tenants/analytics/summary?period=30d",
          bearer(owner.token),
        );
        expect(response.status).toBe(200);
        return response.data;
      };

      beforeAll(async () => {
        const container = getContainer();

        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;

        a = await registerTenant("acme", "Acme");
      });

      it("counts an order once however many versions its summary has", async () => {
        const order = await placeOrder(a, "two-versions@example.com", [
          { title: "Acme shirt", product_id: "prod_acme_shirt", quantity: 2, unit_price: 10 },
          { title: "Acme cap", product_id: "prod_acme_cap", quantity: 1, unit_price: 5 },
        ]);

        const before = await summaryOf(a);
        expect(before.current).toMatchObject({ order_count: 1, revenue: 25 });

        await addSecondVersion(order.id);

        const after = await summaryOf(a);
        // The number that used to double, and the two that are derived from it.
        expect(after.current).toMatchObject({ order_count: 1, revenue: 25, aov: 25 });
        expect(after.canceled).toEqual({ order_count: 0, revenue: 0 });

        // `order_item` is versioned too, so «Топ товаров» doubled with it.
        const byTitle = Object.fromEntries(
          (after.top_products as { title: string; quantity: number; revenue: number }[]).map(
            (row) => [row.title, row],
          ),
        );
        expect(byTitle["Acme shirt"]).toMatchObject({ quantity: 2, revenue: 20 });
        expect(byTitle["Acme cap"]).toMatchObject({ quantity: 1, revenue: 5 });

        // And the day of that order carries the same single count.
        const daily = (after.daily as { revenue: number; order_count: number }[]).reduce(
          (sum, day) => ({
            revenue: sum.revenue + day.revenue,
            order_count: sum.order_count + day.order_count,
          }),
          { revenue: 0, order_count: 0 },
        );
        expect(daily).toEqual({ revenue: 25, order_count: 1 });
      });

      it("keeps a canceled order out of revenue and reports it apart", async () => {
        const live = await placeOrder(a, "live@example.com", [
          { title: "Acme shirt", product_id: "prod_acme_shirt", quantity: 1, unit_price: 40 },
        ]);
        const canceled = await placeOrder(a, "canceled@example.com", [
          { title: "Acme cap", product_id: "prod_acme_cap", quantity: 1, unit_price: 15 },
        ]);

        await cancelOrderWorkflow(getContainer()).run({ input: { order_id: canceled.id } });

        const summary = await summaryOf(a);

        expect(summary.current).toMatchObject({ order_count: 1, revenue: 40, aov: 40 });
        expect(summary.canceled).toEqual({ order_count: 1, revenue: 15 });

        // The live order is the only one in the top list.
        expect(summary.top_products).toHaveLength(1);
        expect(summary.top_products[0]).toMatchObject({ title: "Acme shirt", quantity: 1 });

        // Cancelling bumps the version, so this also proves the dedup on a row
        // Medusa itself versioned, not only on the fixture above.
        expect(live.id).not.toBe(canceled.id);
      });

      it("counts a customer's orders once and names the canceled ones apart", async () => {
        const kept = await placeOrder(a, "buyer@example.com", [
          { title: "Acme shirt", product_id: "prod_acme_shirt", quantity: 2, unit_price: 10 },
          { title: "Acme cap", product_id: "prod_acme_cap", quantity: 1, unit_price: 5 },
        ]);
        const dropped = await placeOrder(a, "buyer@example.com", [
          { title: "Acme cap", product_id: "prod_acme_cap", quantity: 1, unit_price: 7 },
        ]);

        await addSecondVersion(kept.id);
        await cancelOrderWorkflow(getContainer()).run({ input: { order_id: dropped.id } });

        const response = await api.get("/tenants/customers?limit=50", bearer(a.token));
        expect(response.status).toBe(200);

        const row = (
          response.data.customers as {
            email: string;
            orders_count: number;
            canceled_orders_count: number;
            total_spent: number;
          }[]
        ).find((customer) => customer.email === "buyer@example.com");

        expect(row).toBeDefined();
        expect(row).toMatchObject({
          orders_count: 1,
          canceled_orders_count: 1,
          total_spent: 25,
        });
      });
    });
  },
});
