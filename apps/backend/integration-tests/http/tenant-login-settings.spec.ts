import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of `/tenants/login-settings` and its enforcement (o25-login-methods):
 * the setting round-trips through `tenant.metadata.buyer_login_method`,
 * defaults to "both" for a shop that never saved one (today's behaviour,
 * unchanged), is isolated per tenant, and is ENFORCED on the buyer-facing auth
 * routes themselves — not only reflected in what the panel shows.
 *
 * The refusal tests need no Yandex environment at all: `gateBuyerYandexAuth`
 * runs before Medusa ever looks up the provider, so an email-only shop is
 * refused on the setting alone. Where a "not refused" path has to prove it
 * reached Medusa's own handler, it asserts the answer is NOT this gate's own
 * message, rather than asserting a specific Yandex outcome — the suite never
 * needs `YANDEX_CLIENT_ID` to mean something (that is `auth-yandex.spec.ts`'s
 * job).
 */

const PASSWORD = "supersecret-owner";
const YANDEX_CALLBACK = "http://localhost:8000/api/yandex-callback";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { token: string } };
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("buyer sign-in methods: email / Yandex ID / both", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const publishable = (token: string) => ({ headers: { "x-publishable-api-key": token } });
      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
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

      it("defaults to \"both\" for a shop that never saved one", async () => {
        const owner = await registerTenant("login-default", "Default");

        const response = await api.get("/tenants/login-settings", bearer(owner.token));
        expect(response.status).toBe(200);
        expect(response.data.login_settings.method).toBe("both");
      });

      it("saves and reads back each of the three methods", async () => {
        const owner = await registerTenant("login-crud", "CRUD");

        for (const method of ["email", "yandex", "both"]) {
          const put = await api.put("/tenants/login-settings", { method }, bearer(owner.token));
          expect(put.status).toBe(200);
          expect(put.data.login_settings.method).toBe(method);

          const get = await api.get("/tenants/login-settings", bearer(owner.token));
          expect(get.data.login_settings.method).toBe(method);
        }
      });

      it("rejects a method outside the three, before it ever reaches the tenant row", async () => {
        const owner = await registerTenant("login-invalid", "Invalid");

        const response = await failed(
          api.put("/tenants/login-settings", { method: "phone" }, bearer(owner.token)),
        );
        expect(response.status).toBe(400);
      });

      it("isolates one tenant's setting from another's", async () => {
        const first = await registerTenant("login-iso-a", "Iso A");
        const second = await registerTenant("login-iso-b", "Iso B");

        const put = await api.put("/tenants/login-settings", { method: "yandex" }, bearer(first.token));
        expect(put.status).toBe(200);

        const secondRead = await api.get("/tenants/login-settings", bearer(second.token));
        expect(secondRead.data.login_settings.method).toBe("both");
      });

      it("serves the same setting to the storefront through /storefront/by-host", async () => {
        const owner = await registerTenant("login-by-host", "By Host");
        await api.put("/tenants/login-settings", { method: "email" }, bearer(owner.token));

        const byHost = await api.get(`/storefront/by-host?host=${owner.tenant.handle}.localhost`);
        expect(byHost.status).toBe(200);
        expect(byHost.data.login.method).toBe("email");
        expect(typeof byHost.data.login.yandex_platform_available).toBe("boolean");
      });

      it("refuses email register/login/reset for a Yandex-only shop", async () => {
        const owner = await registerTenant("login-yandex-only", "Yandex Only");
        await api.put("/tenants/login-settings", { method: "yandex" }, bearer(owner.token));
        const key = publishable(owner.tenant.api_key.token);
        const buyer = { email: "buyer@yandex-only.test", password: "supersecret-buyer" };

        const register = await failed(api.post("/auth/customer/emailpass/register", buyer, key));
        expect(register.status).toBe(401);
        expect(register.data.message).toMatch(/Yandex ID only/);

        const login = await failed(api.post("/auth/customer/emailpass", buyer, key));
        expect(login.status).toBe(401);
        expect(login.data.message).toMatch(/Yandex ID only/);

        const reset = await failed(
          api.post("/auth/customer/emailpass/reset-password", { identifier: buyer.email }, key),
        );
        expect(reset.status).toBe(401);
        expect(reset.data.message).toMatch(/Yandex ID only/);

        const update = await failed(
          api.post("/auth/customer/emailpass/update", { password: "new-supersecret" }, {
            headers: { ...key.headers, authorization: "Bearer not-a-real-token" },
          }),
        );
        expect(update.status).toBe(401);
        expect(update.data.message).toMatch(/Yandex ID only/);
      });

      it("refuses /auth/customer/yandex for an email-only shop, before Medusa looks up the provider", async () => {
        const owner = await registerTenant("login-email-only", "Email Only");
        await api.put("/tenants/login-settings", { method: "email" }, bearer(owner.token));

        const response = await failed(
          api.post("/auth/customer/yandex", { callback_url: YANDEX_CALLBACK, tenant: owner.tenant.handle }),
        );
        expect(response.status).toBe(401);
        expect(response.data.message).toMatch(/email and password only/);
      });

      it("leaves email register working for the default (both) shop and an email-only shop", async () => {
        const bothOwner = await registerTenant("login-both", "Both");
        const bothRegister = await api.post(
          "/auth/customer/emailpass/register",
          { email: "buyer@both.test", password: "supersecret-buyer" },
          publishable(bothOwner.tenant.api_key.token),
        );
        expect(bothRegister.status).toBe(200);

        const emailOwner = await registerTenant("login-email-explicit", "Email Explicit");
        await api.put("/tenants/login-settings", { method: "email" }, bearer(emailOwner.token));
        const emailRegister = await api.post(
          "/auth/customer/emailpass/register",
          { email: "buyer@email-explicit.test", password: "supersecret-buyer" },
          publishable(emailOwner.tenant.api_key.token),
        );
        expect(emailRegister.status).toBe(200);
      });

      it("lets a both/yandex shop reach Medusa's own provider lookup instead of this gate", async () => {
        const owner = await registerTenant("login-yandex-reachable", "Yandex Reachable");
        await api.put("/tenants/login-settings", { method: "yandex" }, bearer(owner.token));

        const response = await failed(
          api.post("/auth/customer/yandex", { callback_url: YANDEX_CALLBACK, tenant: owner.tenant.handle }),
        );
        // Whatever Medusa answers (a consent URL when YANDEX_CLIENT_ID is set for
        // this run, "provider not found" when it is not) is never this gate's own
        // refusal text, which is what proves the request reached Medusa at all.
        expect(String(response.data?.message ?? "")).not.toMatch(/email and password only/);
      });

      it("passes through untouched when the request names no shop at all (single-store mode)", async () => {
        const response = await api.post("/auth/customer/emailpass/register", {
          email: "no-shop-buyer@example.com",
          password: "supersecret-buyer",
        });
        expect(response.status).toBe(200);
      });
    });
  },
});
