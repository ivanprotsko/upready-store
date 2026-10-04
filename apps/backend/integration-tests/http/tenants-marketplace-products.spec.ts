import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";

jest.setTimeout(240_000);

/**
 * `GET /tenants/marketplaces/:marketplace/products` and `…/products/:id` —
 * «Wildberries → Товары» (task-02 of mp-section-design).
 *
 * NOTHING HERE TALKS TO A MARKETPLACE. Every card and line is seeded straight
 * into `mp_product` and `mp_offer` through the module service, no key is ever
 * stored, and the only write the suite makes is the manual link of w14
 * (`POST /tenants/marketplaces/catalog/links`) plus its auto-link, both of
 * which write `mp_link` in our database and nothing else.
 *
 * What it proves, each with a request:
 *
 * - a shop sees its own cards only, 20 to a page with the count of all, and a
 *   card of another shop is a 404, not a 403;
 * - `link_state` and `q` narrow the list on the server, and a manual link is
 *   listed as `linked`, `matched_by: manual`, with the `mp_link.id` the panel
 *   unlinks with;
 * - the next auto-link (the projector's own `planLinkWrites`) keeps it manual;
 * - a card whose lines reported no stock is `stock: null`, never 0, on the
 *   list and on the card page alike, and the two agree on price and lines;
 * - an unknown sort field is a 400 that names the fields that exist.
 */

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";
const SKU = "ACME-TEA-1";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: marketplace products", () => {
      let a: Registered;
      let b: Registered;
      let variantId: string;

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

      /** `count` cards of one shop, `nmID` 1000+i, each with two lines (stock 2 + 3, price 100+i). */
      const seedCards = async (tenantId: string, count: number, prefix: string) => {
        const syncedAt = new Date("2026-10-02T14:40:00Z");
        const cards = Array.from({ length: count }, (_, i) => ({
          tenant_id: tenantId,
          marketplace: "wb",
          external_id: String(1000 + i),
          vendor_code: `${prefix}-${i}`,
          title: `${prefix} card ${i}`,
          brand: i % 2 ? "Brand B" : "Brand A",
          category_name: "Чай",
          photos: [{ tm: `https://example.test/${i}/tm.webp`, big: `https://example.test/${i}/big.webp` }],
          attributes: null,
          source_row_id: `src_${prefix}_${i}`,
          synced_at: new Date(syncedAt.getTime() + i * 1000),
        }));
        await mp().createMpProducts(cards);
        await mp().createMpOffers(
          cards.flatMap((card, i) =>
            ["w1", "w2"].map((warehouse, k) => ({
              tenant_id: tenantId,
              marketplace: "wb",
              offer_key: `${card.external_id}||${warehouse}`,
              external_id: card.external_id,
              warehouse_id: warehouse,
              warehouse_name: warehouse,
              price: 200 + i,
              discount_price: 100 + i,
              currency: "RUB",
              stock: k === 0 ? 2 : 3,
              source_row_id: `src_offer_${prefix}_${i}_${k}`,
              synced_at: syncedAt,
            })),
          ),
        );
      };

      beforeAll(async () => {
        await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        a = await registerTenant("acme-mp", "Acme MP");
        b = await registerTenant("globex-mp", "Globex MP");

        const product = await api.post(
          "/tenants/products",
          {
            title: "Acme tea",
            status: "published",
            options: [{ title: "Size", values: ["100 g"] }],
            variants: [
              {
                title: "Acme tea 100 g",
                sku: SKU,
                prices: [{ currency_code: "eur", amount: 10 }],
                manage_inventory: false,
                options: { Size: "100 g" },
              },
            ],
          },
          bearer(a.token),
        );
        expect(product.status).toBe(201);
        variantId = product.data.product.variants[0].id;

        await seedCards(a.tenant.id, 25, "ACME");
        await seedCards(b.tenant.id, 3, "GLOBEX");

        // A's card whose article is the shop's own SKU, and a card with lines that said nothing about stock.
        await mp().createMpProducts([
          {
            tenant_id: a.tenant.id,
            marketplace: "wb",
            external_id: "5000",
            vendor_code: SKU.toLowerCase(),
            title: "Acme tea on WB",
            source_row_id: "src_tea",
            synced_at: new Date("2026-10-01T10:00:00Z"),
          },
          {
            tenant_id: a.tenant.id,
            marketplace: "wb",
            external_id: "6000",
            vendor_code: "NO-STOCK",
            title: "Card without stock",
            source_row_id: "src_nostock",
            synced_at: new Date("2026-10-01T09:00:00Z"),
          },
        ]);
        await mp().createMpOffers(
          ["s1", "s2"].map((size) => ({
            tenant_id: a.tenant.id,
            marketplace: "wb",
            offer_key: `6000|${size}|`,
            external_id: "6000",
            size_external: size,
            price: 500,
            discount_price: 400,
            currency: "RUB",
            stock: null,
            source_row_id: `src_nostock_${size}`,
            synced_at: new Date("2026-10-01T09:00:00Z"),
          })),
        );
      });

      it("pages a shop's own cards and hides another shop's, a foreign card is a 404", async () => {
        const first = await api.get("/tenants/marketplaces/wb/products", bearer(a.token));
        expect(first.status).toBe(200);
        expect(first.data.count).toBe(27);
        expect(first.data.products).toHaveLength(20);
        expect(first.data).toMatchObject({ limit: 20, offset: 0 });
        expect(first.data.sync).toMatchObject({ kind: "cards", cards: 27, last_success_at: null, key_set: false });
        // Both shops hold nmID 1000…1002; the tenant is what tells them apart.
        expect(first.data.products.some((row: { vendor_code: string }) => row.vendor_code.startsWith("GLOBEX"))).toBe(false);

        const second = await api.get("/tenants/marketplaces/wb/products?offset=20", bearer(a.token));
        expect(second.data.products).toHaveLength(7);

        const asB = await api.get("/tenants/marketplaces/wb/products?limit=100", bearer(b.token));
        expect(asB.data.count).toBe(3);
        expect(asB.data.products.map((row: { vendor_code: string }) => row.vendor_code).sort()).toEqual([
          "GLOBEX-0",
          "GLOBEX-1",
          "GLOBEX-2",
        ]);

        const aCard = first.data.products[0];
        const foreign = await failed(api.get(`/tenants/marketplaces/wb/products/${aCard.id}`, bearer(b.token)));
        expect(foreign.status).toBe(404);
        const own = await api.get(`/tenants/marketplaces/wb/products/${aCard.id}`, bearer(a.token));
        expect(own.status).toBe(200);

        const anonymous = await failed(api.get("/tenants/marketplaces/wb/products"));
        expect(anonymous.status).toBe(401);
      });

      it("filters by link state and search on the server, a manual link is listed and survives the auto-link", async () => {
        const choose = await api.get("/tenants/marketplaces/wb/products?link_state=needs_choice", bearer(a.token));
        expect(choose.data.count).toBe(1);
        expect(choose.data.products[0]).toMatchObject({
          external_id: "5000",
          link: { id: null, state: "needs_choice", candidates: 1 },
        });

        const notFound = await api.get(
          "/tenants/marketplaces/wb/products?link_state=not_found&q=acme-1",
          bearer(a.token),
        );
        // ACME-1 and ACME-10…ACME-19: the article search is a substring match.
        expect(notFound.data.count).toBe(11);
        expect(
          notFound.data.products.every(
            (row: { vendor_code: string; link: { state: string } }) =>
              row.link.state === "not_found" && row.vendor_code.startsWith("ACME-1"),
          ),
        ).toBe(true);

        const linked = await api.post(
          "/tenants/marketplaces/catalog/links",
          { marketplace: "wb", external_id: "1003", variant_id: variantId },
          bearer(a.token),
        );
        expect(linked.status).toBe(201);
        expect(linked.data.link.matched_by).toBe("manual");

        const autoLink = await api.post("/tenants/marketplaces/catalog/auto-link", {}, bearer(a.token));
        expect(autoLink.status).toBe(200);

        const listed = await api.get("/tenants/marketplaces/wb/products?link_state=linked", bearer(a.token));
        // The manual link, kept manual, and the SKU card the auto-link has now linked by article.
        expect(listed.data.count).toBe(2);
        const manual = listed.data.products.find((row: { external_id: string }) => row.external_id === "1003");
        expect(manual.link).toEqual({
          id: linked.data.link.id,
          state: "linked",
          product_id: linked.data.link.product_id,
          product_title: "Acme tea",
          variant_id: variantId,
          matched_by: "manual",
          candidates: 0,
        });
        const byArticle = listed.data.products.find((row: { external_id: string }) => row.external_id === "5000");
        expect(byArticle.link).toMatchObject({ state: "linked", matched_by: "vendor_code", candidates: 1 });

        const stored = await mp().listMpLinks({ tenant_id: a.tenant.id, external_id: "1003" });
        expect(stored).toHaveLength(1);
        expect(stored[0].matched_by).toBe("manual");

        const bad = await failed(api.get("/tenants/marketplaces/wb/products?link_state=maybe", bearer(a.token)));
        expect(bad.status).toBe(400);
      });

      it("keeps an unreported stock null on the list and on the card page, and the two agree", async () => {
        const list = await api.get("/tenants/marketplaces/wb/products?q=NO-STOCK", bearer(a.token));
        expect(list.data.count).toBe(1);
        const row = list.data.products[0];
        expect(row).toMatchObject({ stock: null, price: 500, discount_price: 400, offers: 2, currency: "RUB" });

        const card = await api.get(`/tenants/marketplaces/wb/products/${row.id}`, bearer(a.token));
        expect(card.data.product).toMatchObject({ stock: null, price: 500, discount_price: 400 });
        expect(card.data.product.offers).toHaveLength(2);
        expect(card.data.product.offers.every((line: { stock: number | null }) => line.stock === null)).toBe(true);

        const stocked = await api.get("/tenants/marketplaces/wb/products?q=ACME-7&limit=1", bearer(a.token));
        expect(stocked.data.products[0]).toMatchObject({
          stock: 5,
          price: 207,
          discount_price: 107,
          offers: 2,
          thumbnail: "https://example.test/7/tm.webp",
          url: "https://www.wildberries.ru/catalog/1007/detail.aspx",
        });
      });

      it("sorts on the server and refuses a field it does not sort by", async () => {
        const cheapest = await api.get("/tenants/marketplaces/wb/products?order=price&limit=3", bearer(a.token));
        expect(cheapest.data.products.map((row: { discount_price: number }) => row.discount_price)).toEqual([
          100, 101, 102,
        ]);

        const pageTwo = await api.get("/tenants/marketplaces/wb/products?order=-price&offset=20&limit=5", bearer(a.token));
        // NO-STOCK (400) first, then 124 down to 100, and the SKU card with no lines at all (null) last.
        expect(pageTwo.data.products.map((row: { discount_price: number | null }) => row.discount_price)).toEqual([
          105, 104, 103, 102, 101,
        ]);
        const last = await api.get("/tenants/marketplaces/wb/products?order=-price&offset=26", bearer(a.token));
        expect(last.data.products.map((row: { external_id: string; price: number | null }) => [row.external_id, row.price])).toEqual([
          ["5000", null],
        ]);

        const bad = await failed(api.get("/tenants/marketplaces/wb/products?order=-created_at", bearer(a.token)));
        expect(bad.status).toBe(400);
        expect(bad.data.message).toContain("synced_at");
      });
    });
  },
});
