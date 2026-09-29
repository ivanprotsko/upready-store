import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant home-page document (wave 2, piece 8): the write and the
 * read on `/tenants/home`, the two ways a document is refused, and the public read
 * on `/store/tenant/home`, which resolves the tenant from the publishable key.
 *
 * Sibling of `tenants.spec.ts` and `tenants-categories.spec.ts`, same runner facts:
 * the database is restored from its post-`beforeAll` snapshot before every test, so
 * each test writes the rows it reads, and `DB_HOST` must be the literal `localhost`
 * or the runner forces SSL and nothing connects at all.
 *
 * The document is one row per tenant with no id in the URL, so the isolation
 * assertions are about what a second tenant's token and a second tenant's
 * publishable key see after the first tenant has saved: null, in both directions.
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

const PASSWORD = "supersecret-owner";

/** A valid document: the composition vocabulary `upready.storefront-settings/v1`
 *  plus the tenant's own content for those blocks. */
const document = (overrides: Record<string, unknown> = {}) => ({
  theme: { preset: "sneakers" },
  settings: {
    defaultMode: "dark",
    header: "h5",
    hero: "k",
    tiles: "on",
    listing: "p1",
    footer: "f3",
  },
  content: {
    hero: {
      title: "Night wave hero",
      subtitle: "Everything the tenant typed",
      cta_label: "Shop",
      cta_href: "/store",
      image_url: null,
    },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
  ...overrides,
});

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: home page document", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey.token },
      });

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

        return {
          token: login.data.token,
          tenant: created.data.tenant,
          publishableKey: created.data.tenant.api_key,
        };
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("answers null before anything is saved", async () => {
        const home = await api.get("/tenants/home", bearer(a.token));
        expect(home.status).toBe(200);
        expect(home.data.home).toBeNull();
      });

      it("refuses an anonymous call", async () => {
        const anonymous = await failed(api.get("/tenants/home"));
        expect(anonymous.status).toBe(401);
      });

      it("saves a document and reads it back with a server-stamped updatedAt", async () => {
        const saved = await api.put("/tenants/home", document(), bearer(a.token));
        expect(saved.status).toBe(200);
        expect(saved.data.home.schema).toBe("upready.tenant-home/v1");
        expect(saved.data.home.updatedAt).toEqual(expect.any(String));
        expect(new Date(saved.data.home.updatedAt).toString()).not.toBe("Invalid Date");

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.home.theme).toEqual({ preset: "sneakers" });
        expect(read.data.home.settings).toEqual(document().settings);
        expect(read.data.home.content.hero.title).toBe("Night wave hero");
        expect(read.data.home.content.order).toEqual(["hero", "categories", "products"]);
        expect(read.data.home.updatedAt).toBe(saved.data.home.updatedAt);
      });

      it("overwrites the one row rather than adding a second", async () => {
        const first = await api.put("/tenants/home", document(), bearer(a.token));
        expect(first.status).toBe(200);

        const second = await api.put(
          "/tenants/home",
          document({ theme: { preset: "geist" } }),
          bearer(a.token),
        );
        expect(second.status).toBe(200);

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.data.home.theme).toEqual({ preset: "geist" });
        expect(read.data.home.updatedAt).not.toBe(first.data.home.updatedAt);
      });

      it("refuses a forbidden composition pair with 422 and the reason", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/home",
            document({
              settings: {
                defaultMode: "dark",
                header: "h5",
                hero: "k",
                tiles: "on",
                listing: "p1",
                footer: "f6",
              },
            }),
            bearer(a.token),
          ),
        );

        expect(rejected.status).toBe(422);
        expect(rejected.data.error).toBe("forbidden_combination");
        expect(rejected.data.field).toBe("footer");
        expect(rejected.data.against).toBe("defaultMode");
        expect(rejected.data.reason).toEqual(expect.any(String));

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.data.home).toBeNull();
      });

      it("refuses a value outside the composition vocabulary with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/home",
            document({
              settings: {
                defaultMode: "light",
                header: "h9",
                hero: "k",
                tiles: "on",
                listing: "p1",
                footer: "f1",
              },
            }),
            bearer(a.token),
          ),
        );

        expect(rejected.status).toBe(400);
      });

      it("refuses a theme preset the storefront does not build with 400", async () => {
        const rejected = await failed(
          api.put("/tenants/home", document({ theme: { preset: "not-a-preset" } }), bearer(a.token)),
        );

        expect(rejected.status).toBe(400);
      });

      it("refuses an order that names the same block twice with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/home",
            document({
              content: {
                ...document().content,
                order: ["hero", "hero", "products"],
              },
            }),
            bearer(a.token),
          ),
        );

        expect(rejected.status).toBe(400);
      });

      it("refuses a category the tenant does not own with 400", async () => {
        // B's category is a real row; it is simply not linked to A.
        const foreign = await api.post(
          "/tenants/product-categories",
          { name: "Globex only", is_active: true },
          bearer(b.token),
        );
        expect(foreign.status).toBe(200);

        const rejected = await failed(
          api.put(
            "/tenants/home",
            document({
              content: {
                ...document().content,
                products: {
                  source: "category",
                  category_id: foreign.data.product_category.id,
                  title: "Not mine",
                },
              },
            }),
            bearer(a.token),
          ),
        );

        expect(rejected.status).toBe(400);
        expect(rejected.data.message).not.toContain(foreign.data.product_category.id);

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.data.home).toBeNull();
      });

      it("accepts a category the tenant owns", async () => {
        const own = await api.post(
          "/tenants/product-categories",
          { name: "Acme only", is_active: true },
          bearer(a.token),
        );
        expect(own.status).toBe(200);

        const saved = await api.put(
          "/tenants/home",
          document({
            content: {
              ...document().content,
              products: {
                source: "category",
                category_id: own.data.product_category.id,
                title: "From the category",
              },
            },
          }),
          bearer(a.token),
        );

        expect(saved.status).toBe(200);
        expect(saved.data.home.content.products).toEqual({
          source: "category",
          category_id: own.data.product_category.id,
          title: "From the category",
        });
      });

      it("keeps B's document null after A saved its own", async () => {
        const saved = await api.put("/tenants/home", document(), bearer(a.token));
        expect(saved.status).toBe(200);

        const mine = await api.get("/tenants/home", bearer(b.token));
        expect(mine.status).toBe(200);
        expect(mine.data.home).toBeNull();
      });

      it("serves A's document to A's publishable key and null to B's", async () => {
        const saved = await api.put("/tenants/home", document(), bearer(a.token));
        expect(saved.status).toBe(200);

        const asA = await api.get("/store/tenant/home", storeKey(a));
        expect(asA.status).toBe(200);
        expect(asA.data.home.content.hero.title).toBe("Night wave hero");
        expect(asA.data.home.theme).toEqual({ preset: "sneakers" });

        const asB = await api.get("/store/tenant/home", storeKey(b));
        expect(asB.status).toBe(200);
        expect(asB.data.home).toBeNull();
      });

      it("refuses the public read without a publishable key", async () => {
        const anonymous = await failed(api.get("/store/tenant/home"));
        expect(anonymous.status).toBe(400);
      });
    });
  },
});
