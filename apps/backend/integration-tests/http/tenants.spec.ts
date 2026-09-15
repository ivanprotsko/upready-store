import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrdersWorkflow,
  createRegionsWorkflow,
  deleteSalesChannelsWorkflow,
} from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

jest.setTimeout(180_000);

/**
 * Seam test of the shared multitenancy slice: two tenants on one backend, each
 * seeing only its own products and orders through `/tenants/*`, and each
 * storefront key seeing only its own catalog through `/store/products`.
 *
 * Runs against a live Postgres (DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD,
 * defaults from @medusajs/test-utils): the runner creates a throwaway database,
 * migrates it and boots the app with this repository's medusa-config.ts.
 *
 * Two runner facts shape the tests (measured on @medusajs/test-utils 2.19.0):
 * the database is restored from its post-`beforeAll` snapshot before every
 * test (medusa-test-runner.js beforeEach/afterEach), so a test reads only
 * rows it created itself; and `DB_HOST` must be the literal `localhost`,
 * because any other host makes the runner force SSL on the connection.
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
  /** The tenant's own publishable key, as `POST /tenants` returned it. */
  publishableKey: { id: string; token: string };
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
    describe("tenants: shared multitenancy slice", () => {
      let regionId: string;
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

        return {
          token: login.data.token,
          tenant: created.data.tenant,
          publishableKey: created.data.tenant.api_key,
        };
      };

      const createProduct = async (owner: Registered, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as {
          id: string;
          sales_channels: { id: string }[];
          variants: { id: string }[];
        };
      };

      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey.token },
      });

      /**
       * The ids of the shipping options provisioned for one tenant's warehouse,
       * walked the way the resolver itself does: sales channel -> stock location
       * -> fulfillment set -> service zone -> shipping option.
       *
       * Isolation is asserted by these ids and not by the option NAMES. The
       * shipping-tariffs task (`src/shipping-tariffs/default-method-names.ts`,
       * PR #25) stopped minting `<Shop> pickup` / `<Shop> courier`, because the
       * shop's name reached the buyer's checkout as written («Оксана Черкашина
       * courier», measured on the live stand). Every tenant now gets the same
       * two human names, written in `STOREFRONT_DEFAULT_LOCALE`, so a name says
       * nothing about which warehouse an option came from and an assertion on
       * one would also break with the store's locale.
       */
      const shippingOptionIdsOf = async (owner: Registered): Promise<string[]> => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY);
        const { data: channels } = await query.graph({
          entity: "sales_channel",
          fields: ["stock_locations.fulfillment_sets.service_zones.shipping_options.id"],
          filters: { id: owner.tenant.sales_channel.id },
        });

        const ids = (channels[0]?.stock_locations ?? []).flatMap((location: any) =>
          (location?.fulfillment_sets ?? []).flatMap((set: any) =>
            (set?.service_zones ?? []).flatMap((zone: any) =>
              (zone?.shipping_options ?? []).map((option: any) => option?.id as string),
            ),
          ),
        );

        return [...new Set(ids.filter(Boolean))].sort();
      };

      beforeAll(async () => {
        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: {
            regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }],
          },
        });
        regionId = region.id;

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("gives each tenant its own sales channel and publishable key", () => {
        expect(a.tenant.sales_channel.id).toMatch(/^sc_/);
        expect(b.tenant.sales_channel.id).toMatch(/^sc_/);
        expect(a.tenant.sales_channel.id).not.toBe(b.tenant.sales_channel.id);

        expect(a.publishableKey.token).toMatch(/^pk_/);
        expect(b.publishableKey.token).toMatch(/^pk_/);
        expect(a.publishableKey.id).toBe(a.tenant.api_key.id);
        expect(b.publishableKey.id).toBe(b.tenant.api_key.id);

        // The channel and the key are links, not columns of the tenant row.
        expect(a.tenant).not.toHaveProperty("sales_channel_id");
        expect(a.tenant).not.toHaveProperty("publishable_api_key_id");
      });

      it("reports the tenant behind the token on GET /tenants/me", async () => {
        const me = await api.get("/tenants/me", bearer(a.token));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.email).toBe("admin@acme.test");
        expect(me.data.tenant_admin.tenant.id).toBe(a.tenant.id);
      });

      it("reads the tenant's sales channel and publishable key through the links on GET /tenants/me", async () => {
        const me = await api.get("/tenants/me", bearer(a.token));
        expect(me.status).toBe(200);
        const tenant = me.data.tenant_admin.tenant;
        expect(tenant.sales_channel.id).toBe(a.tenant.sales_channel.id);
        expect(tenant.api_key.id).toBe(a.publishableKey.id);
        expect(tenant.api_key.token).toBe(a.publishableKey.token);
        expect(tenant).not.toHaveProperty("sales_channel_id");
        expect(tenant).not.toHaveProperty("publishable_api_key_id");
      });

      it("loses the link, not the tenant, when the sales channel is deleted", async () => {
        // Medusa's own workflow removes the link with the channel (removeRemoteLinkStep);
        // a text column would have kept the dead id and every read would dereference it.
        const container = getContainer();
        await deleteSalesChannelsWorkflow(container).run({
          input: { ids: [b.tenant.sales_channel.id] },
        });

        const me = await api.get("/tenants/me", bearer(b.token));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.tenant.id).toBe(b.tenant.id);
        expect(me.data.tenant_admin.tenant.sales_channel ?? null).toBeNull();

        // And the one write that needs the channel says so instead of publishing into nothing.
        const refused = await api
          .post("/tenants/products", productBody("Globex orphan"), bearer(b.token))
          .catch((error) => error.response);
        expect(refused.status).toBe(400);
      });

      it("refuses a registration token that already belongs to a tenant admin", async () => {
        const again = await api
          .post(
            "/tenants",
            { name: "Acme 2", handle: "acme-2", admin: { email: "admin@acme.test" } },
            bearer(a.token),
          )
          .catch((error) => error.response);
        expect(again.status).toBe(400);
      });

      it("creates each tenant's product inside its own sales channel", async () => {
        const createdA = await api.post("/tenants/products", productBody("Acme shirt"), bearer(a.token));
        expect(createdA.status).toBe(201);
        expect(createdA.data.product.sales_channels.map((sc) => sc.id)).toEqual([
          a.tenant.sales_channel.id,
        ]);

        const createdB = await api.post("/tenants/products", productBody("Globex mug"), bearer(b.token));
        expect(createdB.status).toBe(201);
        expect(createdB.data.product.sales_channels.map((sc) => sc.id)).toEqual([
          b.tenant.sales_channel.id,
        ]);
      });

      it("ignores foreign sales channels sent in the product body", async () => {
        const smuggled = await api.post(
          "/tenants/products",
          { ...productBody("Acme smuggled"), sales_channels: [{ id: b.tenant.sales_channel.id }] },
          bearer(a.token),
        );
        expect(smuggled.status).toBe(201);
        expect(smuggled.data.product.sales_channels.map((sc) => sc.id)).toEqual([
          a.tenant.sales_channel.id,
        ]);
      });

      it("lists only the tenant's own products on GET /tenants/products", async () => {
        const productA = await createProduct(a, "Acme shirt");
        const productB = await createProduct(b, "Globex mug");

        const listA = await api.get("/tenants/products", bearer(a.token));
        const listB = await api.get("/tenants/products", bearer(b.token));
        expect(listA.status).toBe(200);
        expect(listB.status).toBe(200);

        const idsA = listA.data.products.map((p) => p.id);
        const idsB = listB.data.products.map((p) => p.id);

        expect(idsA).toContain(productA.id);
        expect(idsA).not.toContain(productB.id);
        expect(idsB).toEqual([productB.id]);
        expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
      });

      it("shows each storefront key only its own catalog on GET /store/products", async () => {
        const productA = await createProduct(a, "Acme shirt");
        const productB = await createProduct(b, "Globex mug");

        const storeA = await api.get("/store/products", {
          headers: { "x-publishable-api-key": a.publishableKey.token },
        });
        const storeB = await api.get("/store/products", {
          headers: { "x-publishable-api-key": b.publishableKey.token },
        });
        expect(storeA.status).toBe(200);
        expect(storeB.status).toBe(200);

        const idsA = storeA.data.products.map((p) => p.id);
        const idsB = storeB.data.products.map((p) => p.id);
        expect(idsA).toContain(productA.id);
        expect(idsA).not.toContain(productB.id);
        expect(idsB).toEqual([productB.id]);
      });

      it("refuses a line item whose variant is not sold in the cart's sales channel", async () => {
        const productA = await createProduct(a, "Acme shirt");
        const productB = await createProduct(b, "Globex mug");

        const cart = await api.post("/store/carts", { region_id: regionId }, storeKey(a));
        expect(cart.status).toBe(200);
        const cartId = cart.data.cart.id;

        const own = await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: productA.variants[0].id, quantity: 1 },
          storeKey(a),
        );
        expect(own.status).toBe(200);
        expect(own.data.cart.items).toHaveLength(1);

        const foreign = await api
          .post(
            `/store/carts/${cartId}/line-items`,
            { variant_id: productB.variants[0].id, quantity: 1 },
            storeKey(a),
          )
          .catch((error) => error.response);
        expect(foreign.status).toBe(400);

        const after = await api.get(`/store/carts/${cartId}?fields=id,*items`, storeKey(a));
        expect(after.data.cart.items.map((item) => item.variant_id)).toEqual([
          productA.variants[0].id,
        ]);
      });

      it("refuses a cart created with a foreign variant in its items", async () => {
        const productB = await createProduct(b, "Globex mug");

        const rejected = await api
          .post(
            "/store/carts",
            { region_id: regionId, items: [{ variant_id: productB.variants[0].id, quantity: 1 }] },
            storeKey(a),
          )
          .catch((error) => error.response);
        expect(rejected.status).toBe(400);
      });

      it("resolves shipping options only from the tenant's own warehouse", async () => {
        const productA = await createProduct(a, "Acme shirt");

        const cart = await api.post("/store/carts", { region_id: regionId }, storeKey(a));
        const cartId = cart.data.cart.id;
        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: productA.variants[0].id, quantity: 1 },
          storeKey(a),
        );

        const options = await api.get(`/store/shipping-options?cart_id=${cartId}`, storeKey(a));
        expect(options.status).toBe(200);

        const ids: string[] = options.data.shipping_options.map((option) => option.id);
        const own = await shippingOptionIdsOf(a);
        const foreign = await shippingOptionIdsOf(b);

        // Every option the cart resolved comes from Acme's warehouse; none from
        // Globex's, and the two warehouses share no option at all.
        expect(ids.length).toBeGreaterThan(0);
        expect(own).toEqual(expect.arrayContaining(ids));
        expect(ids.filter((id) => foreign.includes(id))).toEqual([]);
        expect(own.filter((id) => foreign.includes(id))).toEqual([]);

        // And the buyer is never shown the shop's own name as the method's name
        // (the defect `default-method-names.ts` was written for).
        const names: string[] = options.data.shipping_options.map((option) => option.name);
        expect(names.some((name) => name.includes("Acme") || name.includes("Globex"))).toBe(
          false,
        );
      });

      it("keeps two tenants' warehouses apart even in the same city", async () => {
        const container = getContainer();
        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        // Each tenant's channel resolves to exactly one stock location: its own.
        const locationsOf = async (tenant: Registered): Promise<{ id: string; name: string }[]> => {
          const { data: channels } = await query.graph({
            entity: "sales_channel",
            fields: ["id", "stock_locations.id", "stock_locations.name"],
            filters: { id: tenant.tenant.sales_channel.id },
          });
          return (channels[0]?.stock_locations ?? [])
            .map((location) => ({ id: location?.id as string, name: location?.name as string }))
            .filter((location) => Boolean(location.id));
        };

        const locationsA = await locationsOf(a);
        const locationsB = await locationsOf(b);
        expect(locationsA).toHaveLength(1);
        expect(locationsB).toHaveLength(1);
        expect(locationsA[0].id).not.toBe(locationsB[0].id);

        // Same-named, same-city warehouses would still not share: isolation is
        // the channel link, not the location name or address.
        const stockLocation = container.resolve(Modules.STOCK_LOCATION);
        await stockLocation.updateStockLocations(locationsA[0].id, { name: "Москва" });
        await stockLocation.updateStockLocations(locationsB[0].id, { name: "Москва" });

        const productA = await createProduct(a, "Acme shirt");
        const cart = await api.post("/store/carts", { region_id: regionId }, storeKey(a));
        const cartId = cart.data.cart.id;
        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: productA.variants[0].id, quantity: 1 },
          storeKey(a),
        );
        const options = await api.get(`/store/shipping-options?cart_id=${cartId}`, storeKey(a));
        // Both warehouses are now called «Москва», so only the ids can tell them
        // apart — which is the point: isolation is the channel link, not a name.
        const ids: string[] = options.data.shipping_options.map((option) => option.id);
        const own = await shippingOptionIdsOf(a);
        const foreign = await shippingOptionIdsOf(b);
        expect(ids.length).toBeGreaterThan(0);
        expect(own).toEqual(expect.arrayContaining(ids));
        expect(ids.filter((id) => foreign.includes(id))).toEqual([]);
      });

      it("links an order placed in tenant A's sales channel to tenant A only", async () => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "shopper@example.com",
            sales_channel_id: a.tenant.sales_channel.id,
            items: [{ title: "Acme shirt", quantity: 1, unit_price: 10 }],
          },
        });
        const { result: link } = await linkOrderToTenantWorkflow(container).run({
          input: { order_id: order.id },
        });
        expect(link).toEqual({ tenant_id: a.tenant.id, linked: true });

        // A second run finds the link and does not duplicate it.
        const { result: again } = await linkOrderToTenantWorkflow(container).run({
          input: { order_id: order.id },
        });
        expect(again).toEqual({ tenant_id: a.tenant.id, linked: false });

        const ordersA = await api.get("/tenants/orders", bearer(a.token));
        const ordersB = await api.get("/tenants/orders", bearer(b.token));
        expect(ordersA.status).toBe(200);
        expect(ordersB.status).toBe(200);
        expect(ordersA.data.orders.map((o) => o.id)).toEqual([order.id]);
        expect(ordersB.data.orders).toEqual([]);
      });

      it("leaves an order from a sales channel no tenant owns unlinked", async () => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "staff@example.com",
            items: [{ title: "Staff item", quantity: 1, unit_price: 5 }],
          },
        });

        const { result } = await linkOrderToTenantWorkflow(container).run({
          input: { order_id: order.id },
        });
        expect(result).toEqual({ tenant_id: null, linked: false });

        // The snapshot holds no orders, so an unowned order must leave A's list empty.
        const ordersA = await api.get("/tenants/orders", bearer(a.token));
        expect(ordersA.data.orders.map((o) => o.id)).not.toContain(order.id);
        expect(ordersA.data.orders).toEqual([]);
      });

      it("rejects /tenants/* without a tenant token", async () => {
        const anonymous = await api.get("/tenants/products").catch((error) => error.response);
        expect(anonymous.status).toBe(401);

        const customerRegistration = await api.post("/auth/customer/emailpass/register", {
          email: "shopper@example.com",
          password: PASSWORD,
        });
        const asCustomer = await api
          .get("/tenants/products", bearer(customerRegistration.data.token))
          .catch((error) => error.response);
        expect(asCustomer.status).toBe(401);
      });
      /**
       * Everything below reads the `/tenants/*` routes the tenant panel is
       * written against. The panel renders the Medusa Admin's own screen files,
       * so these assert the Admin's list shape (`count`, `offset`, `limit`
       * beside the plural key) as much as they assert the isolation.
       */

      const placeOrder = async (owner: Registered, title: string) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "shopper@example.com",
            sales_channel_id: owner.tenant.sales_channel.id,
            items: [{ title, quantity: 1, unit_price: 10 }],
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });
        return order;
      };

      it("answers GET /tenants/products in the Admin's list shape", async () => {
        await createProduct(a, "Acme shirt");
        await createProduct(a, "Acme mug");

        const page = await api.get("/tenants/products?limit=1&offset=0", bearer(a.token));
        expect(page.status).toBe(200);
        expect(page.data.products).toHaveLength(1);
        // `count` is the total behind the page, not the size of the page.
        expect(page.data.count).toBe(2);
        expect(page.data.offset).toBe(0);
        expect(page.data.limit).toBe(1);

        const second = await api.get("/tenants/products?limit=1&offset=1", bearer(a.token));
        expect(second.data.count).toBe(2);
        expect(second.data.offset).toBe(1);
        expect(second.data.products[0].id).not.toBe(page.data.products[0].id);
      });

      it("filters GET /tenants/products by q and narrows it by fields", async () => {
        await createProduct(a, "Acme shirt");
        await createProduct(a, "Acme mug");

        const filtered = await api.get("/tenants/products?q=shirt", bearer(a.token));
        expect(filtered.status).toBe(200);
        expect(filtered.data.count).toBe(1);
        expect(filtered.data.products[0].title).toBe("Acme shirt");

        const narrowed = await api.get("/tenants/products?fields=id,title", bearer(a.token));
        expect(narrowed.status).toBe(200);
        expect(Object.keys(narrowed.data.products[0]).sort()).toEqual(["id", "title"]);
      });

      it("shows tenant B an empty page on GET /tenants/products, not the whole catalog", async () => {
        await createProduct(a, "Acme shirt");

        const listB = await api.get("/tenants/products", bearer(b.token));
        expect(listB.status).toBe(200);
        expect(listB.data.products).toEqual([]);
        // The isolation guarantee: an `id` filter narrowed to nothing must not
        // become an absent filter, which is no filter at all.
        expect(listB.data.count).toBe(0);
        expect(listB.data.offset).toBe(0);
      });

      it("answers 404 on another tenant's product for GET and DELETE", async () => {
        const productA = await createProduct(a, "Acme shirt");

        const readByB = await api
          .get(`/tenants/products/${productA.id}`, bearer(b.token))
          .catch((error) => error.response);
        expect(readByB.status).toBe(404);

        const deleteByB = await api
          .delete(`/tenants/products/${productA.id}`, bearer(b.token))
          .catch((error) => error.response);
        expect(deleteByB.status).toBe(404);

        // A foreign id is answered exactly like a missing one, and deletes nothing.
        const missing = await api
          .get("/tenants/products/prod_does_not_exist", bearer(b.token))
          .catch((error) => error.response);
        expect(missing.status).toBe(404);

        const readByOwner = await api.get(`/tenants/products/${productA.id}`, bearer(a.token));
        expect(readByOwner.status).toBe(200);
        expect(readByOwner.data.product.id).toBe(productA.id);
      });

      it("deletes the tenant's own product on DELETE /tenants/products/:id", async () => {
        const productA = await createProduct(a, "Acme shirt");

        const deleted = await api.delete(`/tenants/products/${productA.id}`, bearer(a.token));
        expect(deleted.status).toBe(200);
        expect(deleted.data).toEqual({ id: productA.id, object: "product", deleted: true });

        const after = await api.get("/tenants/products", bearer(a.token));
        expect(after.data.count).toBe(0);
        expect(after.data.products).toEqual([]);
      });

      it("answers GET /tenants/orders in the Admin's list shape", async () => {
        await placeOrder(a, "Acme shirt");
        await placeOrder(a, "Acme mug");

        const page = await api.get("/tenants/orders?limit=1", bearer(a.token));
        expect(page.status).toBe(200);
        expect(page.data.orders).toHaveLength(1);
        expect(page.data.count).toBe(2);
        expect(page.data.offset).toBe(0);
        expect(page.data.limit).toBe(1);

        // `getOrdersListWorkflow` computes statuses and totals on top of the
        // selection, so `fields` narrows what is read, not what is derived.
        const narrowed = await api.get("/tenants/orders?fields=id,status", bearer(a.token));
        expect(narrowed.data.orders[0]).toHaveProperty("id");
        expect(narrowed.data.orders[0]).toHaveProperty("status");
        expect(narrowed.data.orders[0]).not.toHaveProperty("email");
      });

      it("shows tenant B an empty page on GET /tenants/orders", async () => {
        await placeOrder(a, "Acme shirt");

        const listB = await api.get("/tenants/orders?limit=20", bearer(b.token));
        expect(listB.status).toBe(200);
        expect(listB.data.orders).toEqual([]);
        expect(listB.data.count).toBe(0);
        expect(listB.data.limit).toBe(20);
      });

      it("lists only the tenant's own channel on GET /tenants/sales-channels", async () => {
        const listA = await api.get("/tenants/sales-channels", bearer(a.token));
        expect(listA.status).toBe(200);
        expect(listA.data.count).toBe(1);
        expect(listA.data.offset).toBe(0);
        expect(listA.data.sales_channels.map((channel) => channel.id)).toEqual([
          a.tenant.sales_channel.id,
        ]);

        const listB = await api.get("/tenants/sales-channels", bearer(b.token));
        expect(listB.data.sales_channels.map((channel) => channel.id)).toEqual([
          b.tenant.sales_channel.id,
        ]);

        // An id the tenant does not own narrows the page to nothing rather
        // than widening it back to every channel on the backend.
        const foreignFilter = await api.get(
          `/tenants/sales-channels?id=${a.tenant.sales_channel.id}`,
          bearer(b.token),
        );
        expect(foreignFilter.data.count).toBe(0);
        expect(foreignFilter.data.sales_channels).toEqual([]);
      });

      it("answers 404 on another tenant's sales channel", async () => {
        const own = await api.get(
          `/tenants/sales-channels/${a.tenant.sales_channel.id}`,
          bearer(a.token),
        );
        expect(own.status).toBe(200);
        expect(own.data.sales_channel.id).toBe(a.tenant.sales_channel.id);

        const foreign = await api
          .get(`/tenants/sales-channels/${a.tenant.sales_channel.id}`, bearer(b.token))
          .catch((error) => error.response);
        expect(foreign.status).toBe(404);
      });

      it("carries the tenant's name and channel on GET /tenants/store", async () => {
        const storeA = await api.get("/tenants/store", bearer(a.token));
        expect(storeA.status).toBe(200);
        expect(storeA.data.store.name).toBe("Acme");
        expect(storeA.data.store.default_sales_channel_id).toBe(a.tenant.sales_channel.id);
        expect(Array.isArray(storeA.data.store.supported_currencies)).toBe(true);

        const storeB = await api.get("/tenants/store", bearer(b.token));
        expect(storeB.data.store.name).toBe("Globex");
        expect(storeB.data.store.default_sales_channel_id).toBe(b.tenant.sales_channel.id);
        // One store row underneath: the two tenants differ in what they are
        // told about it, not in which row they read.
        expect(storeB.data.store.id).toBe(storeA.data.store.id);
      });

      it("lists only the options of the tenant's own products on GET /tenants/product-options", async () => {
        await createProduct(a, "Acme shirt");

        const globexProduct = await api.post(
          "/tenants/products",
          {
            ...productBody("Globex mug"),
            options: [{ title: "Material", values: ["Clay"] }],
            variants: [
              {
                title: "Globex mug",
                prices: [{ currency_code: "eur", amount: 10 }],
                manage_inventory: false,
                options: { Material: "Clay" },
              },
            ],
          },
          bearer(b.token),
        );
        expect(globexProduct.status).toBe(201);

        const listA = await api.get("/tenants/product-options", bearer(a.token));
        expect(listA.status).toBe(200);
        expect(listA.data.offset).toBe(0);
        const titlesA = listA.data.product_options.map((option) => option.title);
        expect(titlesA).toContain("Color");
        expect(titlesA).not.toContain("Material");
        expect(listA.data.count).toBe(listA.data.product_options.length);

        const listB = await api.get("/tenants/product-options", bearer(b.token));
        expect(listB.data.product_options.map((option) => option.title)).toEqual(["Material"]);

        // `product_id` narrows within the tenant's own products; another
        // tenant's product id narrows it to nothing.
        const foreign = await api.get(
          `/tenants/product-options?product_id=${globexProduct.data.product.id}`,
          bearer(a.token),
        );
        expect(foreign.data.count).toBe(0);
        expect(foreign.data.product_options).toEqual([]);
      });

      it("lists only the inventory items of the tenant's own variants", async () => {
        const stocked = await api.post(
          "/tenants/products",
          {
            ...productBody("Acme stocked shirt"),
            variants: [
              {
                title: "Acme stocked shirt",
                sku: "acme-stocked-shirt",
                prices: [{ currency_code: "eur", amount: 10 }],
                manage_inventory: true,
                options: { Color: "Blue" },
              },
            ],
          },
          bearer(a.token),
        );
        expect(stocked.status).toBe(201);

        const listA = await api.get("/tenants/inventory-items?limit=20", bearer(a.token));
        expect(listA.status).toBe(200);
        expect(listA.data.count).toBeGreaterThan(0);
        expect(listA.data.inventory_items.length).toBe(listA.data.count);
        expect(listA.data.offset).toBe(0);
        expect(listA.data.limit).toBe(20);

        const listB = await api.get("/tenants/inventory-items?limit=20", bearer(b.token));
        expect(listB.data.count).toBe(0);
        expect(listB.data.inventory_items).toEqual([]);
      });

      /**
       * The reference lists are global data (catalog taxonomy and store
       * configuration every storefront already shows), so there is nothing to
       * scope. What the panel needs from them is the Admin's list shape.
       *
       * `/tenants/product-categories` left this list in wave 2, piece 5: it is
       * now scoped to the tenant-product-category link and is covered by
       * `tenants-categories.spec.ts`.
       */
      it.each([
        ["/tenants/regions", "regions"],
        ["/tenants/price-preferences", "price_preferences"],
        ["/tenants/product-types", "product_types"],
        ["/tenants/product-tags", "product_tags"],
        ["/tenants/collections", "collections"],
        ["/tenants/shipping-profiles", "shipping_profiles"],
      ])("answers GET %s in the Admin's list shape", async (path, key) => {
        const response = await api.get(`${path}?limit=1&offset=0`, bearer(a.token));
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data[key])).toBe(true);
        expect(typeof response.data.count).toBe("number");
        expect(response.data.offset).toBe(0);
        expect(response.data.limit).toBe(1);
        expect(response.data[key].length).toBeLessThanOrEqual(1);

        const anonymous = await api.get(path).catch((error) => error.response);
        expect(anonymous.status).toBe(401);
      });

    });
  },
});
