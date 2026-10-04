import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";

jest.setTimeout(240_000);

/**
 * `GET /tenants/marketplaces/:marketplace/orders`, `…/orders/export` and
 * `…/orders/:id` — «Wildberries → Заказы» (mp-section-design task-04).
 *
 * NOTHING HERE TALKS TO A MARKETPLACE. The rows are seeded straight into
 * `mp_order` / `mp_order_line` / `mp_order_status_event` through the module
 * service, the way the projector would have written them, and no tenant in
 * this suite has a key, so no import can start (Ivan's standing order of
 * 2026-09-16 02:46 WITA: read only, and not even a read from a test).
 *
 * What it proves, each with a request and not by reading code:
 *
 * - the list is ONE shop's orders of ONE marketplace: another tenant's rows
 *   and the other marketplace's rows never appear, and the count says so;
 * - the facets are counted before the filters, the undated order is counted
 *   and listed last, and the shop without a key is told `missing`;
 * - `status` + `ordered_at` narrow the list, and the CSV of the same query has
 *   exactly `count` rows under its header, `;`-separated;
 * - the card of a foreign order is a 404, the same as a missing one, whether
 *   the id belongs to another tenant or to the other marketplace.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";

const DAY = 24 * 60 * 60 * 1000;

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the orders of one marketplace", () => {
      let a: Registered;
      let b: Registered;
      const ids: Record<string, string> = {};

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

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

      const mp = () => getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

      /** One order with one line and one observed status, as the projector writes them. */
      const seedOrder = async (
        key: string,
        tenantId: string,
        over: Record<string, unknown> = {},
      ): Promise<string> => {
        const now = new Date();
        const marketplace = (over.marketplace as string) ?? "wb";
        const order = (await mp().createMpOrders(
          {
            tenant_id: tenantId,
            marketplace,
            external_id: `ext-${key}`,
            scheme: "FBS",
            status: "complete",
            status_detail: "sold",
            ordered_at: new Date(now.getTime() - DAY),
            buyer_region: "Московская область",
            warehouse_name: "Коледино",
            total: 1290,
            currency: "RUB",
            is_cancelled: false,
            source_row_id: `src-${key}`,
            synced_at: now,
            ...over,
          } as never,
        )) as unknown as { id: string };
        const orderId = order.id;
        await mp().createMpOrderLines([
          {
            tenant_id: tenantId,
            marketplace,
            order_id: orderId,
            line_key: `ext-${key}|1`,
            vendor_code: `art-${key}`,
            external_id: `nm-${key}`,
            qty: 1,
            price: 1290,
            source_row_id: `src-${key}`,
            synced_at: now,
          },
        ] as never);
        await mp().createMpOrderStatusEvents([
          {
            tenant_id: tenantId,
            marketplace,
            order_id: orderId,
            event_key: `${orderId}|${now.toISOString()}`,
            status: (over.status as string | null | undefined) ?? "complete",
            status_detail: (over.status_detail as string | null | undefined) ?? "sold",
            observed_at: now,
          },
        ] as never);
        ids[key] = orderId;
        return orderId;
      };

      beforeAll(async () => {
        a = await registerTenant("acme-mp-orders", "Acme Orders");
        b = await registerTenant("globex-mp-orders", "Globex Orders");
      });

      beforeEach(async () => {
        const now = Date.now();
        // A: four WB orders (sold, cancelled two days ago, cancelled 40 days
        // ago, one with no date and no scheme), one Ozon posting.
        await seedOrder("a-sold", a.tenant.id);
        await seedOrder("a-cancel-new", a.tenant.id, {
          status: "cancel",
          status_detail: "canceled",
          is_cancelled: true,
          ordered_at: new Date(now - 2 * DAY),
          buyer_region: "Санкт-Петербург",
        });
        await seedOrder("a-cancel-old", a.tenant.id, {
          status: "cancel",
          status_detail: "canceled",
          is_cancelled: true,
          ordered_at: new Date(now - 40 * DAY),
        });
        await seedOrder("a-undated", a.tenant.id, {
          scheme: null,
          status: null,
          status_detail: null,
          ordered_at: null,
        });
        await seedOrder("a-ozon", a.tenant.id, { marketplace: "ozon", status: "delivered", status_detail: null });
        // B: one WB order of her own.
        await seedOrder("b-sold", b.tenant.id);
      });

      it("lists one shop's orders of one marketplace, facets before filters, undated last", async () => {
        const res = await api.get("/tenants/marketplaces/wb/orders?limit=20&offset=0", bearer(a.token));

        expect(res.status).toBe(200);
        expect(res.data.count).toBe(4);
        expect(res.data.orders.map((row: { id: string }) => row.id)).toEqual([
          ids["a-sold"],
          ids["a-cancel-new"],
          ids["a-cancel-old"],
          ids["a-undated"],
        ]);
        expect(res.data.orders.every((row: { source: string }) => row.source === "wb")).toBe(true);
        expect(res.data.orders[0].lines_count).toBe(1);
        expect(res.data.undated).toBe(1);
        expect(res.data.facets.statuses).toEqual([
          { value: "delivered", label: "Доставлен", count: 1 },
          { value: "cancelled", label: "Отменён", count: 2 },
          { value: "unspecified", label: "Статус площадка не присылает", count: 1 },
        ]);
        expect(res.data.facets.schemes).toEqual([
          { value: "FBS", label: "FBS", count: 3 },
          { value: "none", label: "Без схемы", count: 1 },
        ]);
        // No key saved in this suite: the screen must say so rather than read as «нет заказов».
        expect(res.data.connection).toMatchObject({
          marketplace: "wb",
          connected: false,
          notice: "missing",
          rows_in_period: 4,
        });
      });

      it("narrows by status and date, and the CSV of the same query has exactly `count` rows", async () => {
        const since = new Date(Date.now() - 7 * DAY).toISOString();
        const search = `status=cancelled&ordered_at=${encodeURIComponent(JSON.stringify({ $gte: since }))}`;

        const list = await api.get(`/tenants/marketplaces/wb/orders?${search}`, bearer(a.token));
        expect(list.status).toBe(200);
        expect(list.data.count).toBe(1);
        expect(list.data.orders[0].id).toBe(ids["a-cancel-new"]);
        // Facets stay counted over every order, whatever the filter.
        expect(list.data.facets.statuses.find((f: { value: string }) => f.value === "cancelled").count).toBe(2);

        const file = await api.get(`/tenants/marketplaces/wb/orders/export?${search}`, bearer(a.token));
        expect(file.status).toBe(200);
        expect(String(file.headers["content-type"])).toContain("text/csv");
        const lines = String(file.data).replace(/^﻿/, "").trimEnd().split("\r\n");
        expect(lines).toHaveLength(list.data.count + 1);
        expect(lines[0].split(";")[0]).toBe("Номер");
        expect(lines[1].split(";")[0]).toBe("ext-a-cancel-new");

        const all = await api.get("/tenants/marketplaces/wb/orders/export", bearer(a.token));
        expect(String(all.data).trimEnd().split("\r\n")).toHaveLength(4 + 1);
      });

      it("searches by number and by region", async () => {
        const byNumber = await api.get("/tenants/marketplaces/wb/orders?q=A-UNDATED", bearer(a.token));
        expect(byNumber.data.orders.map((row: { id: string }) => row.id)).toEqual([ids["a-undated"]]);

        const byRegion = await api.get(
          `/tenants/marketplaces/wb/orders?q=${encodeURIComponent("петербург")}`,
          bearer(a.token),
        );
        expect(byRegion.data.orders.map((row: { id: string }) => row.id)).toEqual([ids["a-cancel-new"]]);
      });

      it("answers a broken date filter with 400 and an unknown marketplace with 404", async () => {
        const broken = await failed(
          api.get("/tenants/marketplaces/wb/orders?ordered_at=%7Bnot-json", bearer(a.token)),
        );
        expect(broken.status).toBe(400);

        const unknown = await failed(api.get("/tenants/marketplaces/avito/orders", bearer(a.token)));
        expect(unknown.status).toBe(404);
      });

      it("opens the card of an own order, and 404s a foreign one", async () => {
        const own = await api.get(`/tenants/marketplaces/wb/orders/${ids["a-sold"]}`, bearer(a.token));
        expect(own.status).toBe(200);
        expect(own.data.order).toMatchObject({ id: ids["a-sold"], number: "ext-a-sold", status_key: "delivered" });
        expect(own.data.lines).toHaveLength(1);
        expect(own.data.lines[0]).toMatchObject({ vendor_code: "art-a-sold", product: null });
        expect(own.data.status_history).toHaveLength(1);

        // Another tenant's order: the same 404 as a missing one.
        const foreign = await failed(
          api.get(`/tenants/marketplaces/wb/orders/${ids["b-sold"]}`, bearer(a.token)),
        );
        expect(foreign.status).toBe(404);

        // Her own Ozon posting asked under Wildberries: not this list's order.
        const otherMarketplace = await failed(
          api.get(`/tenants/marketplaces/wb/orders/${ids["a-ozon"]}`, bearer(a.token)),
        );
        expect(otherMarketplace.status).toBe(404);

        const missing = await failed(
          api.get("/tenants/marketplaces/wb/orders/mporder_does_not_exist", bearer(a.token)),
        );
        expect(missing.status).toBe(404);
      });

      it("never shows tenant B anything of tenant A", async () => {
        const res = await api.get("/tenants/marketplaces/wb/orders", bearer(b.token));
        expect(res.status).toBe(200);
        expect(res.data.count).toBe(1);
        expect(res.data.orders[0].id).toBe(ids["b-sold"]);
      });
    });
  },
});
