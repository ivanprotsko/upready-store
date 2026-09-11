import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test for tenant-panel wave 2, piece 4 (profile + password). A sibling
 * of `tenants.spec.ts` rather than an extension of it: eight pieces of the
 * same wave touch that file's `describe` block in parallel worktrees, so this
 * one keeps its own copy of the small tenant-registration helper instead of
 * importing anything from it (nothing there is exported anyway; each
 * `describe` callback is its own closure).
 *
 * `POST /tenants/me` and `POST /tenants/me/password` both read the acting
 * tenant admin off the bearer token (`req.auth_context.actor_id`) and never
 * off a body or path id, so "isolation" here is not a 404 on a foreign id
 * (there is no id in either route) — it is proving that tenant B's own call
 * only ever touches tenant B's row, leaving tenant A's name and password
 * exactly as they were.
 */
const PASSWORD = "supersecret";

type Registered = {
  token: string;
  email: string;
  tenant_admin_id: string;
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: profile (POST /tenants/me, POST /tenants/me/password)", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

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

        const me = await api.get("/tenants/me", bearer(login.data.token));

        return {
          token: login.data.token,
          email,
          tenant_admin_id: me.data.tenant_admin.id,
        };
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Ada");
        b = await registerTenant("globex", "Gus");
      });

      it("rejects both routes without a token", async () => {
        const profile = await api.post("/tenants/me", { first_name: "X" }).catch((e) => e.response);
        expect(profile.status).toBe(401);

        const password = await api
          .post("/tenants/me/password", { current_password: PASSWORD, new_password: "newpassword1" })
          .catch((e) => e.response);
        expect(password.status).toBe(401);
      });

      it("updates first_name/last_name/metadata, reflected on the next GET /tenants/me", async () => {
        const updated = await api.post(
          "/tenants/me",
          { first_name: "Adaline", last_name: "Acme-Owner", metadata: { language: "de" } },
          bearer(a.token),
        );
        expect(updated.status).toBe(200);
        expect(updated.data.tenant_admin.first_name).toBe("Adaline");
        expect(updated.data.tenant_admin.last_name).toBe("Acme-Owner");
        expect(updated.data.tenant_admin.metadata).toEqual({ language: "de" });

        const me = await api.get("/tenants/me", bearer(a.token));
        expect(me.data.tenant_admin.first_name).toBe("Adaline");
        expect(me.data.tenant_admin.metadata).toEqual({ language: "de" });

        // Tenant B's own row is untouched by A's update.
        const meB = await api.get("/tenants/me", bearer(b.token));
        expect(meB.data.tenant_admin.first_name).toBe("Gus");
      });

      it("rejects an unknown body field (strictObject)", async () => {
        const response = await api
          .post("/tenants/me", { tenant_id: "ten_evil" }, bearer(a.token))
          .catch((e) => e.response);
        expect(response.status).toBe(400);
      });

      it("401s a password change with the wrong current password, never 404", async () => {
        const response = await api
          .post(
            "/tenants/me/password",
            { current_password: "wrong-password", new_password: "brandnewpassword1" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(response.status).toBe(401);

        // The old password still logs in: nothing was changed on a failed attempt.
        const login = await api.post("/auth/tenant/emailpass", { email: a.email, password: PASSWORD });
        expect(login.status).toBe(200);
      });

      it("400s a new password shorter than 8 characters", async () => {
        const response = await api
          .post(
            "/tenants/me/password",
            { current_password: PASSWORD, new_password: "short1" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(response.status).toBe(400);
      });

      it("changes the password with the right current password, and only that tenant's login moves", async () => {
        const NEW_PASSWORD = "brandnewpassword1";

        const changed = await api.post(
          "/tenants/me/password",
          { current_password: PASSWORD, new_password: NEW_PASSWORD },
          bearer(a.token),
        );
        expect(changed.status).toBe(200);
        expect(changed.data).toEqual({ ok: true });

        const oldLogin = await api
          .post("/auth/tenant/emailpass", { email: a.email, password: PASSWORD })
          .catch((e) => e.response);
        expect(oldLogin.status).toBe(401);

        const newLogin = await api.post("/auth/tenant/emailpass", {
          email: a.email,
          password: NEW_PASSWORD,
        });
        expect(newLogin.status).toBe(200);

        // Tenant B's own password (and login) is untouched by A's change.
        const bLogin = await api.post("/auth/tenant/emailpass", { email: b.email, password: PASSWORD });
        expect(bLogin.status).toBe(200);

        // Restore A's password so any later test in this file can still log in as A.
        const restored = await api.post(
          "/tenants/me/password",
          { current_password: NEW_PASSWORD, new_password: PASSWORD },
          bearer(newLogin.data.token),
        );
        expect(restored.status).toBe(200);
      });

      it("tenant B's password change never touches tenant A's login", async () => {
        const B_NEW_PASSWORD = "globexnewpassword1";

        const changed = await api.post(
          "/tenants/me/password",
          { current_password: PASSWORD, new_password: B_NEW_PASSWORD },
          bearer(b.token),
        );
        expect(changed.status).toBe(200);

        // A still logs in with the original password: B's own call, scoped by
        // B's own token, never reached A's provider identity.
        const aLogin = await api.post("/auth/tenant/emailpass", { email: a.email, password: PASSWORD });
        expect(aLogin.status).toBe(200);

        const bLogin = await api.post("/auth/tenant/emailpass", {
          email: b.email,
          password: B_NEW_PASSWORD,
        });
        expect(bLogin.status).toBe(200);
      });
    });
  },
});
