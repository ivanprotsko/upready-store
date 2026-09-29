import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of the search-console ownership codes (`/tenants/seo-verification`,
 * shipped by t11-seo-redirects; the `GET` and this spec are b10-panel-gaps).
 *
 * The seam worth testing is the one that is easy to break: the codes live in
 * `tenant.metadata` next to the attribution line, the analytics counters and the
 * branding document, and a route that writes `metadata` wholesale wipes whatever
 * it does not know about. So the test writes a code, then writes a counter
 * through a different route, and demands both survive.
 *
 * The public half is `GET /storefront/by-host`, which is what the storefront's
 * `<head>` is built from and which carries no key and no session at all.
 *
 * Runner facts, same as `tenants-domains.spec.ts`: a throwaway database migrated
 * from this repository's config, restored from its post-`beforeAll` snapshot
 * before every test, and `DB_HOST` must be the literal `localhost`.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string } };
};

const PASSWORD = "supersecret-owner";

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: seo verification", () => {
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

      it("needs a tenant token", async () => {
        const anonymous = await failed(api.get("/tenants/seo-verification"));
        expect(anonymous.status).toBe(401);
      });

      it("answers both codes as null before anything is saved", async () => {
        const read = await api.get("/tenants/seo-verification", bearer(a.token));

        expect(read.status).toBe(200);
        expect(read.data.seo_verification).toEqual({ yandex: null, google: null });
      });

      it("saves one code without touching the other, and reads it back", async () => {
        const saved = await api.put(
          "/tenants/seo-verification",
          { yandex: "a1b2c3d4e5f60718" },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.seo_verification).toEqual({
          yandex: "a1b2c3d4e5f60718",
          google: null,
        });

        const both = await api.put(
          "/tenants/seo-verification",
          { google: "QWErty1234567890" },
          bearer(a.token),
        );
        // A body names only what it changes; the Yandex code stays.
        expect(both.data.seo_verification).toEqual({
          yandex: "a1b2c3d4e5f60718",
          google: "QWErty1234567890",
        });

        const read = await api.get("/tenants/seo-verification", bearer(a.token));
        expect(read.data.seo_verification).toEqual({
          yandex: "a1b2c3d4e5f60718",
          google: "QWErty1234567890",
        });
      });

      it("clears a code with an empty string and leaves the other one standing", async () => {
        await api.put(
          "/tenants/seo-verification",
          { yandex: "a1b2c3d4e5f60718", google: "QWErty1234567890" },
          bearer(a.token),
        );

        const cleared = await api.put(
          "/tenants/seo-verification",
          { yandex: "" },
          bearer(a.token),
        );

        expect(cleared.data.seo_verification).toEqual({
          yandex: null,
          google: "QWErty1234567890",
        });
      });

      it("shares tenant.metadata with the analytics route without either wiping the other", async () => {
        await api.put(
          "/tenants/seo-verification",
          { yandex: "a1b2c3d4e5f60718" },
          bearer(a.token),
        );
        await api.put(
          "/tenants/analytics",
          { yandex_metrica_id: "12345678" },
          bearer(a.token),
        );

        const verification = await api.get("/tenants/seo-verification", bearer(a.token));
        const analytics = await api.get("/tenants/analytics", bearer(a.token));

        expect(verification.data.seo_verification.yandex).toBe("a1b2c3d4e5f60718");
        expect(analytics.data.analytics.yandex_metrica_id).toBe("12345678");
      });

      it("keeps the codes to the shop that saved them", async () => {
        await api.put(
          "/tenants/seo-verification",
          { yandex: "only-acme" },
          bearer(a.token),
        );

        const other = await api.get("/tenants/seo-verification", bearer(b.token));
        expect(other.data.seo_verification).toEqual({ yandex: null, google: null });
      });

      it("hands the codes to the storefront resolver, which carries no key and no session", async () => {
        await api.put(
          "/tenants/seo-verification",
          { yandex: "a1b2c3d4e5f60718", google: "QWErty1234567890" },
          bearer(a.token),
        );

        const resolved = await api.get("/storefront/by-host?host=acme.localhost");

        expect(resolved.status).toBe(200);
        expect(resolved.config.headers.authorization).toBeUndefined();
        expect(resolved.config.headers["x-publishable-api-key"]).toBeUndefined();
        expect(resolved.data.seo_verification).toEqual({
          yandex: "a1b2c3d4e5f60718",
          google: "QWErty1234567890",
        });
      });

      it("refuses a field the schema does not know", async () => {
        const refused = await failed(
          api.put("/tenants/seo-verification", { bing: "nope" }, bearer(a.token)),
        );
        expect(refused.status).toBe(400);
      });
    });
  },
});
