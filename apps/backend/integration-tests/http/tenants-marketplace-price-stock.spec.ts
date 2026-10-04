import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import { priceStockCsvColumns } from "../../src/modules/marketplace/price-stock";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";

jest.setTimeout(240_000);

/**
 * `GET /tenants/marketplaces/:marketplace/price-stock`, `…/export` and
 * `…/lines` — «Wildberries → Цены и остатки» (task-03 of mp-section-design).
 *
 * NOTHING HERE TALKS TO A MARKETPLACE. Cards and lines are seeded straight
 * into `mp_product` and `mp_offer` through the module service, no key is ever
 * stored, and the one write besides the seed is the manual link of w14
 * (`POST /tenants/marketplaces/catalog/links`), which writes `mp_link` in our
 * database and nothing else.
 *
 * What it proves, each with a request:
 *
 * - the table is one row per card of the shop plus one per shop variant no
 *   card is linked to, and «Есть везде» is the card the owner linked;
 * - `state`, `over_threshold` with `price_pct`, `q`, `order` and the page work
 *   on the server, and a threshold or sort the server does not know is a 400;
 * - a stock measured over 45 minutes ago is `stock_stale`, a line that said
 *   nothing about stock is `null` and never 0;
 * - the CSV of the same query has `count` rows, the table's columns, and its
 *   first row is the first row of the list;
 * - the lines of a card add up to the row's stock, another shop's card is a
 *   404, and another shop never sees a row of this one.
 */

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";
const MINUTE = 60_000;

type Row = {
  id: string;
  card_id: string | null;
  external_id: string | null;
  vendor_code: string | null;
  title: string | null;
  state: string;
  shop: { product_id: string; variant_id: string; price: number | null; stock: number | null } | null;
  mp: {
    price: number | null;
    discount_price: number | null;
    stock: number | null;
    reserved: number | null;
    lines: number;
    price_stale: boolean;
    stock_stale: boolean;
    price_measured_at: string | null;
    stock_measured_at: string | null;
  } | null;
  diff: { price_abs: number | null; price_pct: number | null; stock_abs: number | null; highlighted: boolean };
  currency: string | null;
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: marketplace prices and stocks", () => {
      let a: Registered;
      let b: Registered;
      const variants: Record<string, string> = {};

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);
      const mp = () => getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
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

      const createProduct = async (token: string, title: string, sku: string | null, rub: number) => {
        const product = await api.post(
          "/tenants/products",
          {
            title,
            status: "published",
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title,
                ...(sku ? { sku } : {}),
                prices: [{ currency_code: "rub", amount: rub }],
                manage_inventory: false,
                options: { Size: "One" },
              },
            ],
          },
          bearer(token),
        );
        expect(product.status).toBe(201);
        return product.data.product.variants[0].id as string;
      };

      const offer = (tenantId: string, externalId: string, warehouse: string | null, over: Record<string, unknown> = {}) => ({
        tenant_id: tenantId,
        marketplace: "wb",
        offer_key: `${externalId}||${warehouse ?? ""}`,
        external_id: externalId,
        warehouse_id: warehouse,
        warehouse_name: warehouse ? `Склад ${warehouse}` : null,
        price: 1300,
        discount_price: 1240,
        currency: "RUB",
        stock: null,
        measured_at: new Date(),
        source_row_id: `src_${tenantId}_${externalId}_${warehouse ?? "none"}`,
        synced_at: new Date(),
        ...over,
      });

      beforeAll(async () => {
        await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Россия", currency_code: "rub", countries: ["ru"] }] },
        });
        a = await registerTenant("acme-mp-ps", "Acme Price Stock");
        b = await registerTenant("globex-mp-ps", "Globex Price Stock");

        variants.tea = await createProduct(a.token, "Acme tea", "ACME-TEA", 1000);
        variants.honey = await createProduct(a.token, "Acme honey", "ACME-HONEY", 500);
        // A product without an article is still sold by the shop and not on WB.
        variants.propolis = await createProduct(a.token, "Acme propolis", null, 300);

        await mp().createMpProducts([
          { tenant_id: a.tenant.id, marketplace: "wb", external_id: "1001", vendor_code: "ACME-TEA", title: "Acme tea on WB", source_row_id: "src_a_1001", synced_at: new Date() },
          { tenant_id: a.tenant.id, marketplace: "wb", external_id: "1002", vendor_code: "MYS-1", title: "Mystery card", source_row_id: "src_a_1002", synced_at: new Date() },
          { tenant_id: a.tenant.id, marketplace: "wb", external_id: "1003", vendor_code: "OLD-1", title: "Old stock card", source_row_id: "src_a_1003", synced_at: new Date() },
          { tenant_id: b.tenant.id, marketplace: "wb", external_id: "1001", vendor_code: "GLOBEX-1", title: "Globex card", source_row_id: "src_b_1001", synced_at: new Date() },
        ] as never);
        await mp().createMpOffers([
          offer(a.tenant.id, "1001", "w1", { stock: 3, reserved: 1 }),
          offer(a.tenant.id, "1001", "w2", { stock: 4 }),
          // A size the marketplace priced and stocked nowhere: no warehouse, no stock.
          offer(a.tenant.id, "1002", null, { price: 800, discount_price: null }),
          offer(a.tenant.id, "1003", "w1", { stock: 5, measured_at: new Date(Date.now() - 120 * MINUTE) }),
          // A priced nmID whose card the import did not bring: counted, not a row.
          offer(a.tenant.id, "1999", "w1", { stock: 1 }),
          offer(b.tenant.id, "1001", "w9", { stock: 9 }),
        ] as never);

        const linked = await api.post(
          "/tenants/marketplaces/catalog/links",
          { marketplace: "wb", external_id: "1001", variant_id: variants.tea },
          bearer(a.token),
        );
        expect([200, 201]).toContain(linked.status);
      });

      it("one row per card and per unlinked shop variant, «Есть везде» is the linked card", async () => {
        const res = await api.get("/tenants/marketplaces/wb/price-stock", bearer(a.token));

        expect(res.status).toBe(200);
        expect(res.data.count).toBe(5);
        expect(res.data).toMatchObject({
          limit: 20,
          offset: 0,
          thresholds: { price_pct: 10, stock_abs: 1 },
          counts: { both: 1, marketplace_only: 2, shop_only: 2, over_threshold: 1 },
          stored: { cards: 3, lines: 5, variants: 3, offers_without_card: 1 },
        });
        expect(res.data.measured.prices_at).not.toBeNull();
        expect(res.data.measured.stocks_at).not.toBeNull();

        const rows = res.data.rows as Row[];
        // Default order: the highlighted row first, then by state.
        expect(rows.map((row) => row.state)).toEqual(["both", "marketplace_only", "marketplace_only", "shop_only", "shop_only"]);

        const tea = rows[0];
        expect(tea).toMatchObject({
          external_id: "1001",
          vendor_code: "ACME-TEA",
          state: "both",
          currency: "RUB",
          shop: { variant_id: variants.tea, price: 1000, stock: null },
          mp: { price: 1300, discount_price: 1240, stock: 7, reserved: 1, lines: 2, stock_stale: false, price_stale: false },
          diff: { price_abs: 240, price_pct: 24, stock_abs: null, highlighted: true },
        });

        const mystery = rows.find((row) => row.external_id === "1002") as Row;
        // The line said nothing about stock: null, never 0.
        expect(mystery.mp).toMatchObject({ stock: null, price: 800, discount_price: null, stock_stale: false });

        const old = rows.find((row) => row.external_id === "1003") as Row;
        expect(old.mp?.stock_stale).toBe(true);

        const shopOnly = rows.filter((row) => row.state === "shop_only");
        expect(shopOnly.map((row) => row.vendor_code).sort((x, y) => String(x).localeCompare(String(y)))).toEqual([
          "ACME-HONEY",
          null,
        ]);
        expect(shopOnly.every((row) => row.mp === null && row.card_id === null)).toBe(true);
        expect(rows.some((row) => row.external_id === "1999")).toBe(false);
      });

      it("filters, thresholds, search, order and pages on the server", async () => {
        const both = await api.get("/tenants/marketplaces/wb/price-stock?state=both", bearer(a.token));
        expect(both.data.count).toBe(1);

        const over20 = await api.get("/tenants/marketplaces/wb/price-stock?over_threshold=true&price_pct=20", bearer(a.token));
        expect(over20.data.count).toBe(1);
        expect(over20.data.thresholds).toEqual({ price_pct: 20, stock_abs: 1 });
        expect((over20.data.rows as Row[]).every((row) => row.state === "both")).toBe(true);

        const over30 = await api.get("/tenants/marketplaces/wb/price-stock?over_threshold=true&price_pct=30", bearer(a.token));
        expect(over30.data.count).toBe(0);
        // The counts are of the whole table, whatever the filter.
        expect(over30.data.counts).toMatchObject({ both: 1, over_threshold: 0 });

        const search = await api.get("/tenants/marketplaces/wb/price-stock?q=acme", bearer(a.token));
        expect((search.data.rows as Row[]).map((row) => row.title).sort()).toEqual([
          "Acme honey",
          "Acme propolis",
          "Acme tea on WB",
        ]);

        const byGap = await api.get("/tenants/marketplaces/wb/price-stock?order=-price_pct", bearer(a.token));
        expect((byGap.data.rows as Row[])[0].external_id).toBe("1001");

        const page = await api.get("/tenants/marketplaces/wb/price-stock?limit=2&offset=4", bearer(a.token));
        expect(page.data).toMatchObject({ count: 5, limit: 2, offset: 4 });
        expect(page.data.rows).toHaveLength(1);

        for (const bad of ["order=price", "state=linked", "price_pct=-1", "stock_abs=1.5", "over_threshold=yes"]) {
          const res = await failed(api.get(`/tenants/marketplaces/wb/price-stock?${bad}`, bearer(a.token)));
          expect(res.status).toBe(400);
        }
      });

      it("the CSV of the same query has `count` rows, the table's columns, and the list's first row", async () => {
        const search = "state=both,marketplace_only&order=-price_pct";
        const list = await api.get(`/tenants/marketplaces/wb/price-stock?${search}&limit=200`, bearer(a.token));
        const csv = await api.get(`/tenants/marketplaces/wb/price-stock/export?${search}`, {
          ...bearer(a.token),
          // Bytes, not text: axios decodes text with the BOM stripped, and the BOM is what is under test.
          responseType: "arraybuffer",
        });

        expect(csv.status).toBe(200);
        expect(csv.headers["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
        expect(csv.headers["x-rows"]).toBe(String(list.data.count));
        expect(csv.headers["x-total-count"]).toBe(String(list.data.count));

        const bytes = Buffer.from(csv.data);
        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        const body = bytes.toString("utf8");
        expect(body.startsWith("\uFEFF")).toBe(true);
        const lines = body.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
        expect(lines).toHaveLength(list.data.count + 1);
        expect(lines[0]).toBe(priceStockCsvColumns("Wildberries").join(";"));

        const first = list.data.rows[0] as Row;
        const cells = lines[1].split(";");
        expect(cells.slice(0, 15)).toEqual([
          first.title,
          first.vendor_code,
          "1000",
          "1240",
          "1300",
          "240",
          "24",
          "RUB",
          "",
          "7",
          "",
          "Есть везде",
          first.mp?.stock_measured_at,
          "нет",
          "да",
        ]);
        expect(cells[15]).toBe("1001");
      });

      it("the lines of a card add up to the row, another shop's card is a 404", async () => {
        const res = await api.get("/tenants/marketplaces/wb/price-stock/lines?external_id=1001", bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.data.lines).toHaveLength(2);
        expect(res.data.lines.map((line: { warehouse: string }) => line.warehouse).sort()).toEqual(["Склад w1", "Склад w2"]);
        expect(res.data.lines.reduce((sum: number, line: { stock: number | null }) => sum + (line.stock ?? 0), 0)).toBe(7);

        const silent = await api.get("/tenants/marketplaces/wb/price-stock/lines?external_id=1002", bearer(a.token));
        expect(silent.data.lines).toEqual([
          expect.objectContaining({ warehouse: null, stock: null, price: 800 }),
        ]);

        const foreign = await failed(api.get("/tenants/marketplaces/wb/price-stock/lines?external_id=1003", bearer(b.token)));
        expect(foreign.status).toBe(404);

        const missing = await failed(api.get("/tenants/marketplaces/wb/price-stock/lines", bearer(a.token)));
        expect(missing.status).toBe(400);
      });

      it("another shop sees its own rows only, an unknown marketplace is a 404, no token is a 401", async () => {
        const asB = await api.get("/tenants/marketplaces/wb/price-stock", bearer(b.token));
        expect(asB.data.count).toBe(1);
        expect(asB.data.rows[0]).toMatchObject({ external_id: "1001", vendor_code: "GLOBEX-1", state: "marketplace_only" });
        expect(asB.data.rows[0].mp.stock).toBe(9);

        const ownLines = await api.get("/tenants/marketplaces/wb/price-stock/lines?external_id=1001", bearer(b.token));
        expect(ownLines.data.lines).toHaveLength(1);

        const unknown = await failed(api.get("/tenants/marketplaces/megamarket/price-stock", bearer(a.token)));
        expect(unknown.status).toBe(404);

        const anonymous = await failed(api.get("/tenants/marketplaces/wb/price-stock"));
        expect(anonymous.status).toBe(401);
      });
    });
  },
});
