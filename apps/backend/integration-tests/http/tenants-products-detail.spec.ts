import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant product-detail surface (wave 2, piece 1): the writes
 * the copied product-detail screens make, and the isolation each of them has
 * to hold. Sibling of `tenants.spec.ts`, same runner facts: the database is
 * restored from its post-`beforeAll` snapshot before every test, so each test
 * creates the products it reads, and `DB_HOST` must be the literal `localhost`
 * or the runner forces SSL and nothing connects.
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
};

type Product = {
  id: string;
  title: string;
  options: { id: string; title: string }[];
  variants: { id: string; title: string; prices: { amount: number; currency_code: string }[] }[];
};

const PASSWORD = "supersecret";

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

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: product detail, variants and options", () => {
      let a: Registered;
      let b: Registered;

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

      const createProduct = async (owner: Registered, title: string): Promise<Product> => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as Product;
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

      it("shows an updated title on the next GET and keeps the tenant's own sales channel", async () => {
        const product = await createProduct(a, "Acme chair");

        const updated = await api.post(
          `/tenants/products/${product.id}`,
          { title: "Acme chair, oak", sales_channels: [{ id: b.tenant.sales_channel.id }] },
          bearer(a.token),
        );
        expect(updated.status).toBe(200);
        expect(updated.data.product.title).toBe("Acme chair, oak");

        const read = await api.get(
          `/tenants/products/${product.id}?fields=id,title,*sales_channels`,
          bearer(a.token),
        );
        expect(read.status).toBe(200);
        expect(read.data.product.title).toBe("Acme chair, oak");

        // The body named the other tenant's channel; the route ignores it.
        expect(read.data.product.sales_channels.map((channel: { id: string }) => channel.id)).toEqual([
          a.tenant.sales_channel.id,
        ]);
      });

      it("adds an option and a variant, and lists the variant afterwards", async () => {
        const product = await createProduct(a, "Acme lamp");

        const option = await api.post(
          `/tenants/products/${product.id}/options/batch`,
          { add: [{ title: "Size", values: ["S", "L"] }] },
          bearer(a.token),
        );
        expect(option.status).toBe(200);
        expect(option.data.product.options.map((o: { title: string }) => o.title).sort()).toEqual([
          "Color",
          "Size",
        ]);

        const options = await api.get(`/tenants/products/${product.id}/options`, bearer(a.token));
        expect(options.status).toBe(200);
        expect(options.data.count).toBe(2);

        const created = await api.post(
          `/tenants/products/${product.id}/variants`,
          {
            title: "Acme lamp, large",
            prices: [{ currency_code: "eur", amount: 42 }],
            manage_inventory: false,
            options: { Color: "Blue", Size: "L" },
          },
          bearer(a.token),
        );
        expect(created.status).toBe(200);

        const variants = await api.get(
          `/tenants/products/${product.id}/variants`,
          bearer(a.token),
        );
        expect(variants.status).toBe(200);
        expect(variants.data.count).toBe(2);
        expect(variants.data.variants.map((v: { title: string }) => v.title)).toContain(
          "Acme lamp, large",
        );
        expect(variants.data).toMatchObject({ offset: 0, limit: expect.any(Number) });
      });

      it("saves a price through the variants batch and reads it back", async () => {
        const product = await createProduct(a, "Acme desk");
        const variantId = product.variants[0].id;

        const batch = await api.post(
          `/tenants/products/${product.id}/variants/batch`,
          { update: [{ id: variantId, prices: [{ currency_code: "eur", amount: 99 }] }] },
          bearer(a.token),
        );
        expect(batch.status).toBe(200);
        expect(batch.data.updated.map((v: { id: string }) => v.id)).toEqual([variantId]);

        const read = await api.get(
          `/tenants/products/${product.id}?fields=id,*variants,*variants.prices`,
          bearer(a.token),
        );
        expect(read.status).toBe(200);
        const prices = read.data.product.variants[0].prices as {
          amount: number;
          currency_code: string;
        }[];
        expect(prices.map((price) => price.amount)).toEqual([99]);
      });

      it("deletes a variant of its own product", async () => {
        const product = await createProduct(a, "Acme stool");
        const variantId = product.variants[0].id;

        const deleted = await api.delete(
          `/tenants/products/${product.id}/variants/${variantId}`,
          bearer(a.token),
        );
        expect(deleted.status).toBe(200);
        expect(deleted.data).toMatchObject({ id: variantId, object: "variant", deleted: true });

        const variants = await api.get(`/tenants/products/${product.id}/variants`, bearer(a.token));
        expect(variants.data.count).toBe(0);
      });

      it("answers 404 to tenant B on every verb against tenant A's product", async () => {
        const product = await createProduct(a, "Acme bench");
        const variantId = product.variants[0].id;

        // Every body below is valid on purpose: an invalid one would be
        // refused by the Admin validator with a 400 before the route's
        // ownership check ever ran, and the test would prove nothing.
        const calls: [string, Promise<any>][] = [
          ["GET product", failed(api.get(`/tenants/products/${product.id}`, bearer(b.token)))],
          [
            "POST product",
            failed(
              api.post(`/tenants/products/${product.id}`, { title: "stolen" }, bearer(b.token)),
            ),
          ],
          ["DELETE product", failed(api.delete(`/tenants/products/${product.id}`, bearer(b.token)))],
          [
            "GET variants",
            failed(api.get(`/tenants/products/${product.id}/variants`, bearer(b.token))),
          ],
          [
            "POST variant",
            failed(
              api.post(
                `/tenants/products/${product.id}/variants`,
                {
                  title: "stolen",
                  prices: [{ currency_code: "eur", amount: 1 }],
                  manage_inventory: false,
                  options: { Color: "Blue" },
                },
                bearer(b.token),
              ),
            ),
          ],
          [
            "GET variant",
            failed(
              api.get(`/tenants/products/${product.id}/variants/${variantId}`, bearer(b.token)),
            ),
          ],
          [
            "POST variant",
            failed(
              api.post(
                `/tenants/products/${product.id}/variants/${variantId}`,
                { title: "stolen" },
                bearer(b.token),
              ),
            ),
          ],
          [
            "DELETE variant",
            failed(
              api.delete(`/tenants/products/${product.id}/variants/${variantId}`, bearer(b.token)),
            ),
          ],
          [
            "POST variants batch",
            failed(
              api.post(
                `/tenants/products/${product.id}/variants/batch`,
                { update: [{ id: variantId, prices: [{ currency_code: "eur", amount: 1 }] }] },
                bearer(b.token),
              ),
            ),
          ],
          [
            "GET options",
            failed(api.get(`/tenants/products/${product.id}/options`, bearer(b.token))),
          ],
          [
            "POST options batch",
            failed(
              api.post(
                `/tenants/products/${product.id}/options/batch`,
                { add: [{ title: "Size", values: ["S"] }] },
                bearer(b.token),
              ),
            ),
          ],
        ];

        const statuses = await Promise.all(
          calls.map(async ([label, call]) => [label, (await call).status] as const),
        );
        expect(statuses).toEqual(calls.map(([label]) => [label, 404]));

        // Nothing of tenant A's changed under the refused writes.
        const read = await api.get(`/tenants/products/${product.id}`, bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.product.title).toBe("Acme bench");
        expect(read.data.product.variants).toHaveLength(1);
      });

      it("scopes GET /tenants/product-variants to the caller's own products", async () => {
        await createProduct(a, "Acme shelf");

        const mine = await api.get("/tenants/product-variants", bearer(a.token));
        expect(mine.status).toBe(200);
        expect(mine.data.count).toBe(1);
        expect(mine.data.variants.map((v: { title: string }) => v.title)).toEqual(["Acme shelf"]);
        expect(mine.data).toMatchObject({ offset: 0, limit: expect.any(Number) });

        const theirs = await api.get("/tenants/product-variants", bearer(b.token));
        expect(theirs.status).toBe(200);
        expect(theirs.data.count).toBe(0);
        expect(theirs.data.variants).toEqual([]);
      });

      it("cannot reach another tenant's variant by asking for its id", async () => {
        const product = await createProduct(a, "Acme cabinet");
        await createProduct(b, "Globex cabinet");

        const probe = await api.get(
          `/tenants/product-variants?id=${product.variants[0].id}`,
          bearer(b.token),
        );
        expect(probe.status).toBe(200);
        expect(probe.data.count).toBe(0);
      });
    });
  },
});
