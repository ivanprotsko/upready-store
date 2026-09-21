import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

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

const PASSWORD = "supersecret";

/**
 * Seam test of the two delivery lists the panel reads (architecture review
 * 2026-09-21, finding T-5). `GET /tenants/shipping-options` was the Admin's list
 * handler re-exported: on the two-shop stand the owner of one shop listed 486
 * options, two for every warehouse of the deployment, and read the other shop's
 * options with their prices by sending its `stock_location_id`.
 * `GET /tenants/stock-locations` was scoped earlier and is pinned here next to it.
 *
 * Same runner facts as `tenants-home.spec.ts`: `DB_HOST` must be the literal
 * `localhost`, and the database is restored before every test.
 */
medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: delivery lists show one shop its own rows", () => {
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

      const locationsOf = async (owner: Registered) =>
        (await api.get("/tenants/stock-locations?fields=id,name", bearer(owner.token))).data
          .stock_locations as Array<{ id: string; name: string }>;

      const OPTION_FIELDS = "id,name,*prices,service_zone.fulfillment_set.location.id";

      it("lists the shop's own shipping options and nobody else's", async () => {
        const [ownLocation] = await locationsOf(a);
        const [foreignLocation] = await locationsOf(b);
        expect(ownLocation.id).not.toBe(foreignLocation.id);

        const listed = await api.get(
          `/tenants/shipping-options?limit=200&fields=${OPTION_FIELDS}`,
          bearer(a.token),
        );
        expect(listed.status).toBe(200);
        expect(listed.data.shipping_options.length).toBeGreaterThan(0);
        expect(listed.data.count).toBe(listed.data.shipping_options.length);
        const locations = new Set(
          listed.data.shipping_options.map(
            (option: any) => option.service_zone.fulfillment_set.location.id,
          ),
        );
        expect([...locations]).toEqual([ownLocation.id]);
      });

      it("answers with an empty page when the caller names another shop's warehouse", async () => {
        const [ownLocation] = await locationsOf(a);
        const [foreignLocation] = await locationsOf(b);

        const foreign = await api.get(
          `/tenants/shipping-options?stock_location_id=${foreignLocation.id}&fields=${OPTION_FIELDS}`,
          bearer(a.token),
        );
        expect(foreign.status).toBe(200);
        expect(foreign.data.shipping_options).toEqual([]);
        expect(foreign.data.count).toBe(0);

        // The filter the create-fulfillment form sends still narrows the own list.
        const own = await api.get(
          `/tenants/shipping-options?stock_location_id=${ownLocation.id}&fields=${OPTION_FIELDS}`,
          bearer(a.token),
        );
        expect(own.data.shipping_options.length).toBeGreaterThan(0);
      });

      it("lists the shop's own warehouse and refuses another shop's id", async () => {
        const own = await locationsOf(a);
        const [foreignLocation] = await locationsOf(b);
        expect(own).toHaveLength(1);

        const asked = await api.get(
          `/tenants/stock-locations?id=${foreignLocation.id}`,
          bearer(a.token),
        );
        expect(asked.data.stock_locations).toEqual([]);
      });
    });
  },
});
