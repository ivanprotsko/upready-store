import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createOrdersWorkflow,
  createRegionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

jest.setTimeout(180_000);

type Registered = {
  token: string;
  tenant: {
    id: string;
    handle: string;
    sales_channel: { id: string; name: string };
    api_key: { id: string; token: string };
  };
};

const PASSWORD = "supersecret";
const CUSTOMER_PASSWORD = "supersecret-customer";

/**
 * Seam test of what a caller can expand through `?fields=` (architecture review
 * 2026-09-21, finding T-6). Medusa hands the requested fields to the query
 * engine, and the engine follows every module link, so a field list is a way
 * out of the shop unless something closes it. Each case below answered with
 * data on the two-shop stand before `api/field-guard.ts` existed.
 *
 * Sibling of `store-order-isolation.spec.ts`, same runner facts: `DB_HOST` must
 * be the literal `localhost`, and the database is restored before every test.
 */
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("fields: a caller cannot expand a relation that leaves the shop", () => {
      let regionId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeHeaders = (
        owner: Registered,
        customerToken?: string,
        orderToken?: string,
      ) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(customerToken ? { authorization: `Bearer ${customerToken}` } : {}),
          ...(orderToken ? { "x-order-token": orderToken } : {}),
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
        return { token: login.data.token, tenant: created.data.tenant };
      };

      const registerCustomer = async (owner: Registered, email: string) => {
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: CUSTOMER_PASSWORD },
          { headers: { "x-publishable-api-key": owner.tenant.api_key.token } },
        );
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "Buyer" },
          {
            headers: {
              "x-publishable-api-key": owner.tenant.api_key.token,
              authorization: `Bearer ${registration.data.token}`,
            },
          },
        );
        expect(created.status).toBe(200);
        const login = await api.post(
          "/auth/customer/emailpass",
          { email, password: CUSTOMER_PASSWORD },
          { headers: { "x-publishable-api-key": owner.tenant.api_key.token } },
        );
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      /** An order in `owner`'s shop, on `customerId` when one is given. */
      const placeOrder = async (
        owner: Registered,
        email: string,
        title: string,
        customerId?: string,
      ) => {
        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "eur",
            email,
            ...(customerId ? { customer_id: customerId } : {}),
            sales_channel_id: owner.tenant.sales_channel.id,
            items: [{ title, quantity: 1, unit_price: 10 }],
            shipping_address: {
              first_name: "Test",
              last_name: "Shopper",
              address_1: "1 Test street",
              city: "Berlin",
              country_code: "de",
              postal_code: "10115",
              phone: "+491700000000",
            },
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });
        return order;
      };

      beforeAll(async () => {
        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      const newProduct = (title: string) => ({
        title,
        status: "published",
        options: [{ title: "Color", values: ["Blue"] }],
        variants: [
          {
            title,
            prices: [{ currency_code: "eur", amount: 100 }],
            manage_inventory: false,
            options: { Color: "Blue" },
          },
        ],
      });

      it("keeps the tenant row, its admins and its notification settings from a visitor", async () => {
        await api.post("/tenants/products", newProduct("Acme lamp"), bearer(a.token));

        for (const fields of [
          "id,*tenant,*tenant.admins,*tenant.requisites",
          "id,*tenant.notification_settings",
          "id,*sales_channels.tenant.admins",
          "id,tenant.admins.email",
          "id,tenant",
        ]) {
          const listed = await api.get(
            `/store/products?limit=1&fields=${encodeURIComponent(fields)}`,
            storeHeaders(a),
          );
          expect(listed.status).toBe(200);
          expect(listed.data.products).toHaveLength(1);
          const text = JSON.stringify(listed.data);
          expect(text).not.toContain("admin@acme.test");
          expect(text).not.toContain("link_code");
          expect(listed.data.products[0].tenant ?? null).toBeNull();
        }
      });

      it("still expands what the storefront asks for on a product", async () => {
        await api.post("/tenants/products", newProduct("Acme lamp"), bearer(a.token));
        const listed = await api.get(
          `/store/products?limit=1&region_id=${regionId}&fields=${encodeURIComponent(
            "*variants.calculated_price,*variants.options,+options.values.metadata,*categories",
          )}`,
          storeHeaders(a),
        );
        expect(listed.status).toBe(200);
        const [product] = listed.data.products;
        expect(product.variants[0].calculated_price.calculated_amount).toBe(100);
        expect(product.variants[0].options[0].value).toBe("Blue");
        expect(product.categories).toEqual([]);
      });

      it("keeps the buyer's orders in other shops from a shop owner", async () => {
        const buyer = await registerCustomer(a, "buyer@example.com");
        const inA = await placeOrder(a, "buyer@example.com", "Acme shirt", buyer.id);
        const inB = await placeOrder(b, "buyer@example.com", "Globex shirt", buyer.id);

        const read = await api.get(
          `/tenants/orders/${inA.id}?fields=${encodeURIComponent("id,*customer,*customer.orders")}`,
          bearer(a.token),
        );
        expect(read.status).toBe(200);
        expect(read.data.order.id).toBe(inA.id);
        expect(read.data.order.customer.email).toBe("buyer@example.com");
        expect(read.data.order.customer.orders).toBeUndefined();
        expect(JSON.stringify(read.data)).not.toContain(inB.id);
      });

      it("keeps the shipping options of other shops behind the shared shipping profile", async () => {
        await api.post("/tenants/products", newProduct("Acme lamp"), bearer(a.token));
        const ofB = await api.get("/tenants/shipping-options?limit=200&fields=id", bearer(b.token));
        const foreign: string[] = ofB.data.shipping_options.map((option: { id: string }) => option.id);
        expect(foreign.length).toBeGreaterThan(0);

        const visitor = await api.get(
          `/store/products?fields=${encodeURIComponent("id,*shipping_profile,*shipping_profile.shipping_options")}`,
          storeHeaders(a),
        );
        expect(visitor.status).toBe(200);
        expect(visitor.data.products).toHaveLength(1);
        foreign.forEach((id) => expect(JSON.stringify(visitor.data)).not.toContain(id));

        // The same walk from a route whose own rows are shared.
        const owner = await api.get(
          `/tenants/shipping-profiles?fields=${encodeURIComponent("id,name,*shipping_options")}`,
          bearer(a.token),
        );
        expect(owner.status).toBe(200);
        expect(owner.data.shipping_profiles.length).toBeGreaterThan(0);
        foreign.forEach((id) => expect(JSON.stringify(owner.data)).not.toContain(id));
      });

      it("keeps the products of other shops, drafts included, behind a shared collection", async () => {
        const products = getContainer().resolve(Modules.PRODUCT);
        const collection = await products.createProductCollections({ title: "Shared", handle: "shared" });
        const ofA = await api.post("/tenants/products", newProduct("Acme lamp"), bearer(a.token));
        const ofB = await api.post(
          "/tenants/products",
          { ...newProduct("Globex secret"), status: "draft" },
          bearer(b.token),
        );
        for (const id of [ofA.data.product.id, ofB.data.product.id]) {
          await products.updateProducts(id, { collection_id: collection.id });
        }

        for (const path of ["/store/collections?handle=shared&", `/store/collections/${collection.id}?`]) {
          const read = await api.get(`${path}fields=${encodeURIComponent("id,title,*products")}`, storeHeaders(a));
          expect(read.status).toBe(200);
          expect(JSON.stringify(read.data)).toContain(collection.id);
          expect(JSON.stringify(read.data)).not.toContain(ofB.data.product.id);
        }
      });

      it("keeps an address the buyer entered in another shop from a shop owner", async () => {
        const buyer = await registerCustomer(a, "buyer@example.com");
        const inA = await placeOrder(a, "buyer@example.com", "Acme shirt", buyer.id);
        const added = await api.post(
          "/store/customers/me/addresses",
          { first_name: "Test", last_name: "Buyer", address_1: "7 Only In Globex", city: "Berlin", country_code: "de" },
          storeHeaders(b, buyer.token),
        );
        expect(added.status).toBe(200);

        const order = await api.get(
          `/tenants/orders/${inA.id}?fields=${encodeURIComponent("id,*customer,*customer.addresses,customer.addresses")}`,
          bearer(a.token),
        );
        expect(order.status).toBe(200);
        expect(order.data.order.customer.email).toBe("buyer@example.com");
        expect(JSON.stringify(order.data)).not.toContain("Only In Globex");

        const customer = await api.get(
          `/tenants/customers/${buyer.id}?fields=${encodeURIComponent("id,email,*addresses")}`,
          bearer(a.token),
        );
        expect(customer.status).toBe(200);
        expect(customer.data.customer.email).toBe("buyer@example.com");
        expect(JSON.stringify(customer.data)).not.toContain("Only In Globex");
      });

      it("keeps the tenant row behind a product of the panel", async () => {
        const created = await api.post("/tenants/products", newProduct("Acme lamp"), bearer(a.token));
        const read = await api.get(
          `/tenants/products/${created.data.product.id}?fields=${encodeURIComponent(
            "id,*sales_channels.tenant.admins,*variants",
          )}`,
          bearer(a.token),
        );
        expect(read.status).toBe(200);
        expect(read.data.product.variants).toHaveLength(1);
        expect(JSON.stringify(read.data)).not.toContain("admin@acme.test");
      });
    });
  },
});
