import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test for the product characteristics (t15-product-attributes).
 *
 * Three seams, failing differently:
 *
 * - `/tenants/product-attributes/**`, the owner's own schema, scoped by the
 *   tenant behind the bearer token;
 * - `/tenants/products/:id/attributes`, the values, where the category scope
 *   decides what a product may even carry;
 * - `/store/tenant/product-attributes/**`, what a visitor reads, scoped by the
 *   storefront's publishable key: the product page block and the facets.
 *
 * The cases that earn their place here are the ones a screenshot cannot prove:
 * the range filter returning EXACTLY the products inside it, the two flags
 * («показывать» and «фильтровать») being genuinely independent, a zero-match
 * value coming back disabled instead of vanishing, and a neighbour's
 * characteristics being invisible in both directions.
 *
 * Every case creates the rows it reads. The runner restores the database from
 * its post-`beforeAll` snapshot before each test (AGENTS.md, "Verifying Your
 * Work"), so nothing an earlier `it` wrote is on file here.
 */
const PASSWORD = "supersecret";

type Registered = {
  token: string;
  tenant: { id: string; sales_channel: { id: string } };
  publishableKey: { id: string; token: string };
};

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
  testSuite: ({ api }) => {
    describe("tenants: product characteristics (/tenants/product-attributes, /store/tenant/product-attributes)", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered, locale?: string) => ({
        headers: {
          "x-publishable-api-key": owner.publishableKey.token,
          ...(locale && { "x-medusa-locale": locale }),
        },
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

      const createProduct = async (owner: Registered, title: string): Promise<{ id: string }> => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string };
      };

      const createCategory = async (
        owner: Registered,
        name: string,
        extra: Record<string, unknown> = {},
      ): Promise<{ id: string }> => {
        const created = await api.post(
          "/tenants/product-categories",
          { name, ...extra },
          bearer(owner.token),
        );
        expect(created.status).toBe(200);
        return created.data.product_category as { id: string };
      };

      const addToCategory = async (
        owner: Registered,
        categoryId: string,
        productIds: string[],
      ): Promise<void> => {
        const added = await api.post(
          `/tenants/product-categories/${categoryId}/products`,
          { add: productIds },
          bearer(owner.token),
        );
        expect(added.status).toBe(200);
      };

      const declare = async (
        owner: Registered,
        body: Record<string, unknown>,
      ): Promise<{ id: string; key: string }> => {
        const created = await api.post("/tenants/product-attributes", body, bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product_attribute as { id: string; key: string };
      };

      const setValues = async (
        owner: Registered,
        productId: string,
        values: Record<string, string | number | boolean | null>,
      ) => {
        const saved = await api.post(
          `/tenants/products/${productId}/attributes`,
          { values: Object.entries(values).map(([key, value]) => ({ key, value })) },
          bearer(owner.token),
        );
        expect(saved.status).toBe(200);
        return saved.data;
      };

      const facets = async (owner: Registered, query = "", locale?: string) => {
        const read = await api.get(
          `/store/tenant/product-attributes/facets${query ? `?${query}` : ""}`,
          storeKey(owner, locale),
        );
        expect(read.status).toBe(200);
        return read.data as {
          facets: {
            key: string;
            name: string;
            type: string;
            unit: string | null;
            values: { value: string; label: string; count: number; disabled: boolean }[];
            range: { min: number; max: number; count: number } | null;
          }[];
          product_ids: string[] | null;
          count: number;
        };
      };

      const pdp = async (owner: Registered, productId: string, locale?: string) => {
        const read = await api.get(
          `/store/tenant/product-attributes?product_id=${productId}`,
          storeKey(owner, locale),
        );
        expect(read.status).toBe(200);
        return read.data.product_attributes as {
          key: string;
          name: string;
          value: string | number | boolean | null;
          label: string | null;
          unit: string | null;
        }[];
      };

      const failed = async (request: Promise<unknown>) => {
        try {
          await request;
        } catch (error) {
          return (error as { response: { status: number; data: { message?: string } } }).response;
        }
        throw new Error("Expected the request to fail");
      };

      beforeEach(async () => {
        a = await registerTenant("attrshop", "Attr Shop");
        b = await registerTenant("attrother", "Attr Other");
      });

      it("shows the owner's declared characteristics on the product page, in order, with no empty rows", async () => {
        await declare(a, {
          key: "sostav",
          name: "Состав",
          type: "text",
          position: 0,
          show_on_product: true,
        });
        await declare(a, {
          key: "obem",
          name: "Объём",
          type: "number",
          unit: "мл",
          position: 1,
          show_on_product: true,
        });

        const filled = await createProduct(a, "Attr filled");
        const partial = await createProduct(a, "Attr partial");

        await setValues(a, filled.id, { sostav: "Трава, витамин C", obem: 100 });
        await setValues(a, partial.id, { obem: 500 });

        expect(await pdp(a, filled.id)).toEqual([
          expect.objectContaining({ key: "sostav", name: "Состав", value: "Трава, витамин C" }),
          expect.objectContaining({ key: "obem", name: "Объём", value: 100, unit: "мл" }),
        ]);

        // The characteristic the owner left empty is ABSENT, not «не указано».
        expect(await pdp(a, partial.id)).toEqual([
          expect.objectContaining({ key: "obem", value: 500 }),
        ]);
      });

      it("keeps «показывать на карточке» and «использовать как фильтр» independent", async () => {
        await declare(a, {
          key: "shown_only",
          name: "Только на карточке",
          type: "text",
          show_on_product: true,
          use_as_filter: false,
        });
        await declare(a, {
          key: "filter_only",
          name: "Только фильтр",
          type: "text",
          show_on_product: false,
          use_as_filter: true,
        });

        const product = await createProduct(a, "Attr flags");
        await setValues(a, product.id, { shown_only: "видно", filter_only: "скрыто" });

        expect((await pdp(a, product.id)).map((row) => row.key)).toEqual(["shown_only"]);
        expect((await facets(a)).facets.map((facet) => facet.key)).toEqual(["filter_only"]);
      });

      it("returns exactly the products whose number falls inside the selected range", async () => {
        await declare(a, {
          key: "obem",
          name: "Объём",
          type: "number",
          unit: "мл",
          use_as_filter: true,
        });

        const small = await createProduct(a, "Attr 50");
        const mid = await createProduct(a, "Attr 250");
        const large = await createProduct(a, "Attr 900");
        const none = await createProduct(a, "Attr none");

        await setValues(a, small.id, { obem: 50 });
        await setValues(a, mid.id, { obem: 250 });
        await setValues(a, large.id, { obem: 900 });

        const inRange = await facets(a, "a_obem=100..500");
        expect(inRange.product_ids).toEqual([mid.id]);
        expect(inRange.count).toBe(1);

        // Both ends are inclusive, and a product with no value is never in a range.
        const wide = await facets(a, "a_obem=50..900");
        expect(new Set(wide.product_ids)).toEqual(new Set([small.id, mid.id, large.id]));
        expect(wide.product_ids).not.toContain(none.id);

        // An open end is a half-line, not a missing filter.
        const openEnd = await facets(a, "a_obem=..250");
        expect(new Set(openEnd.product_ids)).toEqual(new Set([small.id, mid.id]));

        // Nothing in range is an EMPTY set, which is a different answer from
        // «no filter»: `product_ids` is `null` only when nothing is selected.
        const empty = await facets(a, "a_obem=1000..2000");
        expect(empty.product_ids).toEqual([]);
        expect(empty.count).toBe(0);
        expect((await facets(a)).product_ids).toBeNull();
      });

      it("counts a facet with the other facets applied and its own left out, and disables what matches nothing", async () => {
        await declare(a, {
          key: "sostav",
          name: "Состав",
          type: "select",
          use_as_filter: true,
          options: [
            { value: "travy", label: "Травы" },
            { value: "magniy", label: "Магний" },
          ],
        });
        await declare(a, {
          key: "obem",
          name: "Объём",
          type: "number",
          use_as_filter: true,
        });

        const herbsSmall = await createProduct(a, "Attr herbs 100");
        const herbsLarge = await createProduct(a, "Attr herbs 900");
        const magnesium = await createProduct(a, "Attr magnesium 100");

        await setValues(a, herbsSmall.id, { sostav: "travy", obem: 100 });
        await setValues(a, herbsLarge.id, { sostav: "travy", obem: 900 });
        await setValues(a, magnesium.id, { sostav: "magniy", obem: 100 });

        const picked = await facets(a, "a_sostav=travy");
        const sostav = picked.facets.find((facet) => facet.key === "sostav")!;
        const obem = picked.facets.find((facet) => facet.key === "obem")!;

        // Its own selection is left out, so the buyer can still switch.
        expect(sostav.values).toEqual([
          expect.objectContaining({ value: "travy", label: "Травы", count: 2, disabled: false }),
          expect.objectContaining({ value: "magniy", label: "Магний", count: 1, disabled: false }),
        ]);
        // The other facet is counted WITH the selection applied.
        expect(obem.range).toEqual({ min: 100, max: 900, count: 2 });

        const narrow = await facets(a, "a_obem=800..1000");
        const sostavNarrow = narrow.facets.find((facet) => facet.key === "sostav")!;
        expect(sostavNarrow.values).toEqual([
          expect.objectContaining({ value: "travy", count: 1, disabled: false }),
          // Zero matches under the current selection: still offered, disabled.
          expect.objectContaining({ value: "magniy", count: 0, disabled: true }),
        ]);
      });

      it("scopes a characteristic to a category and its subtree, and refuses a value outside it", async () => {
        const parent = await createCategory(a, "Добавки");
        const child = await createCategory(a, "Витамины", { parent_category_id: parent.id });
        const other = await createCategory(a, "Посуда");

        await declare(a, {
          key: "sostav",
          name: "Состав",
          type: "text",
          category_id: parent.id,
          show_on_product: true,
        });

        const inChild = await createProduct(a, "Attr in child");
        const outside = await createProduct(a, "Attr outside");
        await addToCategory(a, child.id, [inChild.id]);
        await addToCategory(a, other.id, [outside.id]);

        // Declared on the parent, so a product in the child carries it.
        await setValues(a, inChild.id, { sostav: "Трава" });
        expect((await pdp(a, inChild.id)).map((row) => row.key)).toEqual(["sostav"]);

        const refused = await failed(
          api.post(
            `/tenants/products/${outside.id}/attributes`,
            { values: [{ key: "sostav", value: "Трава" }] },
            bearer(a.token),
          ),
        );
        expect(refused.status).toBe(400);
      });

      it("reads a characteristic's name and a choice's label in the visitor's language, falling back to the owner's own text", async () => {
        await declare(a, {
          key: "strana",
          name: "Страна",
          translations: { en: "Country" },
          type: "select",
          show_on_product: true,
          use_as_filter: true,
          options: [
            { value: "russia", label: "Россия", translations: { en: "Russia" } },
            { value: "india", label: "Индия" },
          ],
        });

        const russian = await createProduct(a, "Attr russian");
        const indian = await createProduct(a, "Attr indian");
        await setValues(a, russian.id, { strana: "russia" });
        await setValues(a, indian.id, { strana: "india" });

        expect(await pdp(a, russian.id, "ru")).toEqual([
          expect.objectContaining({ name: "Страна", label: "Россия" }),
        ]);
        expect(await pdp(a, russian.id, "en")).toEqual([
          expect.objectContaining({ name: "Country", label: "Russia" }),
        ]);
        // No English label for «Индия»: the owner's own text, never a blank.
        expect(await pdp(a, indian.id, "en")).toEqual([
          expect.objectContaining({ name: "Country", label: "Индия" }),
        ]);
      });

      it("never shows one shop the characteristics or the values of another", async () => {
        await declare(a, {
          key: "sostav",
          name: "Состав",
          type: "text",
          show_on_product: true,
          use_as_filter: true,
        });
        const product = await createProduct(a, "Attr private");
        await setValues(a, product.id, { sostav: "Трава" });

        // The neighbour's schema is not in B's list, and B's facets are empty.
        const listB = await api.get("/tenants/product-attributes", bearer(b.token));
        expect(listB.data.product_attributes).toEqual([]);
        expect((await facets(b)).facets).toEqual([]);

        // B's storefront asking for A's product by id gets nothing, not a leak.
        expect(await pdp(b, product.id)).toEqual([]);

        // And B cannot reach A's characteristic by id: a foreign row is a
        // missing row, 404 rather than 403.
        const [declared] = (await api.get("/tenants/product-attributes", bearer(a.token))).data
          .product_attributes;
        const stolen = await failed(
          api.get(`/tenants/product-attributes/${declared.id}`, bearer(b.token)),
        );
        expect(stolen.status).toBe(404);
      });

      it("clears a value the owner emptied and drops the choices a rename of the list removed", async () => {
        const attribute = await declare(a, {
          key: "strana",
          name: "Страна",
          type: "select",
          show_on_product: true,
          use_as_filter: true,
          options: [
            { value: "russia", label: "Россия" },
            { value: "india", label: "Индия" },
          ],
        });

        const product = await createProduct(a, "Attr cleared");
        await setValues(a, product.id, { strana: "india" });
        expect((await pdp(a, product.id)).map((row) => row.value)).toEqual(["india"]);

        // An empty value removes the row rather than storing "".
        await setValues(a, product.id, { strana: null });
        expect(await pdp(a, product.id)).toEqual([]);

        await setValues(a, product.id, { strana: "india" });
        const updated = await api.post(
          `/tenants/product-attributes/${attribute.id}`,
          {
            name: "Страна",
            type: "select",
            show_on_product: true,
            use_as_filter: true,
            options: [{ value: "russia", label: "Россия" }],
          },
          bearer(a.token),
        );
        expect(updated.status).toBe(200);
        expect(updated.data.cleared_values).toBe(1);
        expect(await pdp(a, product.id)).toEqual([]);
      });

      it("refuses a value that is not a number, and a choice the schema does not declare", async () => {
        await declare(a, { key: "obem", name: "Объём", type: "number" });
        await declare(a, {
          key: "strana",
          name: "Страна",
          type: "select",
          options: [{ value: "russia", label: "Россия" }],
        });
        const product = await createProduct(a, "Attr invalid");

        const notANumber = await failed(
          api.post(
            `/tenants/products/${product.id}/attributes`,
            { values: [{ key: "obem", value: "много" }] },
            bearer(a.token),
          ),
        );
        expect(notANumber.status).toBe(400);

        const notAChoice = await failed(
          api.post(
            `/tenants/products/${product.id}/attributes`,
            { values: [{ key: "strana", value: "atlantis" }] },
            bearer(a.token),
          ),
        );
        expect(notAChoice.status).toBe(400);
      });

      it("never counts a draft product in a facet", async () => {
        await declare(a, {
          key: "obem",
          name: "Объём",
          type: "number",
          use_as_filter: true,
        });

        const published = await createProduct(a, "Attr published");
        const draft = await api.post(
          "/tenants/products",
          { ...productBody("Attr draft"), status: "draft" },
          bearer(a.token),
        );
        expect(draft.status).toBe(201);

        await setValues(a, published.id, { obem: 100 });
        await setValues(a, draft.data.product.id, { obem: 900 });

        // The draft is not on the listing the count sits next to, so the range
        // must not open on 900 either.
        const bar = await facets(a);
        expect(bar.facets[0].range).toEqual({ min: 100, max: 100, count: 1 });
      });
    });
  },
});
