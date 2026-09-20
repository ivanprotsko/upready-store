import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant's redirect table (`/tenants/redirects*`, shipped by
 * t11-seo-redirects; the `PUT` and this spec are b10-panel-gaps). Every
 * neighbouring tenant resource has one — `tenants-pages.spec.ts`,
 * `tenants-domains.spec.ts` — and this one was the gap the acceptance of PR #29
 * wrote down as a thread.
 *
 * Three seams, and they are not the same seam:
 *   - the owner's own CRUD behind a tenant token;
 *   - isolation, which here means a foreign id is a 404 and never a confirmation
 *     that somebody else's row exists;
 *   - the storefront's read (`GET /store/tenant/redirects`), which carries a
 *     publishable key and no session and is what the middleware actually polls.
 *
 * Runner facts, same as `tenants-domains.spec.ts`: a throwaway database migrated
 * from this repository's config, restored from its post-`beforeAll` snapshot
 * before every test, and `DB_HOST` must be the literal `localhost` or the runner
 * forces SSL and nothing connects.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string } };
};

const PASSWORD = "supersecret";

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: redirects", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const publishable = (key: string) => ({ headers: { "x-publishable-api-key": key } });
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
        const anonymous = await failed(api.get("/tenants/redirects"));
        expect(anonymous.status).toBe(401);
      });

      it("starts empty and adds a rule, defaulting to a permanent redirect", async () => {
        const empty = await api.get("/tenants/redirects", bearer(a.token));
        expect(empty.status).toBe(200);
        expect(empty.data.redirects).toEqual([]);

        const created = await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/old-cube", to_path: "/ru/products/cube-1" },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        expect(created.data.redirect).toEqual({
          id: expect.any(String),
          from_path: "/catalog/old-cube",
          to_path: "/ru/products/cube-1",
          // The owner who types nothing gets the one search engines carry the
          // old address's standing over.
          status_code: 301,
        });

        const listed = await api.get("/tenants/redirects", bearer(a.token));
        expect(listed.data.redirects).toHaveLength(1);
      });

      it("refuses a second rule for the same old address", async () => {
        await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/old-cube", to_path: "/ru/products/cube-1" },
          bearer(a.token),
        );

        const clash = await failed(
          api.post(
            "/tenants/redirects",
            { from_path: "/catalog/old-cube", to_path: "/ru/products/cube-2" },
            bearer(a.token),
          ),
        );

        // Two rules for one source path would make the outcome depend on read
        // order, so this is a refusal with a message and not a silent overwrite.
        expect(clash.status).toBe(400);
        expect(clash.data.message).toContain("/catalog/old-cube");
      });

      it("refuses a body that is not a pair of paths", async () => {
        for (const body of [
          { from_path: "catalog/old", to_path: "/ru/new" },
          { from_path: "/catalog/old", to_path: "https://example.com/new" },
          { from_path: "/catalog/old?utm=1", to_path: "/ru/new" },
          { from_path: "/catalog/old", to_path: "/ru/new", status_code: 418 },
        ]) {
          const refused = await failed(api.post("/tenants/redirects", body, bearer(a.token)));
          expect(refused.status).toBe(400);
        }
      });

      it("edits the target of a rule in place, keeping its old address", async () => {
        const created = await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/old-cube", to_path: "/ru/products/cube-1" },
          bearer(a.token),
        );

        const updated = await api.put(
          `/tenants/redirects/${created.data.redirect.id}`,
          { to_path: "/ru/products/cube-2", status_code: 302 },
          bearer(a.token),
        );

        expect(updated.status).toBe(200);
        expect(updated.data.redirect).toEqual({
          id: created.data.redirect.id,
          from_path: "/catalog/old-cube",
          to_path: "/ru/products/cube-2",
          status_code: 302,
        });

        // A body names only what it changes: the row keeps the rest.
        const partial = await api.put(
          `/tenants/redirects/${created.data.redirect.id}`,
          { to_path: "/ru/products/cube-3" },
          bearer(a.token),
        );
        expect(partial.data.redirect.status_code).toBe(302);
        expect(partial.data.redirect.from_path).toBe("/catalog/old-cube");
      });

      it("refuses an edit that would give two rules the same old address", async () => {
        const first = await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/one", to_path: "/ru/one" },
          bearer(a.token),
        );
        await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/two", to_path: "/ru/two" },
          bearer(a.token),
        );

        const clash = await failed(
          api.put(
            `/tenants/redirects/${first.data.redirect.id}`,
            { from_path: "/catalog/two" },
            bearer(a.token),
          ),
        );

        expect(clash.status).toBe(400);
        expect(clash.data.message).toContain("/catalog/two");
      });

      it("deletes a rule, and answers the same 404 for a foreign row as for one that never existed", async () => {
        const mine = await api.post(
          "/tenants/redirects",
          { from_path: "/catalog/mine", to_path: "/ru/mine" },
          bearer(a.token),
        );

        const foreign = await failed(
          api.delete(`/tenants/redirects/${mine.data.redirect.id}`, bearer(b.token)),
        );
        const unknown = await failed(
          api.delete("/tenants/redirects/tred_does_not_exist", bearer(b.token)),
        );
        expect(foreign.status).toBe(404);
        expect(unknown.status).toBe(404);

        // B could not edit it either, and A's row is still there afterwards.
        const foreignEdit = await failed(
          api.put(
            `/tenants/redirects/${mine.data.redirect.id}`,
            { to_path: "/ru/hijacked" },
            bearer(b.token),
          ),
        );
        expect(foreignEdit.status).toBe(404);

        const deleted = await api.delete(
          `/tenants/redirects/${mine.data.redirect.id}`,
          bearer(a.token),
        );
        expect(deleted.status).toBe(200);
        expect(deleted.data).toEqual({
          id: mine.data.redirect.id,
          object: "tenant_redirect",
          deleted: true,
        });

        const listed = await api.get("/tenants/redirects", bearer(a.token));
        expect(listed.data.redirects).toEqual([]);
      });

      it("lists only the caller's own rules", async () => {
        await api.post(
          "/tenants/redirects",
          { from_path: "/only-a", to_path: "/ru/a" },
          bearer(a.token),
        );
        await api.post(
          "/tenants/redirects",
          { from_path: "/only-b", to_path: "/ru/b" },
          bearer(b.token),
        );

        const listA = await api.get("/tenants/redirects", bearer(a.token));
        const listB = await api.get("/tenants/redirects", bearer(b.token));

        expect(listA.data.redirects.map((row: any) => row.from_path)).toEqual(["/only-a"]);
        expect(listB.data.redirects.map((row: any) => row.from_path)).toEqual(["/only-b"]);
      });

      it("hands the storefront the table of the key's own shop, with no session at all", async () => {
        await api.post(
          "/tenants/redirects",
          { from_path: "/only-a", to_path: "/ru/a", status_code: 308 },
          bearer(a.token),
        );
        await api.post(
          "/tenants/redirects",
          { from_path: "/only-b", to_path: "/ru/b" },
          bearer(b.token),
        );

        const forA = await api.get(
          "/store/tenant/redirects",
          publishable(a.tenant.api_key.token),
        );

        expect(forA.status).toBe(200);
        expect(forA.config.headers.authorization).toBeUndefined();
        expect(forA.data.redirects).toEqual([
          { from_path: "/only-a", to_path: "/ru/a", status_code: 308 },
        ]);
      });
    });
  },
});
