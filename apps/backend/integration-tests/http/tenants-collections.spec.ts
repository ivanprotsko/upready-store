import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow, createCollectionsWorkflow } from "@medusajs/medusa/core-flows";

jest.setTimeout(180_000);

/**
 * Seam test of `GET /store/tenant/collections` (b08-seo-storefront).
 *
 * A product collection carries no sales channel and no owner column, so
 * `/store/collections` answers with every shop's — which is how two tenants
 * came to share 36 `/<locale>/collections/<handle>` paths in their sitemaps
 * while sharing no product, category or page. There is no tenant-collection
 * link to scope by, so the route scopes by the ownership that IS recorded: the
 * collections the tenant's own products sit in.
 *
 * Runner facts, same as the sibling specs: the database is restored from its
 * post-`beforeAll` snapshot before every test, so each test creates the rows it
 * reads, and `DB_HOST` must be the literal `localhost`.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string };
  publishableKey: { id: string; token: string };
};

const PASSWORD = "supersecret";

const productBody = (title: string, collectionId?: string) => ({
  title,
  status: "published",
  ...(collectionId ? { collection_id: collectionId } : {}),
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

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("store: tenant collections", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey.token },
      });

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

        return {
          token: login.data.token,
          tenant: created.data.tenant,
          publishableKey: created.data.tenant.api_key,
        };
      };

      const createCollection = async (title: string, handle: string): Promise<string> => {
        const { result } = await createCollectionsWorkflow(getContainer()).run({
          input: { collections: [{ title, handle }] },
        });
        return (result as Array<{ id: string }>)[0].id;
      };

      const createProduct = async (owner: Registered, title: string, collectionId?: string) => {
        const created = await api.post(
          "/tenants/products",
          productBody(title, collectionId),
          bearer(owner.token),
        );
        expect(created.status).toBe(201);
        return created.data.product as { id: string };
      };

      beforeAll(async () => {
        await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("lists nothing for a shop whose products sit in no collection", async () => {
        await createCollection("Shared", "shared");
        await createProduct(a, "Acme plain shirt");

        const list = await api.get("/store/tenant/collections", storeKey(a));
        expect(list.status).toBe(200);
        expect(list.data.collections).toEqual([]);
        expect(list.data.count).toBe(0);
      });

      it("lists the collection this shop's products sit in, and no other shop's", async () => {
        const acmeCollection = await createCollection("Acme picks", "acme-picks");
        const globexCollection = await createCollection("Globex picks", "globex-picks");

        await createProduct(a, "Acme jacket", acmeCollection);
        await createProduct(b, "Globex jacket", globexCollection);

        const listA = await api.get("/store/tenant/collections", storeKey(a));
        expect(listA.status).toBe(200);
        expect(listA.data.collections.map((c: { handle: string }) => c.handle)).toEqual([
          "acme-picks",
        ]);

        const listB = await api.get("/store/tenant/collections", storeKey(b));
        expect(listB.status).toBe(200);
        expect(listB.data.collections.map((c: { handle: string }) => c.handle)).toEqual([
          "globex-picks",
        ]);
      });

      it("keeps the unscoped route answering with both, which is the defect this one fixes", async () => {
        const acmeCollection = await createCollection("Acme picks", "acme-picks");
        const globexCollection = await createCollection("Globex picks", "globex-picks");

        await createProduct(a, "Acme jacket", acmeCollection);
        await createProduct(b, "Globex jacket", globexCollection);

        const unscoped = await api.get("/store/collections", storeKey(a));
        expect(unscoped.status).toBe(200);
        const handles = unscoped.data.collections.map((c: { handle: string }) => c.handle).sort();
        expect(handles).toEqual(["acme-picks", "globex-picks"]);
      });

      it("shows a collection to BOTH shops when both put a product in it", async () => {
        const shared = await createCollection("Season", "season");

        await createProduct(a, "Acme scarf", shared);
        await createProduct(b, "Globex scarf", shared);

        for (const owner of [a, b]) {
          const list = await api.get("/store/tenant/collections", storeKey(owner));
          expect(list.data.collections.map((c: { handle: string }) => c.handle)).toEqual(["season"]);
        }
      });
    });
  },
});
