import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

jest.setTimeout(180_000);

/**
 * t-2026-09-24-n12, step 2 of `docs/multitenancy/sites-one-db-many-storefronts.md`:
 * `tenant_group` + `tenant.group_id`, and group membership as the second
 * reason `POST /tenants/me/switch` lets a session into a shop.
 *
 * Layout, built once in `beforeAll` (the database is restored to that
 * snapshot before every `it`):
 * - group 1 = site A (owner-a registered it) + site B (created by staff for
 *   another admin email, owner-a has NO row there);
 * - group 2 = site C + site E, each with its own owner;
 * - site D has no group, like every shop before this change.
 */
const PASSWORD = "supersecret-owner";
const OWNER_A = "owner-a@w12-group.test";

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

type Shop = { id: string };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: sites of one client (tenant_group, POST /tenants/me/switch)", () => {
      let adminHeaders: { headers: Record<string, string> };
      let siteA: Shop;
      let siteB: Shop;
      let siteC: Shop;
      let siteD: Shop;
      let siteE: Shop;
      let ownerAToken: string;
      let ownerCToken: string;
      let ownerDToken: string;

      const login = async (email: string) => {
        const response = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(response.status).toBe(200);
        return response.data.token as string;
      };

      const createStaffTenant = async (handle: string, adminEmail: string): Promise<Shop> => {
        const created = await api.post(
          "/admin/tenants",
          { name: handle, handle, admin: { email: adminEmail, password: PASSWORD, first_name: "Owner" } },
          adminHeaders,
        );
        expect(created.status).toBe(201);
        return { id: created.data.tenant.id };
      };

      const shopIds = async (token: string) => {
        const shops = await api.get("/tenants/me/shops", bearer(token));
        expect(shops.status).toBe(200);
        return (shops.data.shops as { id: string }[]).map((shop) => shop.id).sort();
      };

      const switchTo = (token: string, tenantId: string) =>
        api.post("/tenants/me/switch", { tenant_id: tenantId }, bearer(token)).catch((error) => error.response);

      beforeAll(async () => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
        const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

        const staffEmail = "staff@w12-group.test";
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

        const registration = await api.post("/auth/tenant/emailpass/register", {
          email: OWNER_A,
          password: PASSWORD,
        });
        expect(registration.status).toBe(200);
        const createdA = await api.post(
          "/tenants",
          { name: "w12-site-a", handle: "w12-site-a", admin: { email: OWNER_A, first_name: "Olga", last_name: "A" } },
          bearer(registration.data.token),
        );
        expect(createdA.status).toBe(201);
        siteA = { id: createdA.data.tenant.id };

        siteB = await createStaffTenant("w12-site-b", "owner-b@w12-group.test");
        siteC = await createStaffTenant("w12-site-c", "owner-c@w12-group.test");
        siteD = await createStaffTenant("w12-site-d", "owner-d@w12-group.test");
        siteE = await createStaffTenant("w12-site-e", "owner-e@w12-group.test");

        const [group1, group2] = await tenantModuleService.createTenantGroups([
          { name: "w12 client 1" },
          { name: "w12 client 2" },
        ]);
        await tenantModuleService.updateTenants([
          { id: siteA.id, group_id: group1.id },
          { id: siteB.id, group_id: group1.id },
          { id: siteC.id, group_id: group2.id },
          { id: siteE.id, group_id: group2.id },
        ]);

        ownerAToken = await login(OWNER_A);
        ownerCToken = await login("owner-c@w12-group.test");
        ownerDToken = await login("owner-d@w12-group.test");
      });

      it("lists the other site of the same group, and nothing of another group or a single shop", async () => {
        expect(await shopIds(ownerAToken)).toEqual([siteA.id, siteB.id].sort());
        expect(await shopIds(ownerCToken)).toEqual([siteC.id, siteE.id].sort());
      });

      it("a shop without a group lists itself only and cannot switch anywhere", async () => {
        expect(await shopIds(ownerDToken)).toEqual([siteD.id]);

        const intoGroup = await switchTo(ownerDToken, siteA.id);
        expect(intoGroup.status).toBe(403);
      });

      it("switches into a site of the same group without a row there, creating the caller's row once", async () => {
        const switched = await switchTo(ownerAToken, siteB.id);
        expect(switched.status).toBe(200);

        const me = await api.get("/tenants/me", bearer(switched.data.token));
        expect(me.status).toBe(200);
        expect(me.data.tenant_admin.tenant.id).toBe(siteB.id);
        expect(me.data.tenant_admin.email).toBe(OWNER_A);
        expect(me.data.tenant_admin.first_name).toBe("Olga");

        // A second switch reuses the row instead of creating another one.
        const again = await switchTo(ownerAToken, siteB.id);
        expect(again.status).toBe(200);
        const tenantModuleService: TenantModuleService = getContainer().resolve(TENANT_MODULE);
        const rows = await tenantModuleService.listTenantAdmins({ email: OWNER_A, tenant_id: siteB.id });
        expect(rows).toHaveLength(1);
        expect(rows[0].metadata).toEqual({ via_group: expect.stringMatching(/^tgrp_/) });

        // And the way back works from the new session.
        const back = await switchTo(switched.data.token, siteA.id);
        expect(back.status).toBe(200);
        const meBack = await api.get("/tenants/me", bearer(back.data.token));
        expect(meBack.data.tenant_admin.tenant.id).toBe(siteA.id);
      });

      it("403s a site of another group and a shop without a group, the same as an unknown id", async () => {
        expect((await switchTo(ownerAToken, siteC.id)).status).toBe(403);
        expect((await switchTo(ownerAToken, siteD.id)).status).toBe(403);
        expect((await switchTo(ownerAToken, "ten_does_not_exist")).status).toBe(403);
        expect((await switchTo(ownerCToken, siteA.id)).status).toBe(403);
      });

      it("after the switch the other site reads the product, but only the owner writes it", async () => {
        // Step 3 (`tenants-shared-catalog.spec.ts`): one catalogue for the sites of
        // a client. Here only the switch side of it: the session in site B sees
        // site A's product as not its own, and cannot change it.
        const product = await api.post("/tenants/products", productBody("W12 site A shirt"), bearer(ownerAToken));
        expect(product.status).toBe(201);

        const switched = await switchTo(ownerAToken, siteB.id);
        expect(switched.status).toBe(200);

        const productsAsB = await api.get("/tenants/products", bearer(switched.data.token));
        expect(productsAsB.status).toBe(200);
        const seen = (productsAsB.data.products as { id: string; owned?: boolean }[]).find(
          (p) => p.id === product.data.product.id,
        );
        expect(seen?.owned).toBe(false);

        const write = await api
          .post(`/tenants/products/${product.data.product.id}`, { title: "from B" }, bearer(switched.data.token))
          .catch((error) => error.response);
        expect(write.status).toBe(404);

        const productsAsC = await api.get("/tenants/products", bearer(ownerCToken));
        expect((productsAsC.data.products as { id: string }[]).map((p) => p.id)).not.toContain(
          product.data.product.id,
        );
      });

      it("hides an archived site of the group from the list and from the switch", async () => {
        const tenantModuleService: TenantModuleService = getContainer().resolve(TENANT_MODULE);
        await tenantModuleService.updateTenants({
          id: siteB.id,
          metadata: { archived_at: new Date().toISOString() },
        });

        expect(await shopIds(ownerAToken)).toEqual([siteA.id]);
        expect((await switchTo(ownerAToken, siteB.id)).status).toBe(403);
      });
    });
  },
});
