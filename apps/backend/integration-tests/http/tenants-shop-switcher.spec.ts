import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";

jest.setTimeout(180_000);

/**
 * Seam tests for o25-platform-admin-all-shops: one emailpass identity with a
 * `tenant_admin` row in several tenants, `GET /tenants/me/shops` and
 * `POST /tenants/me/switch`. Same runner facts as `tenants.spec.ts` and
 * `admin-tenants.spec.ts`: `DB_HOST=localhost`, and the database is restored
 * from its post-`beforeAll` snapshot before every test, so everything this
 * suite needs (the platform email's own shop, the two auto-added shops, the
 * one it has no row in, and the platform staff session) is built once in
 * `beforeAll` and survives across every `it` below.
 *
 * `PLATFORM_ADMIN_EMAIL` is a real `process.env` mutation, read at call time
 * by `add-platform-admin-to-tenant.ts` — set once in `beforeAll`, AFTER
 * `shopD` (the tenant the platform email must have NO row in) is created,
 * and cleared in `afterAll` so no other spec file sharing this Jest worker
 * ever sees it.
 */
const PASSWORD = "supersecret";
const PLATFORM_EMAIL = "app@w25-platform.test";

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

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

type StaffTenant = {
  id: string;
  admins: { id: string; email: string }[];
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: shop switcher (GET /tenants/me/shops, POST /tenants/me/switch)", () => {
      let adminHeaders: { headers: Record<string, string> };
      let shopA: { id: string; handle: string };
      let shopB: StaffTenant;
      let shopC: StaffTenant;
      let shopD: StaffTenant;
      /** The platform email's original login: actor = its row in shop A. */
      let platformToken: string;

      const createStaffTenant = async (handle: string, adminEmail: string): Promise<StaffTenant> => {
        const created = await api.post(
          "/admin/tenants",
          { name: handle, handle, admin: { email: adminEmail, password: PASSWORD, first_name: "Owner" } },
          adminHeaders,
        );
        expect(created.status).toBe(201);
        return created.data.tenant as StaffTenant;
      };

      beforeAll(async () => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

        // Platform staff session, for POST /admin/tenants (same recipe as
        // admin-tenants.spec.ts).
        const staffEmail = "staff@w25-platform.test";
        const registeredStaff = await authModuleService.register("emailpass", {
          body: { email: staffEmail, password: PASSWORD },
        });
        if (!registeredStaff.success || !registeredStaff.authIdentity) {
          throw new Error(`Could not register the staff auth identity: ${JSON.stringify(registeredStaff)}`);
        }
        await createUserAccountWorkflow(container).run({
          input: {
            authIdentityId: registeredStaff.authIdentity.id,
            userData: { email: staffEmail, first_name: "Platform", last_name: "Staff" },
          },
        });
        const staffLogin = await api.post("/auth/user/emailpass", { email: staffEmail, password: PASSWORD });
        expect(staffLogin.status).toBe(200);
        adminHeaders = bearer(staffLogin.data.token);

        // Shop A: the platform email's OWN shop, registered the normal
        // self-service way. This is what sets the identity's default
        // `app_metadata.tenant_id` — the same thing a real first login does.
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email: PLATFORM_EMAIL,
          password: PASSWORD,
        });
        expect(registration.status).toBe(200);
        const createdA = await api.post(
          "/tenants",
          { name: "w25-shop-a", handle: "w25-shop-a", admin: { email: PLATFORM_EMAIL, first_name: "Platform" } },
          bearer(registration.data.token),
        );
        expect(createdA.status).toBe(201);
        shopA = { id: createdA.data.tenant.id, handle: "w25-shop-a" };

        // Shop A also gets its own, unrelated second admin: DELETE
        // /admin/tenants/:id/admins/:adminId refuses to remove the LAST
        // admin of a tenant, and the "removed from its default shop" test
        // below needs the platform email's removal from A to actually
        // succeed.
        const secondAdminA = await api.post(
          `/admin/tenants/${shopA.id}/admins`,
          { email: "owner-a@w25-platform.test", password: PASSWORD, first_name: "Owner" },
          adminHeaders,
        );
        expect(secondAdminA.status).toBe(201);

        const platformLogin = await api.post("/auth/tenant/emailpass", {
          email: PLATFORM_EMAIL,
          password: PASSWORD,
        });
        expect(platformLogin.status).toBe(200);
        platformToken = platformLogin.data.token;

        // Shop D is created BEFORE PLATFORM_ADMIN_EMAIL is set: the platform
        // email gets no row here, on purpose — this is the "foreign" tenant
        // for the 403 case.
        shopD = await createStaffTenant("w25-shop-d", "owner-d@w25-platform.test");

        process.env.PLATFORM_ADMIN_EMAIL = PLATFORM_EMAIL;

        // Shops B and C are created AFTER the env is set: createTenantWorkflow's
        // add-platform-admin-to-tenant step gives the platform email a row in
        // each, automatically, alongside each shop's own unrelated admin.
        shopB = await createStaffTenant("w25-shop-b", "owner-b@w25-platform.test");
        shopC = await createStaffTenant("w25-shop-c", "owner-c@w25-platform.test");
      });

      afterAll(() => {
        delete process.env.PLATFORM_ADMIN_EMAIL;
      });

      it("auto-add: the same email holds a tenant_admin row in three different tenants", async () => {
        const shops = await api.get("/tenants/me/shops", bearer(platformToken));
        expect(shops.status).toBe(200);

        const ids = (shops.data.shops as { id: string }[]).map((shop) => shop.id).sort();
        expect(ids).toEqual([shopA.id, shopB.id, shopC.id].sort());
        expect(ids).not.toContain(shopD.id);
      });

      it("switches to an owned shop: 200, a new token whose actor is that shop", async () => {
        const switched = await api.post(
          "/tenants/me/switch",
          { tenant_id: shopB.id },
          bearer(platformToken),
        );
        expect(switched.status).toBe(200);
        expect(typeof switched.data.token).toBe("string");

        const me = await api.get("/tenants/me", bearer(switched.data.token));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.tenant.id).toBe(shopB.id);
      });

      it("403s switching to a tenant the caller has no row in, never 404", async () => {
        const response = await api
          .post("/tenants/me/switch", { tenant_id: shopD.id }, bearer(platformToken))
          .catch((error) => error.response);
        expect(response.status).toBe(403);
      });

      it("400s an unknown tenant id the same way (strictObject, no row to find)", async () => {
        const response = await api
          .post("/tenants/me/switch", { tenant_id: "ten_does_not_exist" }, bearer(platformToken))
          .catch((error) => error.response);
        expect(response.status).toBe(403);
      });

      it("shop A's data is invisible after switching to shop B", async () => {
        const product = await api.post("/tenants/products", productBody("W25 Shop A shirt"), bearer(platformToken));
        expect(product.status).toBe(201);

        const switched = await api.post(
          "/tenants/me/switch",
          { tenant_id: shopB.id },
          bearer(platformToken),
        );
        expect(switched.status).toBe(200);

        const productsAsB = await api.get("/tenants/products", bearer(switched.data.token));
        expect(productsAsB.status).toBe(200);
        expect(
          (productsAsB.data.products as { id: string }[]).map((p) => p.id),
        ).not.toContain(product.data.product.id);
      });

      it("persists the switch as the new login default", async () => {
        const switched = await api.post(
          "/tenants/me/switch",
          { tenant_id: shopC.id },
          bearer(platformToken),
        );
        expect(switched.status).toBe(200);

        const relogin = await api.post("/auth/tenant/emailpass", { email: PLATFORM_EMAIL, password: PASSWORD });
        expect(relogin.status).toBe(200);

        const me = await api.get("/tenants/me", bearer(relogin.data.token));
        expect(me.data.tenant_admin.tenant.id).toBe(shopC.id);
      });

      it("removing the platform email from one shop keeps its login everywhere else", async () => {
        const detailB = await api.get(`/admin/tenants/${shopB.id}`, adminHeaders);
        const platformRowInB = detailB.data.tenant.admins.find(
          (admin: { email: string }) => admin.email === PLATFORM_EMAIL,
        );
        expect(platformRowInB).toBeTruthy();

        const removed = await api.delete(
          `/admin/tenants/${shopB.id}/admins/${platformRowInB.id}`,
          adminHeaders,
        );
        expect(removed.status).toBe(200);

        // The shared identity still logs in — shop A's row (the default) is
        // untouched, and neither is shop C's.
        const login = await api.post("/auth/tenant/emailpass", { email: PLATFORM_EMAIL, password: PASSWORD });
        expect(login.status).toBe(200);
        const me = await api.get("/tenants/me", bearer(login.data.token));
        expect(me.data.tenant_admin.tenant.id).toBe(shopA.id);

        const shops = await api.get("/tenants/me/shops", bearer(login.data.token));
        const ids = (shops.data.shops as { id: string }[]).map((shop) => shop.id).sort();
        expect(ids).toEqual([shopA.id, shopC.id].sort());

        const switchToRemoved = await api
          .post("/tenants/me/switch", { tenant_id: shopB.id }, bearer(login.data.token))
          .catch((error) => error.response);
        expect(switchToRemoved.status).toBe(403);
      });

      it("removing the platform email from its DEFAULT shop repoints the login instead of leaving a dead actor id", async () => {
        // Shop A is the identity's default (app_metadata.tenant_id, set at
        // registration in beforeAll) — the exact case a first pass at the
        // removal-safety fix missed: the row deleted here is the very row
        // the token's actor_id is minted from on every future login.
        const detailA = await api.get(`/admin/tenants/${shopA.id}`, adminHeaders);
        const platformRowInA = detailA.data.tenant.admins.find(
          (admin: { email: string }) => admin.email === PLATFORM_EMAIL,
        );
        expect(platformRowInA).toBeTruthy();

        const removed = await api.delete(
          `/admin/tenants/${shopA.id}/admins/${platformRowInA.id}`,
          adminHeaders,
        );
        expect(removed.status).toBe(200);

        // The identity survives (rows remain in B and C) — proven by a REAL
        // login, not just the 200 on the delete call.
        const login = await api.post("/auth/tenant/emailpass", { email: PLATFORM_EMAIL, password: PASSWORD });
        expect(login.status).toBe(200);

        // Before the fix, app_metadata.tenant_id still named the row just
        // removed, so the token's actor_id resolved to nothing and this
        // answered 404 "Tenant admin ... was not found" — a login that
        // looks alive (200) but is dead on every /tenants/* call after it.
        const me = await api.get("/tenants/me", bearer(login.data.token));
        expect(me.status).toBe(200);
        expect([shopB.id, shopC.id]).toContain(me.data.tenant_admin.tenant.id);
      });

      it("the platform email is invisible to a shop's own admin bookkeeping", async () => {
        // Shop B: owner-b (real) + the auto-added platform row. The count
        // must read 1, not 2, and the last-admin guard must treat owner-b
        // as the only real admin — refusing to remove them, even though the
        // platform row is technically a second `tenant_admin` row.
        const detail = await api.get(`/admin/tenants/${shopB.id}`, adminHeaders);
        expect(detail.status).toBe(200);
        expect(detail.data.tenant.admins_count).toBe(1);
        // The row itself is still visible to staff (who needs its id to
        // remove it from one shop) — only the COUNT and the GUARD treat it
        // as if it were not there.
        expect(detail.data.tenant.admins).toHaveLength(2);

        const ownerB = detail.data.tenant.admins.find(
          (admin: { email: string }) => admin.email === "owner-b@w25-platform.test",
        );
        expect(ownerB).toBeTruthy();

        const refused = await api
          .delete(`/admin/tenants/${shopB.id}/admins/${ownerB.id}`, adminHeaders)
          .catch((error) => error.response);
        expect(refused.status).toBe(400);

        // Removing the PLATFORM row itself is never blocked by the guard —
        // it doesn't change how many real admins the shop has.
        const platformRowInB = detail.data.tenant.admins.find(
          (admin: { email: string }) => admin.email === PLATFORM_EMAIL,
        );
        const removedPlatform = await api.delete(
          `/admin/tenants/${shopB.id}/admins/${platformRowInB.id}`,
          adminHeaders,
        );
        expect(removedPlatform.status).toBe(200);
      });
    });
  },
});
