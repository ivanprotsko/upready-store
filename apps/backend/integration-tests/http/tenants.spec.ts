import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createOrdersWorkflow, createRegionsWorkflow } from "@medusajs/medusa/core-flows";
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
  sales_channel_id: string;
  publishable_api_key_id: string;
};

type Registered = {
  token: string;
  tenant: Tenant;
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
          publishableKey: created.data.publishable_api_key,
        };
      };

      const createProduct = async (owner: Registered, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string; sales_channels: { id: string }[] };
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
        expect(a.tenant.sales_channel_id).toMatch(/^sc_/);
        expect(b.tenant.sales_channel_id).toMatch(/^sc_/);
        expect(a.tenant.sales_channel_id).not.toBe(b.tenant.sales_channel_id);

        expect(a.publishableKey.token).toMatch(/^pk_/);
        expect(b.publishableKey.token).toMatch(/^pk_/);
        expect(a.publishableKey.id).toBe(a.tenant.publishable_api_key_id);
        expect(b.publishableKey.id).toBe(b.tenant.publishable_api_key_id);
      });

      it("reports the tenant behind the token on GET /tenants/me", async () => {
        const me = await api.get("/tenants/me", bearer(a.token));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.email).toBe("admin@acme.test");
        expect(me.data.tenant_admin.tenant.id).toBe(a.tenant.id);
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
          a.tenant.sales_channel_id,
        ]);

        const createdB = await api.post("/tenants/products", productBody("Globex mug"), bearer(b.token));
        expect(createdB.status).toBe(201);
        expect(createdB.data.product.sales_channels.map((sc) => sc.id)).toEqual([
          b.tenant.sales_channel_id,
        ]);
      });

      it("ignores foreign sales channels sent in the product body", async () => {
        const smuggled = await api.post(
          "/tenants/products",
          { ...productBody("Acme smuggled"), sales_channels: [{ id: b.tenant.sales_channel_id }] },
          bearer(a.token),
        );
        expect(smuggled.status).toBe(201);
        expect(smuggled.data.product.sales_channels.map((sc) => sc.id)).toEqual([
          a.tenant.sales_channel_id,
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

      it("links an order placed in tenant A's sales channel to tenant A only", async () => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email: "shopper@example.com",
            sales_channel_id: a.tenant.sales_channel_id,
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
    });
  },
});
