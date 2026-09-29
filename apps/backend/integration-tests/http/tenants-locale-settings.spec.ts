import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant's language/currency defaults (t06-locale-currency):
 * the write and read on `/tenants/locale-settings`, the ways a document is
 * refused, and the field's arrival in the storefront's own bootstrap call,
 * `GET /storefront/by-host`.
 *
 * Sibling of `tenants-home.spec.ts`, same runner facts: the database is
 * restored from its post-`beforeAll` snapshot before every test, and
 * `DB_HOST` must be the literal `localhost` or the runner forces SSL and
 * nothing connects at all.
 */
type Tenant = {
  id: string;
  handle: string;
  api_key: { id: string; token: string };
};

type Registered = {
  token: string;
  tenant: Tenant;
};

const PASSWORD = "supersecret-owner";

const document = (overrides: Record<string, unknown> = {}) => ({
  default_locale: "ru",
  enabled_locales: ["ru", "en"],
  default_country: "ru",
  ...overrides,
});

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: locale settings", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

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

        return { token: login.data.token, tenant: created.data.tenant };
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("answers null before anything is saved", async () => {
        const read = await api.get("/tenants/locale-settings", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.locale_settings).toBeNull();
      });

      it("refuses an anonymous call", async () => {
        const anonymous = await failed(api.get("/tenants/locale-settings"));
        expect(anonymous.status).toBe(401);
      });

      it("saves a document and reads it back", async () => {
        const saved = await api.put("/tenants/locale-settings", document(), bearer(a.token));
        expect(saved.status).toBe(200);
        expect(saved.data.locale_settings).toEqual(document());

        const read = await api.get("/tenants/locale-settings", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.locale_settings).toEqual(document());
      });

      it("overwrites the one row rather than adding a second", async () => {
        const first = await api.put("/tenants/locale-settings", document(), bearer(a.token));
        expect(first.status).toBe(200);

        const second = await api.put(
          "/tenants/locale-settings",
          document({ default_locale: "en", enabled_locales: ["en", "ru"], default_country: "us" }),
          bearer(a.token),
        );
        expect(second.status).toBe(200);

        const read = await api.get("/tenants/locale-settings", bearer(a.token));
        expect(read.data.locale_settings.default_locale).toBe("en");
        expect(read.data.locale_settings.default_country).toBe("us");
      });

      it("refuses a locale code the storefront does not ship with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/locale-settings",
            document({ default_locale: "xx", enabled_locales: ["xx"] }),
            bearer(a.token),
          ),
        );
        expect(rejected.status).toBe(400);
      });

      it("refuses enabled_locales that omits default_locale with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/locale-settings",
            document({ default_locale: "de", enabled_locales: ["ru", "en"] }),
            bearer(a.token),
          ),
        );
        expect(rejected.status).toBe(400);
      });

      it("refuses an empty enabled_locales with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/locale-settings",
            document({ default_locale: "ru", enabled_locales: [] }),
            bearer(a.token),
          ),
        );
        expect(rejected.status).toBe(400);
      });

      it("refuses a repeated locale in enabled_locales with 400", async () => {
        const rejected = await failed(
          api.put(
            "/tenants/locale-settings",
            document({ enabled_locales: ["ru", "en", "ru"] }),
            bearer(a.token),
          ),
        );
        expect(rejected.status).toBe(400);
      });

      it("accepts a null default_country (no currency override)", async () => {
        const saved = await api.put(
          "/tenants/locale-settings",
          document({ default_country: null }),
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.locale_settings.default_country).toBeNull();
      });

      it("keeps B's document null after A saved its own", async () => {
        const saved = await api.put("/tenants/locale-settings", document(), bearer(a.token));
        expect(saved.status).toBe(200);

        const mine = await api.get("/tenants/locale-settings", bearer(b.token));
        expect(mine.status).toBe(200);
        expect(mine.data.locale_settings).toBeNull();
      });

      it("surfaces the saved document on the storefront's by-host bootstrap", async () => {
        const saved = await api.put(
          "/tenants/locale-settings",
          document({ default_locale: "ru", enabled_locales: ["ru", "en"], default_country: "ru" }),
          bearer(a.token),
        );
        expect(saved.status).toBe(200);

        const resolved = await api.get("/storefront/by-host?host=acme.localhost");
        expect(resolved.status).toBe(200);
        expect(resolved.data.locale).toEqual({
          default_locale: "ru",
          enabled_locales: ["ru", "en"],
          default_country: "ru",
        });
      });

      it("is null on by-host for a tenant that never saved locale settings", async () => {
        const resolved = await api.get("/storefront/by-host?host=globex.localhost");
        expect(resolved.status).toBe(200);
        expect(resolved.data.locale).toBeNull();
      });
    });
  },
});
