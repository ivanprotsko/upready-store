import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { STAFF_REFUSALS } from "../../src/api/tenants/staff/staff-refusals";
import { TENANT_MODULE } from "../../src/modules/tenant";
import { Migration20261008010000 } from "../../src/modules/tenant/migrations/Migration20261008010000";
import type TenantModuleService from "../../src/modules/tenant/service";

jest.setTimeout(180_000);

/**
 * Seam tests for t-2026-10-07-11: the role of a shop's login, the one gate on
 * `/tenants/*` that enforces it, and the shop's own staff routes.
 *
 * Same runner facts as `tenants-shop-switcher.spec.ts`: `DB_HOST=localhost`,
 * and the database is restored from its post-`beforeAll` snapshot before every
 * test. So the shops and the three logins of shop A are built once in
 * `beforeAll`, every `it` starts from them, and a test that removes a login or
 * changes a role does not leak into the next one. Tokens are JWTs and outlive
 * the restore, which is exactly what the «removed login» tests rely on.
 *
 * Every password below is invented here. `PLATFORM_ADMIN_EMAIL` is a real
 * `process.env` mutation, set before the shops are created (so each of them
 * gets the platform's row) and cleared in `afterAll`.
 */
const PASSWORD = "roles-suite-owner-pw";
const OTHER_PASSWORD = "roles-suite-other-pw";

const PLATFORM_EMAIL = "app@roles-suite.test";
const OWNER_A = "owner-a@roles-suite.test";
const SECOND_OWNER_A = "second-owner-a@roles-suite.test";
const MANAGER_A = "manager-a@roles-suite.test";
const OPERATOR_A = "operator-a@roles-suite.test";
const OWNER_B = "owner-b@roles-suite.test";
const OWNER_S = "owner-s@roles-suite.test";

const ALL_PERMISSIONS = [
  "orders",
  "customers",
  "reviews",
  "catalog",
  "storefront",
  "marketing",
  "marketplaces",
  "settings",
  "staff",
];
const MANAGER_PERMISSIONS = ALL_PERMISSIONS.slice(0, 7);
const OPERATOR_PERMISSIONS = ALL_PERMISSIONS.slice(0, 2);

/** One read per permission: a list the panel opens with, answered 200 for an empty shop. */
const READS: { permission: string; path: string }[] = [
  { permission: "orders", path: "/tenants/orders" },
  { permission: "customers", path: "/tenants/customers" },
  { permission: "reviews", path: "/tenants/reviews" },
  { permission: "catalog", path: "/tenants/product-categories" },
  { permission: "storefront", path: "/tenants/pages" },
  { permission: "marketing", path: "/tenants/promotions" },
  { permission: "marketplaces", path: "/tenants/marketplaces" },
  { permission: "settings", path: "/tenants/requisites" },
  { permission: "staff", path: "/tenants/staff" },
];

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
type StaffMember = { id: string; email: string; role: string; is_self: boolean };
type PlatformAdmin = { id: string; email: string; role: string };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: roles and staff (the gate on /tenants/*, /tenants/staff)", () => {
      let adminHeaders: { headers: Record<string, string> };
      let shopA: Shop;
      let shopB: Shop;
      /** A sister site of shop A: same `tenant_group`. */
      let shopS: Shop;
      let ownerToken: string;
      let managerToken: string;
      let operatorToken: string;
      let ownerBToken: string;
      let manager: StaffMember;
      let operator: StaffMember;

      /** Every answer as a response, a refusal included: the suite reads statuses, it does not catch. */
      const answer = <T,>(request: Promise<T>) => request.catch((error) => error.response);

      const tryLogin = (email: string, password: string) =>
        answer(api.post("/auth/tenant/emailpass", { email, password }));

      const login = async (email: string, password = PASSWORD) => {
        const response = await tryLogin(email, password);
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

      const staffOf = async (token: string) => {
        const response = await api.get("/tenants/staff", bearer(token));
        expect(response.status).toBe(200);
        return response.data.staff as StaffMember[];
      };

      const platformAdminsOf = async (shop: Shop) => {
        const response = await api.get(`/admin/tenants/${shop.id}/admins`, adminHeaders);
        expect(response.status).toBe(200);
        return response.data.admins as PlatformAdmin[];
      };

      const addStaff = (token: string, body: Record<string, unknown>) =>
        answer(api.post("/tenants/staff", body, bearer(token)));

      const editStaff = (token: string, id: string, body: Record<string, unknown>) =>
        answer(api.post(`/tenants/staff/${id}`, body, bearer(token)));

      const removeStaff = (token: string, id: string) => answer(api.delete(`/tenants/staff/${id}`, bearer(token)));

      beforeAll(async () => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
        const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

        // Platform staff session, the recipe of `admin-tenants.spec.ts`.
        const staffEmail = "staff@roles-suite.test";
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

        // Set BEFORE the shops exist: each of them gets the platform's row.
        process.env.PLATFORM_ADMIN_EMAIL = PLATFORM_EMAIL;

        shopA = await createStaffTenant("roles-shop-a", OWNER_A);
        shopB = await createStaffTenant("roles-shop-b", OWNER_B);
        shopS = await createStaffTenant("roles-shop-s", OWNER_S);

        const [group] = await tenantModuleService.createTenantGroups([{ name: "roles suite client" }]);
        await tenantModuleService.updateTenants([
          { id: shopA.id, group_id: group.id },
          { id: shopS.id, group_id: group.id },
        ]);

        ownerToken = await login(OWNER_A);
        ownerBToken = await login(OWNER_B);

        // The two other logins of shop A are made the way an owner makes them.
        const createdManager = await addStaff(ownerToken, {
          email: MANAGER_A,
          password: PASSWORD,
          role: "manager",
          first_name: "Mila",
        });
        expect(createdManager.status).toBe(201);
        manager = createdManager.data.staff_member;

        const createdOperator = await addStaff(ownerToken, {
          email: OPERATOR_A,
          password: PASSWORD,
          role: "operator",
        });
        expect(createdOperator.status).toBe(201);
        operator = createdOperator.data.staff_member;

        managerToken = await login(MANAGER_A);
        operatorToken = await login(OPERATOR_A);
      });

      afterAll(() => {
        delete process.env.PLATFORM_ADMIN_EMAIL;
      });

      describe("GET /tenants/me", () => {
        it("answers the caller's role and the permissions it opens", async () => {
          const asOwner = await api.get("/tenants/me", bearer(ownerToken));
          expect(asOwner.status).toBe(200);
          expect(asOwner.data.tenant_admin.role).toBe("owner");
          expect(asOwner.data.tenant_admin.permissions).toEqual(ALL_PERMISSIONS);
          expect(asOwner.data.tenant_admin.tenant.id).toBe(shopA.id);

          const asManager = await api.get("/tenants/me", bearer(managerToken));
          expect(asManager.data.tenant_admin.role).toBe("manager");
          expect(asManager.data.tenant_admin.permissions).toEqual(MANAGER_PERMISSIONS);

          const asOperator = await api.get("/tenants/me", bearer(operatorToken));
          expect(asOperator.data.tenant_admin.role).toBe("operator");
          expect(asOperator.data.tenant_admin.permissions).toEqual(OPERATOR_PERMISSIONS);
        });

        it("answers them from POST /tenants/me too, and lets every role edit its own profile", async () => {
          const updated = await api.post("/tenants/me", { first_name: "Olga" }, bearer(operatorToken));
          expect(updated.status).toBe(200);
          expect(updated.data.tenant_admin.first_name).toBe("Olga");
          expect(updated.data.tenant_admin.role).toBe("operator");
          expect(updated.data.tenant_admin.permissions).toEqual(OPERATOR_PERMISSIONS);
        });

        it("hands the shop's metadata, where its settings live, only to a role with `settings`", async () => {
          // Something a settings route keeps in `tenant.metadata`: the counters.
          const saved = await answer(
            api.put("/tenants/analytics", { yandex_metrica_id: "12345678" }, bearer(ownerToken)),
          );
          expect(saved.status).toBe(200);

          const asOwner = await api.get("/tenants/me", bearer(ownerToken));
          expect(JSON.stringify(asOwner.data.tenant_admin.tenant.metadata)).toContain("12345678");

          for (const token of [managerToken, operatorToken]) {
            const me = await api.get("/tenants/me", bearer(token));
            expect(me.status).toBe(200);
            expect(me.data.tenant_admin.tenant).not.toHaveProperty("metadata");
            expect(JSON.stringify(me.data)).not.toContain("12345678");
            // What the shell shows is still there.
            expect(me.data.tenant_admin.tenant).toMatchObject({ id: shopA.id, handle: "roles-shop-a" });
            expect(me.data.tenant_admin.tenant.sales_channel.id).toEqual(expect.any(String));

            const updated = await api.post("/tenants/me", { first_name: "Same" }, bearer(token));
            expect(updated.data.tenant_admin.tenant).not.toHaveProperty("metadata");
            expect(JSON.stringify(updated.data)).not.toContain("12345678");
          }
        });

        it("has no way to set a role through the profile", async () => {
          const response = await answer(api.post("/tenants/me", { role: "owner" }, bearer(operatorToken)));
          expect(response.status).toBe(400);

          const me = await api.get("/tenants/me", bearer(operatorToken));
          expect(me.data.tenant_admin.role).toBe("operator");
        });

        it("made every login that existed before a role was asked for an owner", async () => {
          // `POST /admin/tenants` names no role, the way nothing did before this task.
          const admins = await platformAdminsOf(shopB);
          expect(admins.map((admin) => admin.role)).toEqual(admins.map(() => "owner"));
          expect(admins.map((admin) => admin.email).sort()).toEqual([PLATFORM_EMAIL, OWNER_B].sort());
        });
      });

      describe("the gate, one read per permission", () => {
        const roles: { name: string; token: () => string; permissions: string[] }[] = [
          { name: "owner", token: () => ownerToken, permissions: ALL_PERMISSIONS },
          { name: "manager", token: () => managerToken, permissions: MANAGER_PERMISSIONS },
          { name: "operator", token: () => operatorToken, permissions: OPERATOR_PERMISSIONS },
        ];

        describe.each(roles)("as $name", ({ token, permissions }) => {
          it.each(READS)("GET $path ($permission)", async ({ permission, path }) => {
            const response = await answer(api.get(path, bearer(token())));

            if (permissions.includes(permission)) {
              expect(response.status).toBe(200);
              return;
            }

            expect(response.status).toBe(403);
            expect(response.data).toEqual({
              type: "not_allowed",
              message: expect.any(String),
              permission,
            });
          });
        });
      });

      describe("the gate, reads against writes", () => {
        it("lets an operator read products and refuses her to create one", async () => {
          const read = await answer(api.get("/tenants/products", bearer(operatorToken)));
          expect(read.status).toBe(200);

          const write = await answer(api.post("/tenants/products", productBody("Operator's shirt"), bearer(operatorToken)));
          expect(write.status).toBe(403);
          expect(write.data.permission).toBe("catalog");

          const after = await api.get("/tenants/products", bearer(ownerToken));
          expect(after.data.products).toEqual([]);
        });

        it("lets a manager create a product, and an operator read it as a reference", async () => {
          const created = await answer(api.post("/tenants/products", productBody("Manager's shirt"), bearer(managerToken)));
          expect(created.status).toBe(201);

          const one = await answer(api.get(`/tenants/products/${created.data.product.id}`, bearer(operatorToken)));
          expect(one.status).toBe(200);

          const removed = await answer(api.delete(`/tenants/products/${created.data.product.id}`, bearer(operatorToken)));
          expect(removed.status).toBe(403);
          expect(removed.data.permission).toBe("catalog");
        });

        it("lets a manager read the shop's languages and refuses her to change them", async () => {
          const read = await answer(api.get("/tenants/locale-settings", bearer(managerToken)));
          expect(read.status).toBe(200);

          const write = await answer(api.put("/tenants/locale-settings", {}, bearer(managerToken)));
          expect(write.status).toBe(403);
          expect(write.data.permission).toBe("settings");
        });

        it("keeps the reads that carry settings and keys closed for a manager, read included", async () => {
          for (const path of [
            "/tenants/payment-settings",
            "/tenants/sites",
            "/tenants/wb/key",
            "/tenants/marketplaces/wb/key",
            "/tenants/telegram-bot",
          ]) {
            const refused = await answer(api.get(path, bearer(managerToken)));
            expect(`${path} ${refused.status} ${refused.data.permission}`).toBe(`${path} 403 settings`);
          }
        });

        it("opens the reference reads of an order screen to an operator", async () => {
          for (const path of [
            "/tenants/store",
            "/tenants/regions",
            "/tenants/sales-channels",
            "/tenants/stock-locations",
            "/tenants/shipping-options",
            "/tenants/product-variants",
            "/tenants/me/shops",
            // What the panel's shell reads on every screen (§12.1).
            "/tenants/domains",
            "/tenants/branding",
            "/tenants/locale-settings",
          ]) {
            const response = await answer(api.get(path, bearer(operatorToken)));
            expect(`${path} ${response.status}`).toBe(`${path} 200`);
          }
        });

        it("keeps the writes next to the shell's reads under their own permission", async () => {
          const domain = await answer(api.post("/tenants/domains", { host: "shop.example.com" }, bearer(managerToken)));
          expect(`${domain.status} ${domain.data.permission}`).toBe("403 settings");

          const look = await answer(api.put("/tenants/branding", {}, bearer(operatorToken)));
          expect(`${look.status} ${look.data.permission}`).toBe("403 storefront");
        });

        it("shows a manager the gates of writing to Wildberries and lets only an owner switch them", async () => {
          const read = await answer(api.get("/tenants/wb/write-settings", bearer(managerToken)));
          expect(read.status).toBe(200);

          const write = await answer(api.put("/tenants/wb/write-settings", {}, bearer(managerToken)));
          expect(`${write.status} ${write.data.permission}`).toBe("403 settings");

          const asOperator = await answer(api.get("/tenants/wb/write-settings", bearer(operatorToken)));
          expect(`${asOperator.status} ${asOperator.data.permission}`).toBe("403 marketplaces");
        });

        it("refuses before the body is looked at: 403, not the validator's 400", async () => {
          const response = await addStaff(operatorToken, { nonsense: true });
          expect(response.status).toBe(403);
          expect(response.data.permission).toBe("staff");
        });

        it("still answers 401 with no token, and with a token of another actor type", async () => {
          const anonymous = await answer(api.get("/tenants/orders"));
          expect(anonymous.status).toBe(401);

          const asPlatformStaff = await answer(api.get("/tenants/orders", adminHeaders));
          expect(asPlatformStaff.status).toBe(401);
        });
      });

      describe("a role changed, a login removed", () => {
        it("puts a new role in force on the very next request of the same token", async () => {
          const before = await answer(api.get("/tenants/reviews", bearer(operatorToken)));
          expect(before.status).toBe(403);

          const promoted = await editStaff(ownerToken, operator.id, { role: "manager" });
          expect(promoted.status).toBe(200);
          expect(promoted.data.staff_member.role).toBe("manager");

          const after = await answer(api.get("/tenants/reviews", bearer(operatorToken)));
          expect(after.status).toBe(200);

          const me = await api.get("/tenants/me", bearer(operatorToken));
          expect(me.data.tenant_admin.role).toBe("manager");
          expect(me.data.tenant_admin.permissions).toEqual(MANAGER_PERMISSIONS);
        });

        it("takes a permission away on the next request as well", async () => {
          const before = await answer(api.get("/tenants/pages", bearer(managerToken)));
          expect(before.status).toBe(200);

          const demoted = await editStaff(ownerToken, manager.id, { role: "operator" });
          expect(demoted.status).toBe(200);

          const after = await answer(api.get("/tenants/pages", bearer(managerToken)));
          expect(after.status).toBe(403);
          expect(after.data.permission).toBe("storefront");
        });

        it("answers 401 on every route to a login that was removed, its token still valid", async () => {
          const removed = await removeStaff(ownerToken, operator.id);
          expect(removed.status).toBe(200);
          expect(removed.data).toEqual({ id: operator.id, object: "tenant_admin", deleted: true });

          for (const request of [
            () => api.get("/tenants/me", bearer(operatorToken)),
            () => api.get("/tenants/orders", bearer(operatorToken)),
            () => api.get("/tenants/store", bearer(operatorToken)),
            () => api.get("/tenants/me/shops", bearer(operatorToken)),
            () => api.post("/tenants/me/switch", { tenant_id: shopA.id }, bearer(operatorToken)),
            () => api.post("/tenants/me", { first_name: "Ghost" }, bearer(operatorToken)),
          ]) {
            const response = await answer(request());
            expect(response.status).toBe(401);
          }

          // The others are untouched.
          const stillManager = await answer(api.get("/tenants/orders", bearer(managerToken)));
          expect(stillManager.status).toBe(200);
        });
      });

      describe("GET /tenants/staff", () => {
        it("lists the shop's own logins, marks the caller and leaves the platform's row out", async () => {
          const staff = await staffOf(ownerToken);

          expect(staff.map((member) => `${member.email} ${member.role} ${member.is_self}`).sort()).toEqual(
            [`${OWNER_A} owner true`, `${MANAGER_A} manager false`, `${OPERATOR_A} operator false`].sort(),
          );

          // The platform's row IS in the shop: the platform's own list shows it.
          const admins = await platformAdminsOf(shopA);
          expect(admins.map((admin) => admin.email)).toContain(PLATFORM_EMAIL);
          expect(staff.map((member) => member.email)).not.toContain(PLATFORM_EMAIL);
        });

        it("answers exactly the fields of the contract: no password, no metadata", async () => {
          const [member] = await staffOf(ownerToken);

          expect(Object.keys(member).sort()).toEqual(
            ["created_at", "email", "first_name", "id", "is_self", "last_name", "role", "updated_at"].sort(),
          );
        });

        it("answers every role with what it opens, in the order owner, manager, operator", async () => {
          const response = await api.get("/tenants/staff", bearer(ownerToken));

          expect(response.data.roles).toEqual([
            { role: "owner", permissions: ALL_PERMISSIONS },
            { role: "manager", permissions: MANAGER_PERMISSIONS },
            { role: "operator", permissions: OPERATOR_PERMISSIONS },
          ]);
        });

        it("never shows another shop's logins", async () => {
          const staffB = await staffOf(ownerBToken);
          expect(staffB.map((member) => member.email)).toEqual([OWNER_B]);
        });
      });

      describe("POST /tenants/staff", () => {
        it("creates a login with the role asked for, and the password works", async () => {
          const created = await addStaff(ownerToken, {
            email: "new-operator@roles-suite.test",
            password: OTHER_PASSWORD,
            role: "operator",
            first_name: "Nina",
            last_name: "N",
          });

          expect(created.status).toBe(201);
          expect(created.data.staff_member).toMatchObject({
            email: "new-operator@roles-suite.test",
            first_name: "Nina",
            last_name: "N",
            role: "operator",
            is_self: false,
          });
          expect(JSON.stringify(created.data)).not.toContain(OTHER_PASSWORD);

          const token = await login("new-operator@roles-suite.test", OTHER_PASSWORD);
          const me = await api.get("/tenants/me", bearer(token));
          expect(me.data.tenant_admin.role).toBe("operator");
          expect(me.data.tenant_admin.tenant.id).toBe(shopA.id);
        });

        it("refuses a body without a role, an unknown role, and a short password", async () => {
          const noRole = await addStaff(ownerToken, { email: "x@roles-suite.test", password: PASSWORD });
          expect(noRole.status).toBe(400);

          const unknownRole = await addStaff(ownerToken, {
            email: "x@roles-suite.test",
            password: PASSWORD,
            role: "admin",
          });
          expect(unknownRole.status).toBe(400);

          const shortPassword = await addStaff(ownerToken, {
            email: "x@roles-suite.test",
            password: "short",
            role: "operator",
          });
          expect(shortPassword.status).toBe(400);
          expect(JSON.stringify(shortPassword.data)).not.toContain("short\"");

          expect((await staffOf(ownerToken)).length).toBe(3);
        });

        it("refuses an email this shop already has a login for, and creates nothing", async () => {
          const response = await addStaff(ownerToken, { email: MANAGER_A, password: OTHER_PASSWORD, role: "owner" });

          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.email_taken_in_shop);

          const staff = await staffOf(ownerToken);
          expect(staff.length).toBe(3);
          expect(staff.find((member) => member.email === MANAGER_A)?.role).toBe("manager");
          // The manager's password is the one she had.
          expect((await tryLogin(MANAGER_A, OTHER_PASSWORD)).status).toBe(401);
          expect((await tryLogin(MANAGER_A, PASSWORD)).status).toBe(200);
        });

        it("cannot take over a login of another shop: 400, no row, the password untouched", async () => {
          const response = await addStaff(ownerToken, { email: OWNER_B, password: OTHER_PASSWORD, role: "operator" });

          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.email_has_account);

          expect((await staffOf(ownerToken)).map((member) => member.email)).not.toContain(OWNER_B);
          // Owner B still logs in with her own password and not with the one shop A's owner chose.
          expect((await tryLogin(OWNER_B, OTHER_PASSWORD)).status).toBe(401);
          const stillB = await login(OWNER_B);
          const me = await api.get("/tenants/me", bearer(stillB));
          expect(me.data.tenant_admin.tenant.id).toBe(shopB.id);
        });

        it("refuses an email whose identity was registered in advance and has no login anywhere", async () => {
          const preRegistered = await api.post("/auth/tenant/emailpass/register", {
            email: "squatter@roles-suite.test",
            password: OTHER_PASSWORD,
          });
          expect(preRegistered.status).toBe(200);

          const response = await addStaff(ownerToken, {
            email: "squatter@roles-suite.test",
            password: PASSWORD,
            role: "manager",
          });

          expect(response.status).toBe(400);
          expect(response.data.message).toContain("already has an account on the platform");
          expect((await staffOf(ownerToken)).length).toBe(3);
        });

        it("refuses an email this shop already has in another letter case", async () => {
          const response = await addStaff(ownerToken, {
            email: MANAGER_A.toUpperCase(),
            password: OTHER_PASSWORD,
            role: "operator",
          });

          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.email_taken_in_shop);
          expect((await staffOf(ownerToken)).length).toBe(3);
        });

        it("gives a login whose email differs from another shop's owner only by case nothing of that shop", async () => {
          // Emails are told apart exactly, the way the identities behind them
          // are: this is a different person's login, with its own password.
          const lookalike = OWNER_B.replace("owner-b", "Owner-B");
          expect(lookalike).not.toBe(OWNER_B);
          expect(lookalike.toLowerCase()).toBe(OWNER_B);

          const created = await addStaff(ownerToken, { email: lookalike, password: OTHER_PASSWORD, role: "owner" });
          expect(created.status).toBe(201);

          const token = await login(lookalike, OTHER_PASSWORD);

          const shops = await api.get("/tenants/me/shops", bearer(token));
          const shopIds = (shops.data.shops as { id: string }[]).map((shop) => shop.id);
          expect(shopIds).toContain(shopA.id);
          expect(shopIds).not.toContain(shopB.id);

          const switched = await answer(api.post("/tenants/me/switch", { tenant_id: shopB.id }, bearer(token)));
          expect(switched.status).toBe(403);

          // And owner B is who she was, under her own password.
          expect((await tryLogin(OWNER_B, OTHER_PASSWORD)).status).toBe(401);
          const me = await api.get("/tenants/me", bearer(await login(OWNER_B)));
          expect(me.data.tenant_admin.tenant.id).toBe(shopB.id);
        });

        it("refuses the platform's own email the same way as any taken one", async () => {
          const response = await addStaff(ownerToken, { email: PLATFORM_EMAIL, password: PASSWORD, role: "owner" });
          expect(response.status).toBe(400);
          expect((await staffOf(ownerToken)).length).toBe(3);
        });
      });

      describe("POST /tenants/staff/:id", () => {
        it("changes the name and the role of another login", async () => {
          const response = await editStaff(ownerToken, operator.id, {
            first_name: "Oksana",
            last_name: "O",
            role: "manager",
          });

          expect(response.status).toBe(200);
          expect(response.data.staff_member).toMatchObject({
            id: operator.id,
            email: OPERATOR_A,
            first_name: "Oksana",
            last_name: "O",
            role: "manager",
            is_self: false,
          });
        });

        it("refuses the caller to change her own role, and lets her change her own name", async () => {
          const [self] = (await staffOf(ownerToken)).filter((member) => member.is_self);

          const demoted = await editStaff(ownerToken, self.id, { role: "manager" });
          expect(demoted.status).toBe(400);
          expect(demoted.data.message).toBe(STAFF_REFUSALS.own_role);

          const renamed = await editStaff(ownerToken, self.id, { first_name: "Anna", role: "owner" });
          expect(renamed.status).toBe(200);
          expect(renamed.data.staff_member).toMatchObject({ first_name: "Anna", role: "owner", is_self: true });
        });

        it("sets a new password for a login that is this shop's only", async () => {
          const response = await editStaff(ownerToken, operator.id, { password: OTHER_PASSWORD });
          expect(response.status).toBe(200);
          expect(JSON.stringify(response.data)).not.toContain(OTHER_PASSWORD);

          expect((await tryLogin(OPERATOR_A, PASSWORD)).status).toBe(401);
          expect((await tryLogin(OPERATOR_A, OTHER_PASSWORD)).status).toBe(200);
        });

        it("refuses a short password", async () => {
          const response = await editStaff(ownerToken, operator.id, { password: "short" });
          expect(response.status).toBe(400);
          expect((await tryLogin(OPERATOR_A, PASSWORD)).status).toBe(200);
        });

        it("cannot change the password of a login that is also another shop's", async () => {
          // Owner B gets a row in shop A the way the platform attaches an
          // existing account: a row under the same email, no new identity.
          const tenantModuleService: TenantModuleService = getContainer().resolve(TENANT_MODULE);
          const attached = await tenantModuleService.createTenantAdmins({
            email: OWNER_B,
            tenant_id: shopA.id,
            role: "manager",
          });

          const response = await editStaff(ownerToken, attached.id, { password: OTHER_PASSWORD });
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.password_shared);

          expect((await tryLogin(OWNER_B, OTHER_PASSWORD)).status).toBe(401);
          expect((await tryLogin(OWNER_B, PASSWORD)).status).toBe(200);

          // Everything that is this shop's about the row stays editable.
          const roleOnly = await editStaff(ownerToken, attached.id, { role: "operator", first_name: "Bella" });
          expect(roleOnly.status).toBe(200);
          expect(roleOnly.data.staff_member).toMatchObject({ role: "operator", first_name: "Bella" });
        });

        it("has no way to move a login to another email", async () => {
          const response = await editStaff(ownerToken, operator.id, { email: "moved@roles-suite.test" });
          expect(response.status).toBe(400);
          expect((await staffOf(ownerToken)).map((member) => member.email)).toContain(OPERATOR_A);
        });

        it("answers 404 for the platform's row, for another shop's login and for an unknown id", async () => {
          const platformRow = (await platformAdminsOf(shopA)).find((admin) => admin.email === PLATFORM_EMAIL);
          const ownerBRow = (await platformAdminsOf(shopB)).find((admin) => admin.email === OWNER_B);
          expect(platformRow).toBeDefined();
          expect(ownerBRow).toBeDefined();

          for (const id of [platformRow!.id, ownerBRow!.id, "tenadm_does_not_exist"]) {
            const edited = await editStaff(ownerToken, id, { role: "operator" });
            expect(`${id} ${edited.status}`).toBe(`${id} 404`);

            const removed = await removeStaff(ownerToken, id);
            expect(`${id} ${removed.status}`).toBe(`${id} 404`);
          }

          // Both rows are where they were, with the role they had.
          const adminsA = await platformAdminsOf(shopA);
          expect(adminsA.find((admin) => admin.email === PLATFORM_EMAIL)?.role).toBe("owner");
          const adminsB = await platformAdminsOf(shopB);
          expect(adminsB.find((admin) => admin.email === OWNER_B)?.role).toBe("owner");
        });
      });

      describe("DELETE /tenants/staff/:id", () => {
        it("removes another login; the removed person can no longer log in", async () => {
          const response = await removeStaff(ownerToken, manager.id);
          expect(response.status).toBe(200);
          expect(response.data).toEqual({ id: manager.id, object: "tenant_admin", deleted: true });

          expect((await staffOf(ownerToken)).map((member) => member.email)).not.toContain(MANAGER_A);
          expect((await tryLogin(MANAGER_A, PASSWORD)).status).toBe(401);
        });

        it("refuses the caller to remove herself", async () => {
          const [self] = (await staffOf(ownerToken)).filter((member) => member.is_self);

          const response = await removeStaff(ownerToken, self.id);
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.own_login);
          expect((await staffOf(ownerToken)).length).toBe(3);
        });

        it("with two owners, one can demote or remove the other, and then is the last one", async () => {
          const second = await addStaff(ownerToken, { email: SECOND_OWNER_A, password: PASSWORD, role: "owner" });
          expect(second.status).toBe(201);
          const secondToken = await login(SECOND_OWNER_A);
          const [first] = (await staffOf(ownerToken)).filter((member) => member.is_self);

          const demoted = await editStaff(secondToken, first.id, { role: "manager" });
          expect(demoted.status).toBe(200);

          // The first owner's token is a manager's from this request on.
          const refused = await answer(api.get("/tenants/staff", bearer(ownerToken)));
          expect(refused.status).toBe(403);

          // The second owner is now the last: the platform cannot demote or remove her.
          const byPlatform = await answer(
            api.post(`/admin/tenants/${shopA.id}/admins/${second.data.staff_member.id}`, { role: "operator" }, adminHeaders),
          );
          expect(byPlatform.status).toBe(400);
          expect(byPlatform.data.message).toBe(STAFF_REFUSALS.last_owner_demote);

          const removedByPlatform = await answer(
            api.delete(`/admin/tenants/${shopA.id}/admins/${second.data.staff_member.id}`, adminHeaders),
          );
          expect(removedByPlatform.status).toBe(400);
          expect(removedByPlatform.data.message).toBe(STAFF_REFUSALS.last_owner_remove);

          // A login that is not an owner can be removed by her.
          const removedFirst = await removeStaff(secondToken, first.id);
          expect(removedFirst.status).toBe(200);
        });
      });

      describe("the platform's routes (/admin/tenants/:id/admins)", () => {
        it("lists every login with its role, the platform's row included", async () => {
          const admins = await platformAdminsOf(shopA);

          expect(admins.map((admin) => `${admin.email} ${admin.role}`).sort()).toEqual(
            [
              `${PLATFORM_EMAIL} owner`,
              `${OWNER_A} owner`,
              `${MANAGER_A} manager`,
              `${OPERATOR_A} operator`,
            ].sort(),
          );
        });

        it("carries the role of every login in the shop card, which is what the platform's screen reads", async () => {
          const expected = [
            `${PLATFORM_EMAIL} owner`,
            `${OWNER_A} owner`,
            `${MANAGER_A} manager`,
            `${OPERATOR_A} operator`,
          ].sort();
          const rolesIn = (admins: PlatformAdmin[]) => admins.map((admin) => `${admin.email} ${admin.role}`).sort();

          // GET /admin/tenants/:id
          const card = await api.get(`/admin/tenants/${shopA.id}`, adminHeaders);
          expect(card.status).toBe(200);
          expect(rolesIn(card.data.tenant.admins)).toEqual(expected);

          // POST /admin/tenants/:id answers the same card.
          const renamed = await api.post(`/admin/tenants/${shopA.id}`, { name: "Roles shop A, renamed" }, adminHeaders);
          expect(renamed.status).toBe(200);
          expect(renamed.data.tenant.name).toBe("Roles shop A, renamed");
          expect(rolesIn(renamed.data.tenant.admins)).toEqual(expected);

          // A role changed by the shop's owner is in the card at once.
          const promoted = await editStaff(ownerToken, operator.id, { role: "manager" });
          expect(promoted.status).toBe(200);
          const after = await api.get(`/admin/tenants/${shopA.id}`, adminHeaders);
          expect(
            (after.data.tenant.admins as PlatformAdmin[]).find((admin) => admin.email === OPERATOR_A)?.role,
          ).toBe("manager");

          // DELETE /admin/tenants/:id answers no logins at all; the card of the archived shop still does.
          const archived = await api.delete(`/admin/tenants/${shopB.id}`, adminHeaders);
          expect(archived.status).toBe(200);
          expect(archived.data).not.toHaveProperty("tenant");
          const cardB = await api.get(`/admin/tenants/${shopB.id}`, adminHeaders);
          expect(rolesIn(cardB.data.tenant.admins)).toEqual([`${PLATFORM_EMAIL} owner`, `${OWNER_B} owner`].sort());
        });

        it("creates an owner when no role is named, and the role named otherwise", async () => {
          const byDefault = await answer(
            api.post(
              `/admin/tenants/${shopA.id}/admins`,
              { email: "by-default@roles-suite.test", password: PASSWORD },
              adminHeaders,
            ),
          );
          expect(byDefault.status).toBe(201);
          expect(byDefault.data.admin.role).toBe("owner");

          const named = await answer(
            api.post(
              `/admin/tenants/${shopA.id}/admins`,
              { email: "named@roles-suite.test", password: PASSWORD, role: "operator" },
              adminHeaders,
            ),
          );
          expect(named.status).toBe(201);
          expect(named.data.admin.role).toBe("operator");

          const unknown = await answer(
            api.post(
              `/admin/tenants/${shopA.id}/admins`,
              { email: "unknown@roles-suite.test", password: PASSWORD, role: "root" },
              adminHeaders,
            ),
          );
          expect(unknown.status).toBe(400);
        });

        it("changes a role, and the shop sees it on the next request", async () => {
          const response = await answer(
            api.post(`/admin/tenants/${shopA.id}/admins/${operator.id}`, { role: "manager" }, adminHeaders),
          );
          expect(response.status).toBe(200);
          expect(response.data.admin.role).toBe("manager");

          const reviews = await answer(api.get("/tenants/reviews", bearer(operatorToken)));
          expect(reviews.status).toBe(200);
        });

        it("keeps the last owner: no demotion and no removal, the platform's own row not counted", async () => {
          const admins = await platformAdminsOf(shopA);
          const owner = admins.find((admin) => admin.email === OWNER_A)!;
          // Two rows of the shop are owners, and one of them is the platform's.
          expect(admins.filter((admin) => admin.role === "owner").length).toBe(2);

          const demoted = await answer(
            api.post(`/admin/tenants/${shopA.id}/admins/${owner.id}`, { role: "manager" }, adminHeaders),
          );
          expect(demoted.status).toBe(400);
          expect(demoted.data.message).toBe(STAFF_REFUSALS.last_owner_demote);

          const removed = await answer(api.delete(`/admin/tenants/${shopA.id}/admins/${owner.id}`, adminHeaders));
          expect(removed.status).toBe(400);
          expect(removed.data.message).toBe(STAFF_REFUSALS.last_owner_remove);

          // A manager and an operator can always be removed.
          const removedManager = await answer(
            api.delete(`/admin/tenants/${shopA.id}/admins/${manager.id}`, adminHeaders),
          );
          expect(removedManager.status).toBe(200);

          expect((await api.get("/tenants/me", bearer(ownerToken))).data.tenant_admin.role).toBe("owner");
        });
      });

      describe("the migration, on a table that already holds logins", () => {
        type Sql = { raw: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };
        type Connection = Sql & { transaction: (work: (trx: Sql) => Promise<void>) => Promise<void> };

        /** The statements of one direction, exactly as the migration file hands them to the runner. */
        const statementsOf = async (direction: "up" | "down") => {
          const migration = new Migration20261008010000(undefined as never, undefined as never);
          await migration[direction]();
          return migration.getQueries() as string[];
        };

        const ROLLBACK = new Error("rolled back on purpose");

        it("turns every login into an owner, refuses an unknown role, and comes off cleanly", async () => {
          const connection: Connection = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          const up = await statementsOf("up");
          const down = await statementsOf("down");
          expect(up.length).toBeGreaterThan(0);
          expect(down.length).toBeGreaterThan(0);

          const seen: Record<string, unknown> = {};

          // DDL is transactional in Postgres: everything below is undone, so
          // the next test still finds the roles `beforeAll` gave.
          await connection
            .transaction(async (trx) => {
              // The table as it was before this task: the same rows, no column.
              for (const statement of down) {
                await trx.raw(statement);
              }
              seen.columnsBefore = (
                await trx.raw(
                  `select column_name from information_schema.columns where table_name = 'tenant_admin' and column_name = 'role'`,
                )
              ).rows.length;
              seen.loginsBefore = Number((await trx.raw(`select count(*) as n from "tenant_admin"`)).rows[0].n);

              for (const statement of up) {
                await trx.raw(statement);
              }
              // A second run must be a no-op, the way every migration here is written.
              for (const statement of up) {
                await trx.raw(statement);
              }

              seen.roles = (
                await trx.raw(`select "role", count(*) as n from "tenant_admin" group by "role"`)
              ).rows.map((row) => `${row.role} ${row.n}`);
              seen.nullable = (
                await trx.raw(
                  `select is_nullable, column_default from information_schema.columns where table_name = 'tenant_admin' and column_name = 'role'`,
                )
              ).rows[0];

              await trx.raw(`savepoint before_bad_role`);
              seen.badRole = await trx
                .raw(`update "tenant_admin" set "role" = 'root'`)
                .then(() => "accepted")
                .catch((error: Error) => error.message);
              await trx.raw(`rollback to savepoint before_bad_role`);

              throw ROLLBACK;
            })
            .catch((error) => {
              if (error !== ROLLBACK) {
                throw error;
              }
            });

          expect(seen.columnsBefore).toBe(0);
          // Shop A's three, the three owners' and the platform's row in each of the three shops.
          expect(seen.loginsBefore).toBe(8);
          expect(seen.roles).toEqual(["owner 8"]);
          expect(seen.nullable).toEqual({ is_nullable: "NO", column_default: "'owner'::text" });
          expect(String(seen.badRole)).toContain("check");

          // And the rollback really put the suite's own roles back.
          const me = await api.get("/tenants/me", bearer(operatorToken));
          expect(me.data.tenant_admin.role).toBe("operator");
        });
      });

      describe("the sister sites of one client (POST /tenants/me/switch, GET /tenants/me/shops)", () => {
        const shopIdsOf = async (token: string) => {
          const shops = await api.get("/tenants/me/shops", bearer(token));
          expect(shops.status).toBe(200);
          return (shops.data.shops as { id: string }[]).map((shop) => shop.id);
        };

        const switchTo = (token: string, tenantId: string) =>
          answer(api.post("/tenants/me/switch", { tenant_id: tenantId }, bearer(token)));

        it.each([
          ["operator", () => operatorToken],
          ["manager", () => managerToken],
        ])("neither offers a sister site to an %s nor lets her in", async (_role, token) => {
          expect(await shopIdsOf(token())).toEqual([shopA.id]);

          const refused = await switchTo(token(), shopS.id);
          expect(refused.status).toBe(403);
          // The same refusal as for a shop that is not of this client at all.
          const foreign = await switchTo(token(), shopB.id);
          expect(foreign.status).toBe(403);
          expect(refused.data.message.replace(shopS.id, "")).toBe(foreign.data.message.replace(shopB.id, ""));

          // No row was made for her on the sister site.
          const admins = await platformAdminsOf(shopS);
          expect(admins.map((admin) => admin.email).sort()).toEqual([PLATFORM_EMAIL, OWNER_S].sort());
        });

        it("offers the sister site to an owner and makes her an owner there", async () => {
          expect((await shopIdsOf(ownerToken)).sort()).toEqual([shopA.id, shopS.id].sort());

          const switched = await switchTo(ownerToken, shopS.id);
          expect(switched.status).toBe(200);

          const me = await api.get("/tenants/me", bearer(switched.data.token));
          expect(me.data.tenant_admin.tenant.id).toBe(shopS.id);
          expect(me.data.tenant_admin.role).toBe("owner");
          expect(me.data.tenant_admin.permissions).toEqual(ALL_PERMISSIONS);
        });

        it("lets a manager into a sister site once a row waits for her there, with that row's role", async () => {
          const tenantModuleService: TenantModuleService = getContainer().resolve(TENANT_MODULE);
          await tenantModuleService.createTenantAdmins({ email: MANAGER_A, tenant_id: shopS.id, role: "operator" });

          expect((await shopIdsOf(managerToken)).sort()).toEqual([shopA.id, shopS.id].sort());

          const switched = await switchTo(managerToken, shopS.id);
          expect(switched.status).toBe(200);

          const me = await api.get("/tenants/me", bearer(switched.data.token));
          expect(me.data.tenant_admin.role).toBe("operator");
        });

        it("does not let the owner of a sister site set the password of a row the switch made", async () => {
          // Owner A opens the sister site: the switch makes her a row there.
          const switched = await switchTo(ownerToken, shopS.id);
          expect(switched.status).toBe(200);

          const ownerSToken = await login(OWNER_S);
          const arrived = (await staffOf(ownerSToken)).find((member) => member.email === OWNER_A);
          expect(arrived).toBeDefined();

          const response = await editStaff(ownerSToken, arrived!.id, { password: OTHER_PASSWORD });
          expect(response.status).toBe(400);
          expect(response.data.message).toBe(STAFF_REFUSALS.password_shared);

          // Owner A still logs in with her own password, and only with it.
          expect((await tryLogin(OWNER_A, OTHER_PASSWORD)).status).toBe(401);
          expect((await tryLogin(OWNER_A, PASSWORD)).status).toBe(200);
        });

        it("an owner removed from one site is still an owner of its sister and comes back by the switch", async () => {
          // §11.6: described, not changed. Two owners of site A, one of them
          // also holds a row on the sister site.
          const second = await addStaff(ownerToken, { email: SECOND_OWNER_A, password: PASSWORD, role: "owner" });
          expect(second.status).toBe(201);
          const secondToken = await login(SECOND_OWNER_A);
          const onSister = await switchTo(secondToken, shopS.id);
          expect(onSister.status).toBe(200);

          const removed = await removeStaff(ownerToken, second.data.staff_member.id);
          expect(removed.status).toBe(200);

          // Her token for site A is dead, her token for the sister site is not.
          expect((await answer(api.get("/tenants/me", bearer(secondToken)))).status).toBe(401);
          const back = await switchTo(onSister.data.token, shopA.id);
          expect(back.status).toBe(200);

          const me = await api.get("/tenants/me", bearer(back.data.token));
          expect(me.data.tenant_admin.tenant.id).toBe(shopA.id);
          expect(me.data.tenant_admin.role).toBe("owner");
        });
      });
    });
  },
});
