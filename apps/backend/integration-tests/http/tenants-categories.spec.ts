import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant category surface (wave 2, piece 5): the scoped list,
 * the write verbs the copied category screens make, the product batch, and the
 * storefront's public read. Sibling of `tenants.spec.ts` and
 * `tenants-products-detail.spec.ts`, same runner facts: the database is restored
 * from its post-`beforeAll` snapshot before every test, so each test creates the
 * rows it reads, and `DB_HOST` must be the literal `localhost` or the runner
 * forces SSL and nothing connects.
 *
 * Categories carry no sales channel and no owner column, so every assertion here
 * is really an assertion about the tenant-product-category link.
 */
type Tenant = {
  id: string;
  handle: string;
  sales_channel: { id: string; name: string };
  api_key: { id: string; token: string };
};

type Registered = {
  token: string;
  tenant: Tenant;
  publishableKey: { id: string; token: string };
};

type Category = {
  id: string;
  name: string;
  handle: string;
  parent_category_id: string | null;
};

const PASSWORD = "supersecret-owner";

const productBody = (title: string, status = "published") => ({
  title,
  status,
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
    describe("tenants: product categories", () => {
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

      const createCategory = async (
        owner: Registered,
        body: Record<string, unknown>,
      ): Promise<Category> => {
        const created = await api.post("/tenants/product-categories", body, bearer(owner.token));
        expect(created.status).toBe(200);
        return created.data.product_category as Category;
      };

      const createProduct = async (
        owner: Registered,
        title: string,
        status = "published",
      ): Promise<{ id: string; handle: string }> => {
        const created = await api.post("/tenants/products", productBody(title, status), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string; handle: string };
      };

      /** The response of a call that is expected to fail, without throwing. */
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

      beforeAll(async () => {
        await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("lists nothing before a tenant has created a category", async () => {
        const list = await api.get("/tenants/product-categories", bearer(a.token));
        expect(list.status).toBe(200);
        expect(list.data.count).toBe(0);
        expect(list.data.product_categories).toEqual([]);
        // The Admin list shape, empty page included: the copied screen reads these.
        expect(list.data.offset).toBe(0);
        expect(list.data.limit).toBe(50);
      });

      it("shows a created category to its owner in the Admin list shape, and to nobody else", async () => {
        const category = await createCategory(a, { name: "Acme outerwear", is_active: true });
        expect(category.id).toMatch(/^pcat_/);

        const listA = await api.get("/tenants/product-categories", bearer(a.token));
        expect(listA.status).toBe(200);
        expect(listA.data.count).toBe(1);
        expect(listA.data.product_categories.map((c: Category) => c.id)).toEqual([category.id]);
        expect(listA.data.offset).toBe(0);
        expect(listA.data.limit).toBe(50);

        const listB = await api.get("/tenants/product-categories", bearer(b.token));
        expect(listB.status).toBe(200);
        expect(listB.data.count).toBe(0);
        expect(listB.data.product_categories).toEqual([]);
      });

      it("answers 404 on every verb a foreign tenant aims at another tenant's category", async () => {
        const category = await createCategory(a, { name: "Acme hats" });

        const read = await failed(
          api.get(`/tenants/product-categories/${category.id}`, bearer(b.token)),
        );
        expect(read.status).toBe(404);

        const written = await failed(
          api.post(
            `/tenants/product-categories/${category.id}`,
            { name: "Globex hats" },
            bearer(b.token),
          ),
        );
        expect(written.status).toBe(404);

        const removed = await failed(
          api.delete(`/tenants/product-categories/${category.id}`, bearer(b.token)),
        );
        expect(removed.status).toBe(404);

        // And the row is untouched: the refusals were refusals, not silent writes.
        const stillThere = await api.get(
          `/tenants/product-categories/${category.id}`,
          bearer(a.token),
        );
        expect(stillThere.status).toBe(200);
        expect(stillThere.data.product_category.name).toBe("Acme hats");
      });

      it("lets a tenant nest inside its own tree and refuses a foreign parent", async () => {
        const parent = await createCategory(a, { name: "Acme root" });

        const child = await createCategory(a, {
          name: "Acme branch",
          parent_category_id: parent.id,
        });
        expect(child.parent_category_id).toBe(parent.id);

        const foreignParent = await failed(
          api.post(
            "/tenants/product-categories",
            { name: "Globex branch", parent_category_id: parent.id },
            bearer(b.token),
          ),
        );
        expect(foreignParent.status).toBe(404);

        // The tree filters keep working inside the owned set.
        const roots = await api.get(
          "/tenants/product-categories?parent_category_id=null&include_descendants_tree=true",
          bearer(a.token),
        );
        expect(roots.status).toBe(200);
        expect(roots.data.count).toBe(1);
        expect(
          roots.data.product_categories[0].category_children.map((c: Category) => c.id),
        ).toEqual([child.id]);
      });

      it("refuses a re-parent onto a foreign category", async () => {
        const acmeRoot = await createCategory(a, { name: "Acme root" });
        const globexOwn = await createCategory(b, { name: "Globex own" });

        const refused = await failed(
          api.post(
            `/tenants/product-categories/${globexOwn.id}`,
            { parent_category_id: acmeRoot.id },
            bearer(b.token),
          ),
        );
        expect(refused.status).toBe(404);

        const unchanged = await api.get(
          `/tenants/product-categories/${globexOwn.id}`,
          bearer(b.token),
        );
        expect(unchanged.data.product_category.parent_category_id).toBeNull();
      });

      it("updates and deletes a tenant's own category, and drops it from the list", async () => {
        const category = await createCategory(a, { name: "Acme sale" });

        const updated = await api.post(
          `/tenants/product-categories/${category.id}`,
          { name: "Acme clearance", description: "End of season" },
          bearer(a.token),
        );
        expect(updated.status).toBe(200);
        expect(updated.data.product_category.name).toBe("Acme clearance");

        const removed = await api.delete(
          `/tenants/product-categories/${category.id}`,
          bearer(a.token),
        );
        expect(removed.status).toBe(200);
        expect(removed.data).toMatchObject({
          id: category.id,
          object: "product_category",
          deleted: true,
        });

        const list = await api.get("/tenants/product-categories", bearer(a.token));
        expect(list.data.count).toBe(0);

        // The link went with it: a leftover row would make the tenant's own id
        // 404 on every route here.
        const gone = await failed(
          api.get(`/tenants/product-categories/${category.id}`, bearer(a.token)),
        );
        expect(gone.status).toBe(404);
      });

      it("adds and removes the tenant's own products on its own category", async () => {
        const category = await createCategory(a, { name: "Acme shoes" });
        const product = await createProduct(a, "Acme sneaker");

        const added = await api.post(
          `/tenants/product-categories/${category.id}/products?fields=id,name,products.id`,
          { add: [product.id] },
          bearer(a.token),
        );
        expect(added.status).toBe(200);
        expect(added.data.product_category.products.map((p: { id: string }) => p.id)).toEqual([
          product.id,
        ]);

        const detail = await api.get(
          `/tenants/product-categories/${category.id}?fields=id,name,products.id`,
          bearer(a.token),
        );
        expect(detail.data.product_category.products.map((p: { id: string }) => p.id)).toEqual([
          product.id,
        ]);

        const removed = await api.post(
          `/tenants/product-categories/${category.id}/products?fields=id,name,products.id`,
          { remove: [product.id] },
          bearer(a.token),
        );
        expect(removed.status).toBe(200);
        expect(removed.data.product_category.products).toEqual([]);
      });

      it("refuses a foreign product in add and in remove with 400, naming nothing", async () => {
        const category = await createCategory(a, { name: "Acme bags" });
        const foreign = await createProduct(b, "Globex bag");

        const added = await failed(
          api.post(
            `/tenants/product-categories/${category.id}/products`,
            { add: [foreign.id] },
            bearer(a.token),
          ),
        );
        expect(added.status).toBe(400);
        expect(added.data.message).not.toContain(foreign.id);

        const removed = await failed(
          api.post(
            `/tenants/product-categories/${category.id}/products`,
            { remove: [foreign.id] },
            bearer(a.token),
          ),
        );
        expect(removed.status).toBe(400);

        // Nothing was linked on the way to the refusal.
        const detail = await api.get(
          `/tenants/product-categories/${category.id}?fields=id,products.id`,
          bearer(a.token),
        );
        expect(detail.data.product_category.products).toEqual([]);
      });

      it("refuses the product batch on a foreign category with 404", async () => {
        const category = await createCategory(a, { name: "Acme coats" });
        const ownProduct = await createProduct(b, "Globex coat");

        const refused = await failed(
          api.post(
            `/tenants/product-categories/${category.id}/products`,
            { add: [ownProduct.id] },
            bearer(b.token),
          ),
        );
        expect(refused.status).toBe(404);
      });

      it("shows one tenant's categories to its own storefront key and none to another's", async () => {
        const category = await createCategory(a, { name: "Acme public", is_active: true });

        const storeA = await api.get("/store/tenant/product-categories", storeKey(a));
        expect(storeA.status).toBe(200);
        expect(storeA.data.count).toBe(1);
        expect(storeA.data.product_categories.map((c: Category) => c.id)).toEqual([category.id]);
        // The Store shape: no is_active / is_internal in the Store query config's defaults.
        expect(storeA.data.product_categories[0]).not.toHaveProperty("is_internal");

        const storeB = await api.get("/store/tenant/product-categories", storeKey(b));
        expect(storeB.status).toBe(200);
        expect(storeB.data.count).toBe(0);
        expect(storeB.data.product_categories).toEqual([]);
      });

      it("keeps an inactive category out of the public read while its owner still sees it", async () => {
        const hidden = await createCategory(a, { name: "Acme draft", is_active: false });

        const ownerSees = await api.get("/tenants/product-categories", bearer(a.token));
        expect(ownerSees.data.product_categories.map((c: Category) => c.id)).toContain(hidden.id);

        const storeA = await api.get("/store/tenant/product-categories", storeKey(a));
        expect(storeA.status).toBe(200);
        expect(storeA.data.count).toBe(0);
      });

      // t-2026-10-12-32, defect D3: `*products` of «Мёд» listed seven drafts to a
      // guest on cherkashino.ru, titles and handles included.
      it("lists a category's published products to a guest and none of its drafts", async () => {
        const category = await createCategory(a, { name: "Acme honey", is_active: true });
        const published = await createProduct(a, "Acme linden honey");
        const draft = await createProduct(a, "Acme drone honey", "draft");
        expect(draft.handle).toBeTruthy();

        const added = await api.post(
          `/tenants/product-categories/${category.id}/products`,
          { add: [published.id, draft.id] },
          bearer(a.token),
        );
        expect(added.status).toBe(200);

        const reads: Array<[path: string, pick: (data: any) => any]> = [
          [
            `/store/tenant/product-categories?fields=${encodeURIComponent("id,name,handle,*products")}`,
            (data) => data.product_categories.find((c: Category) => c.id === category.id),
          ],
          [
            `/store/product-categories?fields=${encodeURIComponent("id,name,handle,*products")}`,
            (data) => data.product_categories.find((c: Category) => c.id === category.id),
          ],
          [
            `/store/product-categories/${category.id}?fields=${encodeURIComponent("id,products.id,products.handle")}`,
            (data) => data.product_category,
          ],
          // The storefront's own read (`lib/data/categories.ts`, DEFAULT_CATEGORY_FIELDS).
          [
            `/store/tenant/product-categories?fields=${encodeURIComponent(
              "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category",
            )}`,
            (data) => data.product_categories.find((c: Category) => c.id === category.id),
          ],
        ];

        for (const [path, pick] of reads) {
          const read = await api.get(path, storeKey(a));
          expect(read.status).toBe(200);
          const products = pick(read.data).products as Array<{ id: string; handle?: string }>;
          expect(products.map((p) => p.id)).toEqual([published.id]);
          expect(JSON.stringify(read.data)).not.toContain(draft.id);
          expect(JSON.stringify(read.data)).not.toContain(draft.handle);
        }

        // The shop panel is not a guest: its owner still sees the draft in the category.
        const owner = await api.get(
          `/tenants/product-categories/${category.id}?fields=id,products.id`,
          bearer(a.token),
        );
        expect(owner.data.product_category.products.map((p: { id: string }) => p.id).sort()).toEqual(
          [published.id, draft.id].sort(),
        );
      });

      it("refuses the public read without a publishable key", async () => {
        const refused = await failed(api.get("/store/tenant/product-categories"));
        expect(refused.status).toBe(400);
      });
    });
  },
});
