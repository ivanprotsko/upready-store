import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of piece 9 (`t-2026-09-12-mt-storefront-by-host`): the storefront's
 * Host resolver and the panel's Domains routes.
 *
 * The point of the first test is what it does NOT send. `GET
 * /storefront/by-host` carries no authorization and no publishable key, because
 * it is the call that hands the key out — a resolver under `/store/*` would be
 * refused by the framework's own key gate before it ran
 * (`docs/multitenancy/storefront-by-host.md` §1, measured on the stand).
 *
 * Runner facts, same as `tenants.spec.ts`: a throwaway database migrated from
 * this repository's config, restored from its post-`beforeAll` snapshot before
 * every test, and `DB_HOST` must be the literal `localhost` or the runner forces
 * SSL and nothing connects.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string } };
};

const PASSWORD = "supersecret";

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: storefront by host", () => {
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

      it("resolves a tenant by its technical host with no headers at all, and hands out its publishable key", async () => {
        const resolved = await api.get("/storefront/by-host?host=acme.localhost");

        expect(resolved.status).toBe(200);
        expect(resolved.config.headers.authorization).toBeUndefined();
        expect(resolved.config.headers["x-publishable-api-key"]).toBeUndefined();

        expect(resolved.data.tenant).toEqual({
          id: a.tenant.id,
          handle: "acme",
          name: "Acme",
        });
        expect(resolved.data.publishable_key).toBe(a.tenant.api_key.token);
        // No home document saved yet: theme, settings and home are all null, and
        // the storefront keeps its build profile rather than failing to render.
        expect(resolved.data.theme).toBeNull();
        expect(resolved.data.settings).toBeNull();
        expect(resolved.data.home).toBeNull();
      });

      it("strips the port and the letter case from the host it is asked about", async () => {
        const resolved = await api.get("/storefront/by-host?host=ACME.Localhost%3A8013");

        expect(resolved.status).toBe(200);
        expect(resolved.data.tenant.handle).toBe("acme");
      });

      it("answers 404 for a host no tenant owns, and 400 with no host at all", async () => {
        const unknown = await failed(api.get("/storefront/by-host?host=nobody.example"));
        expect(unknown.status).toBe(404);

        const missing = await failed(api.get("/storefront/by-host"));
        expect(missing.status).toBe(400);
      });

      it("lists the technical hosts of the caller and nobody else", async () => {
        const listA = await api.get("/tenants/domains", bearer(a.token));
        expect(listA.status).toBe(200);
        expect(listA.data.domains).toEqual([]);
        expect(listA.data.technical).toEqual(["acme.upready.dev", "acme.localhost"]);

        const listB = await api.get("/tenants/domains", bearer(b.token));
        expect(listB.data.technical).toEqual(["globex.upready.dev", "globex.localhost"]);
      });

      it("needs a tenant token", async () => {
        const anonymous = await failed(api.get("/tenants/domains"));
        expect(anonymous.status).toBe(401);
      });

      it("resolves a custom host as soon as the tenant adds it, without a restart", async () => {
        const created = await api.post(
          "/tenants/domains",
          { host: "ACME.example:8080" },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        // Stored lowercase and without the port, so a Host header compares byte
        // for byte with the row.
        expect(created.data.domain.host).toBe("acme.example");

        const resolved = await api.get("/storefront/by-host?host=acme.example");
        expect(resolved.status).toBe(200);
        expect(resolved.data.tenant.id).toBe(a.tenant.id);
        expect(resolved.data.publishable_key).toBe(a.tenant.api_key.token);

        const listA = await api.get("/tenants/domains", bearer(a.token));
        expect(listA.data.domains).toEqual([{ id: created.data.domain.id, host: "acme.example" }]);
      });

      it("refuses a host another tenant already holds, with 409 and no hint who holds it", async () => {
        // A host whose own spelling says nothing about its owner, so the
        // assertion below tests the MESSAGE and not the name of the domain.
        await api.post("/tenants/domains", { host: "shop.example.com" }, bearer(a.token));

        const refused = await failed(
          api.post("/tenants/domains", { host: "shop.example.com" }, bearer(b.token)),
        );
        expect(refused.status).toBe(409);
        expect(refused.data.type).toBe("duplicate_error");
        // It names the host the caller sent, and nothing about its owner —
        // neither the handle, nor the display name, nor the id.
        expect(refused.data.message).toBe('Host "shop.example.com" is already in use.');
        expect(refused.data.message).not.toContain(a.tenant.id);

        const listB = await api.get("/tenants/domains", bearer(b.token));
        expect(listB.data.domains).toEqual([]);
      });

      it("refuses another tenant's technical host, and every other <handle>.<base domain> name", async () => {
        const foreign = await failed(
          api.post("/tenants/domains", { host: "acme.upready.dev" }, bearer(b.token)),
        );
        expect(foreign.status).toBe(409);
        expect(foreign.data.type).toBe("duplicate_error");

        // Stricter than "another tenant's": the whole shape is reserved, so a row
        // can never shadow the technical host of a tenant registered later.
        const unclaimed = await failed(
          api.post("/tenants/domains", { host: "nobody-yet.upready.dev" }, bearer(b.token)),
        );
        expect(unclaimed.status).toBe(409);

        // Including the caller's own: it is already served and has no row to add.
        const own = await failed(
          api.post("/tenants/domains", { host: "globex.localhost" }, bearer(b.token)),
        );
        expect(own.status).toBe(409);

        // A deeper name under the same base domain is a custom host, not a
        // technical one, and is allowed.
        const deeper = await api.post(
          "/tenants/domains",
          { host: "shop.globex.upready.dev" },
          bearer(b.token),
        );
        expect(deeper.status).toBe(201);
      });

      it("refuses a malformed host before it reaches the database", async () => {
        const single = await failed(
          api.post("/tenants/domains", { host: "localhost" }, bearer(a.token)),
        );
        expect(single.status).toBe(400);

        const spaced = await failed(
          api.post("/tenants/domains", { host: "not a host" }, bearer(a.token)),
        );
        expect(spaced.status).toBe(400);
      });

      it("does not let one tenant see or delete another tenant's domains", async () => {
        const created = await api.post(
          "/tenants/domains",
          { host: "acme.example" },
          bearer(a.token),
        );
        const domainId = created.data.domain.id;

        const listB = await api.get("/tenants/domains", bearer(b.token));
        expect(listB.data.domains).toEqual([]);

        const removed = await failed(api.delete(`/tenants/domains/${domainId}`, bearer(b.token)));
        expect(removed.status).toBe(404);

        // The refusal was a refusal: the host still resolves to its owner.
        const stillThere = await api.get("/storefront/by-host?host=acme.example");
        expect(stillThere.status).toBe(200);
        expect(stillThere.data.tenant.id).toBe(a.tenant.id);
      });

      it("stops resolving a host the owner deleted, and lets the same host be added again", async () => {
        const created = await api.post(
          "/tenants/domains",
          { host: "acme.example" },
          bearer(a.token),
        );

        const removed = await api.delete(
          `/tenants/domains/${created.data.domain.id}`,
          bearer(a.token),
        );
        expect(removed.status).toBe(200);
        expect(removed.data).toEqual({
          id: created.data.domain.id,
          object: "domain",
          deleted: true,
        });

        const gone = await failed(api.get("/storefront/by-host?host=acme.example"));
        expect(gone.status).toBe(404);

        // The unique index is partial (`WHERE deleted_at IS NULL`,
        // Migration20260911004426), so a soft-deleted row does not keep the host
        // hostage — for its old owner or for anyone else.
        const again = await api.post(
          "/tenants/domains",
          { host: "acme.example" },
          bearer(b.token),
        );
        expect(again.status).toBe(201);
      });

      it("serves a tenant created just now on its own host, with no restart", async () => {
        const fresh = await registerTenant("initech", "Initech");

        const resolved = await api.get("/storefront/by-host?host=initech.localhost");
        expect(resolved.status).toBe(200);
        expect(resolved.data.tenant.id).toBe(fresh.tenant.id);
        expect(resolved.data.publishable_key).toBe(fresh.tenant.api_key.token);
      });
    });
  },
});
