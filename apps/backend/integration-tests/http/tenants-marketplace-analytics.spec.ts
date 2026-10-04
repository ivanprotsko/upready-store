import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";

jest.setTimeout(240_000);

/**
 * `GET /tenants/marketplaces/:marketplace/analytics` — «Wildberries →
 * Аналитика» (mp-section-design task-06).
 *
 * NOTHING HERE TALKS TO A MARKETPLACE. The rows are seeded straight into
 * `mp_order` / `mp_order_line` / `mp_offer` / `mp_product` through the module
 * service, the way the projector would have written them, and no tenant in
 * this suite has a key (Ivan's standing order of 2026-09-16 02:46 WITA).
 *
 * What it proves, each with a request:
 *
 * - a period with orders: the totals, the days and the cards of ONE shop and
 *   ONE marketplace, cancellations apart, the days all present;
 * - a period without orders: zeros as measured, no average, no card;
 * - another tenant sees only its own order, and the shop without a key is
 *   told `missing` with the rating saying why it is absent;
 * - search, sort and page of the card table; 400 on a broken day, 404 on an
 *   unknown marketplace;
 * - opening the screen writes nothing to the marketplace journal.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";
const DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` moved by `count` days on the calendar alone. */
const shift = (day: string, count: number) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the analytics of one marketplace", () => {
      let a: Registered;
      let b: Registered;

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

      /** One order with one line, as the projector writes them. */
      const seedOrder = async (
        key: string,
        tenantId: string,
        line: { card: string; qty: number; price: number },
        over: Record<string, unknown> = {},
      ) => {
        const now = new Date();
        const marketplace = (over.marketplace as string) ?? "wb";
        const order = (await mp().createMpOrders({
          tenant_id: tenantId,
          marketplace,
          external_id: `ext-${key}`,
          scheme: "FBS",
          status: "complete",
          ordered_at: new Date(now.getTime() - DAY),
          total: line.qty * line.price,
          currency: "RUB",
          is_cancelled: false,
          source_row_id: `src-${key}`,
          synced_at: now,
          ...over,
        } as never)) as unknown as { id: string };
        await mp().createMpOrderLines([
          {
            tenant_id: tenantId,
            marketplace,
            order_id: order.id,
            line_key: `ext-${key}|1`,
            vendor_code: `art-${line.card}`,
            external_id: line.card,
            qty: line.qty,
            price: line.price,
            source_row_id: `src-${key}`,
            synced_at: now,
          },
        ] as never);
      };

      beforeAll(async () => {
        a = await registerTenant("acme-mp-analytics", "Acme Analytics");
        b = await registerTenant("globex-mp-analytics", "Globex Analytics");
      });

      beforeEach(async () => {
        const now = Date.now();
        const synced = new Date();
        // A: three WB sales of two cards, one cancellation, one sale 40 days
        // ago (outside the default period), one Ozon posting.
        await seedOrder("a-1", a.tenant.id, { card: "111", qty: 2, price: 500 });
        await seedOrder("a-2", a.tenant.id, { card: "111", qty: 1, price: 500 }, { ordered_at: new Date(now - 3 * DAY) });
        await seedOrder("a-3", a.tenant.id, { card: "222", qty: 1, price: 300 }, { ordered_at: new Date(now - 5 * DAY) });
        await seedOrder(
          "a-cancel",
          a.tenant.id,
          { card: "222", qty: 1, price: 300 },
          { is_cancelled: true, status: "cancel", ordered_at: new Date(now - 2 * DAY) },
        );
        await seedOrder("a-old", a.tenant.id, { card: "111", qty: 9, price: 500 }, { ordered_at: new Date(now - 40 * DAY) });
        await seedOrder("a-ozon", a.tenant.id, { card: "999", qty: 1, price: 7000 }, { marketplace: "ozon" });
        await mp().createMpProducts([
          {
            tenant_id: a.tenant.id,
            marketplace: "wb",
            external_id: "111",
            vendor_code: "MUM-111",
            title: "Мумиё алтайское",
            photos: [{ tm: "https://example.test/111-tm.jpg", big: "https://example.test/111.jpg" }],
            source_row_id: "src-p-111",
            synced_at: synced,
          },
          {
            tenant_id: a.tenant.id,
            marketplace: "wb",
            external_id: "333",
            vendor_code: "UNSOLD-333",
            title: "Без продаж",
            source_row_id: "src-p-333",
            synced_at: synced,
          },
        ] as never);
        await mp().createMpOffers([
          { size: "0", warehouse: "w1", stock: 4 },
          { size: "0", warehouse: "w2", stock: 2 },
        ].map((one) => ({
          tenant_id: a.tenant.id,
          marketplace: "wb",
          offer_key: `111|${one.size}|${one.warehouse}`,
          external_id: "111",
          warehouse_id: one.warehouse,
          price: 500,
          currency: "RUB",
          stock: one.stock,
          source_row_id: `src-o-${one.warehouse}`,
          synced_at: synced,
        })) as never);
        // B: one WB sale of her own.
        await seedOrder("b-1", b.tenant.id, { card: "777", qty: 1, price: 999 });
      });

      it("folds the period with orders: one shop, one marketplace, every day present", async () => {
        const before = (await mp().listMpApiCalls({})).length;
        const res = await api.get("/tenants/marketplaces/wb/analytics", bearer(a.token));

        expect(res.status).toBe(200);
        expect(res.data.period).toMatchObject({ days: 30, is_default: true, default_days: 30 });
        expect(res.data.by_day).toHaveLength(30);
        expect(res.data.by_day[res.data.by_day.length - 1].day).toBe(res.data.period.to_day);
        expect(res.data.currency).toBe("RUB");
        expect(res.data.totals).toMatchObject({
          revenue: 1800,
          orders: 3,
          units: 4,
          avg_order: 600,
          cancelled_orders: 1,
          cancelled_revenue: 300,
          cards_with_sales: 2,
          cards_total: 2,
          stock_units: 6,
          // 4 items in 30 days, 6 in stock: 45 days.
          stock_days_left: 45,
        });
        expect(res.data.by_day.reduce((sum: number, day: { revenue: number }) => sum + day.revenue, 0)).toBe(1800);

        expect(res.data.cards_count).toBe(2);
        expect(res.data.cards[0]).toMatchObject({
          external_id: "111",
          title: "Мумиё алтайское",
          vendor_code: "MUM-111",
          thumbnail: "https://example.test/111-tm.jpg",
          revenue: 1500,
          units: 3,
          orders: 2,
          abc: "A",
          stock: 6,
          // 3 items in 30 days, 6 in stock: 60 days.
          days_to_zero: 60,
        });
        expect(res.data.cards[0].id).toMatch(/^mpprod_/);
        expect(res.data.cards[1]).toMatchObject({ id: "wb:222", external_id: "222", title: null, stock: null, days_to_zero: null });

        // No key in this suite: the banner and the rating both say so.
        expect(res.data.connection).toMatchObject({ marketplace: "wb", connected: false, notice: "missing", rows_in_period: 3 });
        expect(res.data.rating).toMatchObject({ value: null, state: "no_key" });

        // Opening the screen asked no marketplace anything.
        expect((await mp().listMpApiCalls({})).length).toBe(before);
      });

      it("answers a period without orders with measured zeros and no average", async () => {
        const base = await api.get("/tenants/marketplaces/wb/analytics", bearer(a.token));
        const to = shift(base.data.period.to_day, -50);
        const from = shift(to, -10);

        const res = await api.get(`/tenants/marketplaces/wb/analytics?from=${from}&to=${to}`, bearer(a.token));

        expect(res.status).toBe(200);
        expect(res.data.period).toMatchObject({ from_day: from, to_day: to, days: 11, is_default: false });
        expect(res.data.by_day).toHaveLength(11);
        expect(res.data.by_day.every((day: { revenue: number; orders: number }) => day.revenue === 0 && day.orders === 0)).toBe(true);
        expect(res.data.totals).toMatchObject({ revenue: 0, orders: 0, units: 0, avg_order: null, cards_with_sales: 0 });
        expect(res.data.cards).toEqual([]);
        expect(res.data.cards_count).toBe(0);
      });

      it("shows another tenant only its own orders", async () => {
        const res = await api.get("/tenants/marketplaces/wb/analytics", bearer(b.token));

        expect(res.status).toBe(200);
        expect(res.data.totals).toMatchObject({ revenue: 999, orders: 1, cards_with_sales: 1, cards_total: 0, stock_units: null });
        expect(res.data.cards.map((card: { external_id: string }) => card.external_id)).toEqual(["777"]);
        // B has no price list: the seller's currency is unknown and not invented.
        expect(res.data.currency).toBeNull();
      });

      it("searches, sorts and pages the card table without changing the totals", async () => {
        const found = await api.get("/tenants/marketplaces/wb/analytics?q=mum", bearer(a.token));
        expect(found.data.cards.map((card: { external_id: string }) => card.external_id)).toEqual(["111"]);
        expect(found.data.cards_count).toBe(1);
        expect(found.data.totals.revenue).toBe(1800);

        const byDays = await api.get("/tenants/marketplaces/wb/analytics?order=days_to_zero&limit=1&offset=1", bearer(a.token));
        // `null` days go last whichever way the column is sorted.
        expect(byDays.data.cards.map((card: { external_id: string }) => card.external_id)).toEqual(["222"]);
        expect(byDays.data).toMatchObject({ cards_count: 2, limit: 1, offset: 1 });
      });

      it("answers a broken day with 400 and an unknown marketplace with 404", async () => {
        const broken = await failed(api.get("/tenants/marketplaces/wb/analytics?from=вчера", bearer(a.token)));
        expect(broken.status).toBe(400);

        const reversed = await failed(
          api.get("/tenants/marketplaces/wb/analytics?from=2026-09-20&to=2026-09-10", bearer(a.token)),
        );
        expect(reversed.status).toBe(400);

        const unknown = await failed(api.get("/tenants/marketplaces/avito/analytics", bearer(a.token)));
        expect(unknown.status).toBe(404);
      });
    });
  },
});
