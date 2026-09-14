import { gunzipSync } from "node:zlib";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import exportTenantWorkflow from "../../src/workflows/tenant/export-tenant";
import bundleSchema from "../../src/workflows/tenant/export-tenant/bundle.schema.json";

jest.setTimeout(180_000);

/**
 * Seam test of `exportTenantWorkflow` and `POST /admin/tenants/:id/export`:
 * registers a tenant, gives it two products, runs the workflow directly from
 * the container, validates the result against `bundle.schema.json`, then
 * exercises the HTTP route (authenticated as an admin user) and checks the
 * gunzipped response carries the same counts.
 *
 * Runner facts that shape this file (measured on @medusajs/test-utils 2.19.0,
 * see `docs/multitenancy/admin-tenants-api-contract.md` §7): `DB_HOST` must be
 * the literal `localhost`, and the database resets between tests, so every
 * `it` block below registers its own tenant and admin.
 */
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

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateBundle = ajv.compile(bundleSchema);

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenant export: exportTenantWorkflow + POST /admin/tenants/:id/export", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const registerTenant = async (handle: string, name: string) => {
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

      /**
       * Mints an admin user the same way the framework's own registration
       * flow does: an emailpass auth identity, then `createUserAccountWorkflow`
       * to attach a `user` row and set the actor-type `user` app metadata
       * (mirrors `createTenantWorkflow`'s `createTenantAdminStep`, for actor
       * type `user` instead of `tenant`). No helper for this ships in
       * `@medusajs/test-utils` 2.19.0 — verified by grepping its `dist/`.
       */
      const registerAdmin = async (email: string) => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

        const registered = await authModuleService.register("emailpass", {
          body: { email, password: PASSWORD },
        });
        if (!registered.success || !registered.authIdentity) {
          throw new Error(`could not register admin auth identity: ${registered.error}`);
        }

        await createUserAccountWorkflow(container).run({
          input: {
            authIdentityId: registered.authIdentity.id,
            userData: { email },
          },
        });

        const login = await api.post("/auth/user/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);

        return login.data.token as string;
      };

      const createProduct = async (token: string, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(token));
        expect(created.status).toBe(201);
        return created.data.product;
      };

      it("builds a schema-valid bundle with manifest.counts.products === 2", async () => {
        const { token, tenant } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug");
        await createProduct(token, "Acme tote");

        const container = getContainer();
        const { result } = await exportTenantWorkflow(container).run({
          input: { tenant_id: tenant.id },
        });

        const valid = validateBundle(result.bundle);
        expect(validateBundle.errors ?? []).toEqual([]);
        expect(valid).toBe(true);

        expect(result.bundle.tenant.id).toBe(tenant.id);
        expect(result.bundle.tenant.handle).toBe("acme");
        expect(result.manifest.counts.products).toBe(2);
        expect(result.manifest.bytes).toBeGreaterThan(0);
        expect(result.bundle.orders).toEqual([]);
        expect(result.bundle.files).toEqual([]);
        expect(result.bundle.pages).toBeNull();
      });

      it("resolves a tenant given by handle the same way as by id", async () => {
        const { tenant } = await registerTenant("globex", "Globex");

        const container = getContainer();
        const { result } = await exportTenantWorkflow(container).run({
          input: { handle: "globex" },
        });

        expect(result.bundle.tenant.id).toBe(tenant.id);
      });

      it("POST /admin/tenants/:id/export answers gzip JSON with the same counts", async () => {
        const { token, tenant } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug");
        await createProduct(token, "Acme tote");

        const adminToken = await registerAdmin("owner@upready.dev");

        const response = await api.post(
          `/admin/tenants/${tenant.id}/export`,
          {},
          {
            headers: { authorization: `Bearer ${adminToken}` },
            responseType: "arraybuffer",
          },
        );

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toBe("application/gzip");
        expect(response.headers["content-disposition"]).toContain(
          `filename="tenant-acme-`,
        );

        const gunzipped = gunzipSync(Buffer.from(response.data));
        const bundle = JSON.parse(gunzipped.toString("utf8"));

        expect(bundle.tenant.id).toBe(tenant.id);
        expect(bundle.manifest.counts.products).toBe(2);
        expect(validateBundle(bundle)).toBe(true);
      });

      it("answers 401 for an unauthenticated export request", async () => {
        const { tenant } = await registerTenant("acme", "Acme");

        const refused = await api
          .post(`/admin/tenants/${tenant.id}/export`, {})
          .catch((error) => error.response);

        expect(refused.status).toBe(401);
      });
    });
  },
});
