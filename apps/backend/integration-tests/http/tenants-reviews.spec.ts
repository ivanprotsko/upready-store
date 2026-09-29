import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of product reviews (t09-reviews): the storefront's form, the
 * owner's moderation and the wall between two shops.
 *
 * The routes under test are `POST /store/tenant/reviews` (a logged-in customer
 * writes one), `GET /store/tenant/reviews` (what a visitor sees), `GET
 * /tenants/reviews` (the owner's moderation list) and `POST
 * /tenants/reviews/:id` (publish, hide, answer).
 *
 * Three facts of this feature are what the tests pin down, and each of them was
 * asserted so far only by the unit tests of `review-helpers.ts`:
 *
 *   - a review arrives `pending` and is invisible on the storefront until the
 *     owner publishes it, so the status is never a field of the request;
 *   - the tenant comes from the publishable key on the storefront side and from
 *     the token on the panel side, never from the body, so one shop can neither
 *     read nor moderate nor write onto another shop's product;
 *   - an anonymous visitor gets a 401 rather than a review with no author
 *     behind it (`authenticate("customer")` without `allowUnauthenticated` in
 *     `src/api/middlewares.ts`).
 *
 * Runner facts, the same as the other specs here: the database is restored from
 * its post-`beforeAll` snapshot before every test, so a test reads only the rows
 * it created itself, and `DB_HOST` has to be the literal `localhost` or the
 * runner forces SSL and nothing connects.
 */
type Registered = {
  token: string;
  tenant: {
    id: string;
    handle: string;
    sales_channel: { id: string; name: string };
    api_key: { id: string; token: string };
  };
};

const PASSWORD = "supersecret-owner";
const CUSTOMER_PASSWORD = "supersecret-customer";

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
    describe("tenants: product reviews", () => {
      let a: Registered;
      let b: Registered;
      let productA: { id: string };
      let productB: { id: string };
      let customerA: { id: string; token: string };

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeKey = (owner: Registered, customerToken?: string) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(customerToken ? { authorization: `Bearer ${customerToken}` } : {}),
        },
      });

      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
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

      const createProduct = async (owner: Registered, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string };
      };

      const registerCustomer = async (owner: Registered, email: string) => {
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: CUSTOMER_PASSWORD },
          storeKey(owner),
        );
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "Buyer" },
          storeKey(owner, registration.data.token),
        );
        expect(created.status).toBe(200);
        const login = await api.post(
          "/auth/customer/emailpass",
          { email, password: CUSTOMER_PASSWORD },
          storeKey(owner),
        );
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      /** One review left by `customerA` on `productId`, through the storefront's own form. */
      const leaveReview = async (
        owner: Registered,
        productId: string,
        overrides: Record<string, unknown> = {},
      ) => {
        const created = await api.post(
          "/store/tenant/reviews",
          {
            product_id: productId,
            rating: 5,
            title: "Отличная вещь",
            body: "Пришло быстро, качество как на фото.",
            author_name: "Оксана",
            language: "ru",
            ...overrides,
          },
          storeKey(owner, customerA.token),
        );
        expect(created.status).toBe(201);
        return created.data.review as { id: string; status: string };
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
        productA = await createProduct(a, "Acme shirt");
        productB = await createProduct(b, "Globex shirt");
        customerA = await registerCustomer(a, "buyer@acme.test");
      });

      it("takes a customer's review as pending, hides it from the storefront, then publishes and answers it", async () => {
        const review = await leaveReview(a, productA.id);
        // The status is not a field of the request: the route writes `pending`
        // whatever the body says, and `source` marks it as left in the shop.
        expect(review.status).toBe("pending");

        const hidden = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(a),
        );
        expect(hidden.status).toBe(200);
        expect(hidden.data.reviews).toEqual([]);
        expect(hidden.data.count).toBe(0);
        // Nobody has rated the product yet, so there is no average to round up
        // into a rating (rule 20a: a zero is not an empty).
        expect(hidden.data.summary).toEqual({ count: 0, average: null });

        const moderation = await api.get("/tenants/reviews", bearer(a.token));
        expect(moderation.status).toBe(200);
        expect(moderation.data.count).toBe(1);
        expect(moderation.data.reviews[0]).toMatchObject({
          id: review.id,
          product_id: productA.id,
          status: "pending",
          source: "shop",
          rating: 5,
          author_name: "Оксана",
          language: "ru",
          reply: null,
          replied_at: null,
        });
        // The product's own title travels with the row so the panel's list can
        // name what was reviewed without a round trip per row.
        expect(moderation.data.reviews[0].product).toMatchObject({ id: productA.id });

        const published = await api.post(
          `/tenants/reviews/${review.id}`,
          { status: "published", reply: "  Спасибо за отзыв!  " },
          bearer(a.token),
        );
        expect(published.status).toBe(200);
        expect(published.data.review.status).toBe("published");
        // The reply is trimmed and dated by the server's clock, never the client's.
        expect(published.data.review.reply).toBe("Спасибо за отзыв!");
        expect(published.data.review.replied_at).not.toBeNull();

        const visible = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(a),
        );
        expect(visible.status).toBe(200);
        expect(visible.data.count).toBe(1);
        expect(visible.data.summary).toEqual({ count: 1, average: 5 });
        expect(visible.data.reviews[0]).toMatchObject({
          id: review.id,
          status: "published",
          reply: "Спасибо за отзыв!",
        });

        // Hiding it takes the review back off the product page without losing
        // the moderation decision: the row is still in the owner's list.
        const takenDown = await api.post(
          `/tenants/reviews/${review.id}`,
          { status: "hidden" },
          bearer(a.token),
        );
        expect(takenDown.status).toBe(200);
        const afterHide = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(a),
        );
        expect(afterHide.data.reviews).toEqual([]);
        expect(afterHide.data.summary).toEqual({ count: 0, average: null });
        const stillListed = await api.get("/tenants/reviews?status=hidden", bearer(a.token));
        expect(stillListed.data.count).toBe(1);
      });

      it("refuses the moderation routes without the owner's token", async () => {
        const review = await leaveReview(a, productA.id);

        const list = await failed(api.get("/tenants/reviews"));
        expect(list.status).toBe(401);

        const write = await failed(
          api.post(`/tenants/reviews/${review.id}`, { status: "published" }),
        );
        expect(write.status).toBe(401);

        const remove = await failed(api.delete(`/tenants/reviews/${review.id}`));
        expect(remove.status).toBe(401);

        // A customer's token is not an owner's token either: the customer of
        // this very shop must not reach the panel's namespace.
        const asCustomer = await failed(
          api.get("/tenants/reviews", bearer(customerA.token)),
        );
        expect(asCustomer.status).toBe(401);

        // And the review is still pending: none of the four calls wrote anything.
        const untouched = await api.get("/tenants/reviews", bearer(a.token));
        expect(untouched.data.reviews[0]).toMatchObject({ id: review.id, status: "pending" });
      });

      it("refuses an anonymous POST /store/tenant/reviews, key or no key", async () => {
        const anonymous = await failed(
          api.post(
            "/store/tenant/reviews",
            {
              product_id: productA.id,
              rating: 5,
              body: "Мне никто не мешает это написать.",
              author_name: "Кто угодно",
            },
            storeKey(a),
          ),
        );
        expect(anonymous.status).toBe(401);

        // Reading is public, writing is not, and nothing was written.
        const list = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(a),
        );
        expect(list.data.count).toBe(0);
        const moderation = await api.get("/tenants/reviews", bearer(a.token));
        expect(moderation.data.count).toBe(0);
      });

      it("keeps two shops apart on the same product id", async () => {
        const review = await leaveReview(a, productA.id);
        await api.post(
          `/tenants/reviews/${review.id}`,
          { status: "published" },
          bearer(a.token),
        );

        // Globex asks for Acme's product by id, with its own owner token: the
        // page narrows to nothing instead of widening to a foreign shop's rows.
        const foreignFilter = await api.get(
          `/tenants/reviews?product_id=${productA.id}`,
          bearer(b.token),
        );
        expect(foreignFilter.status).toBe(200);
        expect(foreignFilter.data.reviews).toEqual([]);
        expect(foreignFilter.data.count).toBe(0);

        // Unfiltered, Globex sees its own shop: no reviews at all.
        const ownList = await api.get("/tenants/reviews", bearer(b.token));
        expect(ownList.data.count).toBe(0);

        // A review of another shop is a MISSING review here, never a forbidden
        // one, so the answer never says that another tenant's row exists.
        const moderateForeign = await failed(
          api.post(`/tenants/reviews/${review.id}`, { status: "hidden" }, bearer(b.token)),
        );
        expect(moderateForeign.status).toBe(404);
        const deleteForeign = await failed(
          api.delete(`/tenants/reviews/${review.id}`, bearer(b.token)),
        );
        expect(deleteForeign.status).toBe(404);

        // Globex's storefront key over Acme's product id: nothing, and no error
        // that would confirm the product exists somewhere.
        const foreignStore = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(b),
        );
        expect(foreignStore.status).toBe(200);
        expect(foreignStore.data.count).toBe(0);
        expect(foreignStore.data.summary).toEqual({ count: 0, average: null });

        // A customer of Acme cannot write onto Globex's product either, and the
        // refusal is the 404 of a product that does not exist for this shop.
        const crossWrite = await failed(
          api.post(
            "/store/tenant/reviews",
            {
              product_id: productB.id,
              rating: 1,
              body: "Отзыв не в тот магазин.",
              author_name: "Оксана",
            },
            storeKey(a, customerA.token),
          ),
        );
        expect(crossWrite.status).toBe(404);

        // Acme's own view is unchanged by all of the above.
        const acme = await api.get(
          `/store/tenant/reviews?product_id=${productA.id}`,
          storeKey(a),
        );
        expect(acme.data.count).toBe(1);
        expect(acme.data.reviews[0]).toMatchObject({ id: review.id, status: "published" });
      });
    });
  },
});
