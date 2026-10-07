import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";

jest.setTimeout(180_000);

/**
 * Seam tests for the platform staff's tenant management API (contract §3/§4,
 * `docs/multitenancy/admin-tenants-api-contract.md`). Same runner facts as
 * `tenants.spec.ts`: `DB_HOST=localhost` (any other host forces SSL and the
 * boot hangs), and the database is restored from its post-`beforeAll`
 * snapshot before every test, so only what `beforeAll` creates (the staff
 * session here) survives across tests; every tenant a test needs, it creates
 * itself.
 *
 * There is no `@medusajs/js-sdk` admin-session helper wired into this repo's
 * test-utils, so `beforeAll` mints one the way Medusa's own registration
 * flow does under the hood: register an emailpass identity directly through
 * the auth module, attach a user to it with `createUserAccountWorkflow`
 * (verified in `@medusajs/core-flows` 2.19.0), then log in over HTTP.
 */
// 12 characters at least: the floor `tenantAdminPassword` holds since 46df A-22.
const PASSWORD = "supersecret-owner";

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
    describe("admin/tenants: platform staff API", () => {
      let adminHeaders: { headers: Record<string, string> };

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const createTenant = async (handle: string, adminEmail: string) => {
        const created = await api.post(
          "/admin/tenants",
          {
            name: handle,
            handle,
            admin: { email: adminEmail, password: PASSWORD, first_name: "Owner" },
          },
          adminHeaders,
        );
        expect(created.status).toBe(201);
        return created.data.tenant as {
          id: string;
          admins_count: number;
          sales_channel: { id: string };
          api_key: { id: string; token: string };
          admins: { id: string; email: string }[];
        };
      };

      beforeAll(async () => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

        const email = "staff@platform.test";
        const registered = await authModuleService.register("emailpass", {
          body: { email, password: PASSWORD },
        });
        if (!registered.success || !registered.authIdentity) {
          throw new Error(`Could not register the staff auth identity: ${JSON.stringify(registered)}`);
        }

        await createUserAccountWorkflow(container).run({
          input: {
            authIdentityId: registered.authIdentity.id,
            userData: { email, first_name: "Platform", last_name: "Staff" },
          },
        });

        const login = await api.post("/auth/user/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);

        adminHeaders = bearer(login.data.token);
      });

      it("rejects unauthenticated GET /admin/tenants and answers 200 with a count for staff", async () => {
        const anonymous = await api.get("/admin/tenants").catch((error) => error.response);
        expect(anonymous.status).toBe(401);

        const authed = await api.get("/admin/tenants", adminHeaders);
        expect(authed.status).toBe(200);
        expect(typeof authed.data.count).toBe("number");
        expect(Array.isArray(authed.data.tenants)).toBe(true);
      });

      it("creates a tenant with a password-holding admin who can log in and sell", async () => {
        const email = "owner@w1-acme.test";
        const tenant = await createTenant("w1-acme", email);

        expect(tenant.admins_count).toBe(1);
        expect(tenant.sales_channel.id).toMatch(/^sc_/);
        expect(tenant.api_key.token).toMatch(/^pk_/);

        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        const tenantToken = login.data.token;

        const me = await api.get("/tenants/me", bearer(tenantToken));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.tenant.id).toBe(tenant.id);

        const product = await api.post(
          "/tenants/products",
          productBody("W1 Acme shirt"),
          bearer(tenantToken),
        );
        expect(product.status).toBe(201);

        const store = await api.get("/store/products", {
          headers: { "x-publishable-api-key": tenant.api_key.token },
        });
        expect(store.status).toBe(200);
        expect(store.data.products.map((p: { id: string }) => p.id)).toContain(product.data.product.id);
      });

      it("adds a second admin, changes its email and password, and removes it, refusing to remove the last one", async () => {
        const tenant = await createTenant("w1-globex", "owner@w1-globex.test");
        const firstAdminId = tenant.admins[0].id;

        const secondEmail = "second@w1-globex.test";
        const secondAdmin = await api.post(
          `/admin/tenants/${tenant.id}/admins`,
          { email: secondEmail, password: PASSWORD, first_name: "Second" },
          adminHeaders,
        );
        expect(secondAdmin.status).toBe(201);
        const secondAdminId = secondAdmin.data.admin.id;

        const newEmail = "second-renamed@w1-globex.test";
        const newPassword = "brandnewpassword";
        const updated = await api.post(
          `/admin/tenants/${tenant.id}/admins/${secondAdminId}`,
          { email: newEmail, password: newPassword },
          adminHeaders,
        );
        expect(updated.status).toBe(200);
        expect(updated.data.admin.email).toBe(newEmail);

        const loginNew = await api.post("/auth/tenant/emailpass", { email: newEmail, password: newPassword });
        expect(loginNew.status).toBe(200);

        const loginOld = await api
          .post("/auth/tenant/emailpass", { email: secondEmail, password: PASSWORD })
          .catch((error) => error.response);
        expect(loginOld.status).toBe(401);

        const removed = await api.delete(`/admin/tenants/${tenant.id}/admins/${secondAdminId}`, adminHeaders);
        expect(removed.status).toBe(200);
        expect(removed.data).toEqual({ id: secondAdminId, object: "tenant_admin", deleted: true });

        const lastRemoval = await api
          .delete(`/admin/tenants/${tenant.id}/admins/${firstAdminId}`, adminHeaders)
          .catch((error) => error.response);
        expect(lastRemoval.status).toBe(400);
      });

      it("soft-deletes a tenant: login, old bearer, and the storefront key all stop working", async () => {
        const email = "owner@w1-initech.test";
        const tenant = await createTenant("w1-initech", email);

        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        const tenantToken = login.data.token;
        const storefrontKey = tenant.api_key.token;

        const deleted = await api.delete(`/admin/tenants/${tenant.id}`, adminHeaders);
        expect(deleted.status).toBe(200);
        expect(deleted.data.object).toBe("tenant");
        expect(deleted.data.deleted).toBe(true);
        expect(typeof deleted.data.archived_at).toBe("string");

        // Idempotent: deleting again answers 200 with the same archived_at.
        const again = await api.delete(`/admin/tenants/${tenant.id}`, adminHeaders);
        expect(again.status).toBe(200);
        expect(again.data.archived_at).toBe(deleted.data.archived_at);

        const loginAfter = await api
          .post("/auth/tenant/emailpass", { email, password: PASSWORD })
          .catch((error) => error.response);
        expect(loginAfter.status).toBe(401);

        const meAfter = await api.get("/tenants/me", bearer(tenantToken)).catch((error) => error.response);
        expect(meAfter.status).toBe(401);

        // Verified in @medusajs/framework 2.19.0
        // dist/http/middlewares/ensure-publishable-api-key.js: a revoked key
        // throws `MedusaError.Types.NOT_ALLOWED`, which this app's
        // error-handler maps to 400, not 401 as the contract first assumed
        // (recorded in .ai/progress-w1.md).
        const storeAfter = await api
          .get("/store/products", { headers: { "x-publishable-api-key": storefrontKey } })
          .catch((error) => error.response);
        expect(storeAfter.status).toBe(400);

        const listDefault = await api.get("/admin/tenants", adminHeaders);
        expect(listDefault.data.tenants.map((t: { id: string }) => t.id)).not.toContain(tenant.id);

        const listIncluded = await api.get("/admin/tenants?archived=include", adminHeaders);
        expect(listIncluded.data.tenants.map((t: { id: string }) => t.id)).toContain(tenant.id);

        const listOnly = await api.get("/admin/tenants?archived=only", adminHeaders);
        expect(listOnly.data.tenants.map((t: { id: string }) => t.id)).toContain(tenant.id);
      });

      it("refuses to change a tenant's handle or set metadata.archived_at through POST /admin/tenants/:id", async () => {
        const tenant = await createTenant("w1-hooli", "owner@w1-hooli.test");

        const handleChange = await api
          .post(`/admin/tenants/${tenant.id}`, { handle: "w1-hooli-2" }, adminHeaders)
          .catch((error) => error.response);
        expect(handleChange.status).toBe(400);

        const archivedAtChange = await api
          .post(`/admin/tenants/${tenant.id}`, { metadata: { archived_at: new Date().toISOString() } }, adminHeaders)
          .catch((error) => error.response);
        expect(archivedAtChange.status).toBe(400);

        const rename = await api.post(`/admin/tenants/${tenant.id}`, { name: "Hooli Renamed" }, adminHeaders);
        expect(rename.status).toBe(200);
        expect(rename.data.tenant.name).toBe("Hooli Renamed");
      });
    });
  },
});
