import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { createOrdersWorkflow, createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import linkOrphanOrdersScript from "../../src/scripts/link-orphan-orders";

jest.setTimeout(180_000);

/**
 * Seam test of the orphan-order convergence (review-2026-09-21 T-1, audit
 * 46df A-05).
 *
 * `createOrdersWorkflow` emits no `order.placed` (only `completeCartWorkflow`
 * and the draft-order conversion do, `@medusajs/core-flows` 2.19.0), so an
 * order made with it is exactly the order whose subscriber never ran: it sits
 * in the shop's sales channel with no tenant-order link, and the owner's
 * `GET /tenants/orders` does not list it. The script has to make it appear,
 * and a second run has to find nothing.
 *
 * Runner facts, the same as the other specs here: the database is restored
 * from its post-`beforeAll` snapshot before every test, and `DB_HOST` has to
 * be the literal `localhost`.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; sales_channel: { id: string } };
};

const PASSWORD = "supersecret-owner";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("link-orphan-orders: an order the subscriber missed reaches its shop", () => {
      let regionId: string;
      let a: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

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

      /** An order in `salesChannelId`, with no subscriber run and so no tenant link. */
      const placeUnlinkedOrder = async (salesChannelId: string, title: string) => {
        const { result: order } = await createOrdersWorkflow(getContainer()).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "buyer@example.com",
            sales_channel_id: salesChannelId,
            items: [{ title, quantity: 1, unit_price: 10 }],
          },
        });
        return order;
      };

      const listedFor = async (owner: Registered) => {
        const listed = await api.get("/tenants/orders?fields=id&limit=50", bearer(owner.token));
        expect(listed.status).toBe(200);
        return listed.data.orders.map((o: { id: string }) => o.id) as string[];
      };

      const runScript = (args: string[] = []) =>
        linkOrphanOrdersScript({ container: getContainer(), args } as any);

      beforeAll(async () => {
        const {
          result: [region],
        } = await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;
        a = await registerTenant("acme", "Acme");
      });

      it("counts, links, and finds nothing on the second run", async () => {
        const order = await placeUnlinkedOrder(a.tenant.sales_channel.id, "Acme shirt");
        expect(await listedFor(a)).not.toContain(order.id);

        const counted = await runScript(["dry-run"]);
        expect(counted).toEqual({ checked: 1, orphans: 1, linked: 0, failed: [] });
        expect(await listedFor(a)).not.toContain(order.id);

        const first = await runScript();
        expect(first).toEqual({ checked: 1, orphans: 1, linked: 1, failed: [] });
        expect(await listedFor(a)).toEqual([order.id]);

        const second = await runScript();
        expect(second).toEqual({ checked: 1, orphans: 0, linked: 0, failed: [] });
      });

      it("leaves an order in a sales channel no shop owns alone", async () => {
        const salesChannelModule = getContainer().resolve(Modules.SALES_CHANNEL);
        const [unowned] = await salesChannelModule.createSalesChannels([{ name: "Nobody's channel" }]);
        await placeUnlinkedOrder(unowned.id, "Seed mug");

        const summary = await runScript();
        expect(summary).toEqual({ checked: 0, orphans: 0, linked: 0, failed: [] });
        expect(await listedFor(a)).toEqual([]);
      });
    });
  },
});
