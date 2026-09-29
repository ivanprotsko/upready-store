import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

jest.setTimeout(180_000);

/**
 * t-2026-09-24-n12, step 3 of `docs/multitenancy/sites-one-db-many-storefronts.md`:
 * one catalogue for the sites of a client. The owner keeps the product, the
 * other sites of the group READ it, and `site_scope` on the product save
 * decides which sites' sales channels it sits in, which is all the storefront
 * and the cart look at.
 *
 * Layout, built once in `beforeAll` (the database is restored to that
 * snapshot before every `it`):
 * - group 1 = site A + site B;
 * - group 2 = site D + site E;
 * - site C has no group.
 */
const PASSWORD = "supersecret-owner";

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

const productBody = (title: string) => ({
  title,
  status: "published",
  options: [{ title: "Color", values: ["Blue"] }],
  variants: [
    {
      title,
      prices: [{ currency_code: "eur", amount: 10 }],
      manage_inventory: false,
      options: { Color: "Blue" },
    },
  ],
});

type Site = {
  token: string;
  tenant: { id: string; sales_channel: { id: string } };
  publishableKey: { token: string };
};

type ListedProduct = { id: string; owned?: boolean; site_scope?: unknown };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: shared catalogue of one client (site_scope)", () => {
      let regionId: string;
      let a: Site;
      let b: Site;
      let c: Site;
      let d: Site;
      let e: Site;

      const registerSite = async (handle: string): Promise<Site> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name: handle, handle, admin: { email, first_name: handle } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { token: login.data.token, tenant: created.data.tenant, publishableKey: created.data.tenant.api_key };
      };

      const storeKey = (site: Site) => ({ headers: { "x-publishable-api-key": site.publishableKey.token } });

      const createProduct = async (site: Site, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(site.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string; variants: { id: string }[] };
      };

      const setScope = (site: Site, productId: string, siteScope: unknown) =>
        api
          .post(`/tenants/products/${productId}`, { site_scope: siteScope }, bearer(site.token))
          .catch((error) => error.response);

      const listed = async (site: Site): Promise<ListedProduct[]> => {
        const response = await api.get("/tenants/products?fields=id,title", bearer(site.token));
        expect(response.status).toBe(200);
        return response.data.products;
      };

      const addToCart = async (site: Site, variantId: string) => {
        const cart = await api.post("/store/carts", { region_id: regionId }, storeKey(site));
        expect(cart.status).toBe(200);
        return api
          .post(`/store/carts/${cart.data.cart.id}/line-items`, { variant_id: variantId, quantity: 1 }, storeKey(site))
          .catch((error) => error.response);
      };

      const storeProduct = (site: Site, productId: string) =>
        api.get(`/store/products/${productId}`, storeKey(site)).catch((error) => error.response);

      beforeAll(async () => {
        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;

        a = await registerSite("w12-cat-a");
        b = await registerSite("w12-cat-b");
        c = await registerSite("w12-cat-c");
        d = await registerSite("w12-cat-d");
        e = await registerSite("w12-cat-e");

        const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
        const [group1, group2] = await tenantModuleService.createTenantGroups([
          { name: "w12 catalogue client 1" },
          { name: "w12 catalogue client 2" },
        ]);
        await tenantModuleService.updateTenants([
          { id: a.tenant.id, group_id: group1.id },
          { id: b.tenant.id, group_id: group1.id },
          { id: d.tenant.id, group_id: group2.id },
          { id: e.tenant.id, group_id: group2.id },
        ]);
      });

      it("another site of the group reads the product; another group and a single shop do not", async () => {
        const product = await createProduct(a, "W12 shared shirt");

        const asA = (await listed(a)).find((p) => p.id === product.id);
        expect(asA).toMatchObject({ owned: true, site_scope: { tenant_ids: [a.tenant.id] } });

        const asB = (await listed(b)).find((p) => p.id === product.id);
        expect(asB).toMatchObject({ owned: false, site_scope: { tenant_ids: [a.tenant.id] } });

        expect((await listed(c)).map((p) => p.id)).not.toContain(product.id);
        expect((await listed(d)).map((p) => p.id)).not.toContain(product.id);

        const readByB = await api.get(`/tenants/products/${product.id}`, bearer(b.token));
        expect(readByB.status).toBe(200);
        expect(readByB.data.product.owned).toBe(false);

        // The product page's own sub-reads work for the other site too.
        for (const path of ["variants", "options", "attributes", `variants/${product.variants[0].id}`]) {
          const sub = await api
            .get(`/tenants/products/${product.id}/${path}`, bearer(b.token))
            .catch((error) => error.response);
          expect([path, sub.status]).toEqual([path, 200]);
        }

        for (const outsider of [c, d]) {
          for (const path of ["", "/variants", "/options", "/attributes"]) {
            const response = await api
              .get(`/tenants/products/${product.id}${path}`, bearer(outsider.token))
              .catch((error) => error.response);
            expect([path, response.status]).toEqual([path, 404]);
          }
        }
      });

      it("a shop without a group sees its list exactly as before: no site fields", async () => {
        const product = await createProduct(c, "W12 single-shop mug");
        const [only] = await listed(c);
        expect(only.id).toBe(product.id);
        expect(only).not.toHaveProperty("site_scope");
        expect(only).not.toHaveProperty("owned");
      });

      it("only the owner writes: another site of the group gets 404 on update, delete and site_scope", async () => {
        const product = await createProduct(a, "W12 owner-only shirt");

        const update = await api
          .post(`/tenants/products/${product.id}`, { title: "hijacked" }, bearer(b.token))
          .catch((error) => error.response);
        expect(update.status).toBe(404);

        const scope = await setScope(b, product.id, "all");
        expect(scope.status).toBe(404);

        const removal = await api
          .delete(`/tenants/products/${product.id}`, bearer(b.token))
          .catch((error) => error.response);
        expect(removal.status).toBe(404);

        const variants = await api
          .post(`/tenants/products/${product.id}/variants`, productBody("x").variants[0], bearer(b.token))
          .catch((error) => error.response);
        expect(variants.status).toBe(404);
      });

      it("a product scoped to site A is neither shown nor purchasable on site B", async () => {
        const product = await createProduct(a, "W12 site-A-only shirt");
        const scoped = await setScope(a, product.id, { tenant_ids: [a.tenant.id] });
        expect(scoped.status).toBe(200);
        expect(scoped.data.product.site_scope).toEqual({ tenant_ids: [a.tenant.id] });

        expect((await storeProduct(a, product.id)).status).toBe(200);
        expect((await storeProduct(b, product.id)).status).toBe(404);

        expect((await addToCart(a, product.variants[0].id)).status).toBe(200);
        expect((await addToCart(b, product.variants[0].id)).status).toBe(400);
      });

      it("'all' puts the product on every site of the group, and a later edit keeps it there", async () => {
        const product = await createProduct(a, "W12 everywhere shirt");
        const scoped = await setScope(a, product.id, "all");
        expect(scoped.status).toBe(200);
        expect(scoped.data.product.site_scope).toBe("all");

        expect((await storeProduct(b, product.id)).status).toBe(200);
        expect((await addToCart(b, product.variants[0].id)).status).toBe(200);

        // Another client's storefront still does not have it.
        expect((await storeProduct(d, product.id)).status).toBe(404);
        expect((await addToCart(d, product.variants[0].id)).status).toBe(400);

        const edited = await api.post(`/tenants/products/${product.id}`, { title: "Renamed" }, bearer(a.token));
        expect(edited.status).toBe(200);
        expect(edited.data.product.site_scope).toBe("all");
        expect((await storeProduct(b, product.id)).status).toBe(200);
      });

      it("a product can be shown on the other site only", async () => {
        const product = await createProduct(a, "W12 site-B-only shirt");
        const scoped = await setScope(a, product.id, { tenant_ids: [b.tenant.id] });
        expect(scoped.status).toBe(200);

        expect((await storeProduct(a, product.id)).status).toBe(404);
        expect((await storeProduct(b, product.id)).status).toBe(200);
      });

      it("refuses a site outside the group, from a grouped and from a single shop", async () => {
        const product = await createProduct(a, "W12 guarded shirt");
        expect((await setScope(a, product.id, { tenant_ids: [d.tenant.id] })).status).toBe(400);
        expect((await setScope(a, product.id, { tenant_ids: [] })).status).toBe(400);

        const single = await createProduct(c, "W12 single guarded mug");
        expect((await setScope(c, single.id, { tenant_ids: [a.tenant.id] })).status).toBe(400);

        const own = await setScope(c, single.id, "all");
        expect(own.status).toBe(200);
        expect(own.data.product.sales_channels.map((sc: { id: string }) => sc.id)).toEqual([
          c.tenant.sales_channel.id,
        ]);
      });
    });
  },
});
