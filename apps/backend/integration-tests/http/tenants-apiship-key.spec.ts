import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

jest.setTimeout(240_000);

/**
 * Seam test of the ApiShip slot (p01-settings-integrations-restructure).
 *
 * What it proves, each with a request and not by reading code:
 *
 * - `PUT /tenants/apiship/key` stores the token and answers with `{ set, last4 }`
 *   and never the value;
 * - the row really lands in the database, which is the check the `provider`
 *   CHECK constraint makes necessary: adding a slot to the model enum alone
 *   passes every typecheck and dies at INSERT time (measured in w20 on
 *   `wildberries_write`), so a save that returns 200 is the only proof the
 *   migration shipped;
 * - the stored row is CIPHERTEXT: the literal is in no column of
 *   `tenant_integration_secret` and in no response of the namespace;
 * - an empty token is refused rather than stored as an empty string, which
 *   would overwrite a working token with a legal value of nothing (rule 20a);
 * - no token, no write: the namespace is behind `authenticate("tenant", …)`;
 * - tenant B can neither read nor replace tenant A's token;
 * - `DELETE` forgets it, and saving again leaves ONE live row rather than a
 *   second one shadowing the first;
 * - `GET /tenants/apiship/probe` answers «not asked» when nothing is stored,
 *   and reports a TRANSPORT failure as its own state rather than as a rejected
 *   token — the three states of rule 20a.
 *
 * The probe never reaches the real ApiShip: `APISHIP_BASE_URL` points at a port
 * nothing listens on, so the only network answer this file can get is a refusal.
 * Whether the real API accepts a real token is measured against the live API in
 * the task report, not here.
 *
 * Runner facts, same as `tenants-marketplace-keys.spec.ts`: a throwaway database
 * migrated from this repository's config, restored from its post-`beforeAll`
 * snapshot before every test, and `DB_HOST` must be the literal `localhost`.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";
process.env.APISHIP_BASE_URL = "http://127.0.0.1:1/v1";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";
const A_TOKEN = "seam-apiship-token-aaaa1111";
const B_TOKEN = "seam-apiship-token-bbbb2222";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the owner stores her own ApiShip token", () => {
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

      /** Every row of the table, ciphertext included, for the "not in the database" checks. */
      const secretRows = async () => {
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
        return (await pg("tenant_integration_secret").select("*")) as Array<
          Record<string, unknown>
        >;
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("stores the token, answers with the mask, and really writes a row", async () => {
        const saved = await api.put("/tenants/apiship/key", { token: A_TOKEN }, bearer(a.token));

        expect(saved.status).toBe(200);
        expect(saved.data.provider).toBe("apiship");
        expect(saved.data.settings.token).toEqual({ set: true, last4: A_TOKEN.slice(-4) });
        expect(JSON.stringify(saved.data)).not.toContain(A_TOKEN);

        // The row exists. This is the assertion the CHECK constraint on
        // `provider` makes worth writing: without the migration the INSERT
        // above dies at runtime with every other gate green.
        const rows = await secretRows();
        const mine = rows.filter((row) => row.provider === "apiship");
        expect(mine).toHaveLength(1);
        expect(mine[0].tenant_id).toBe(a.tenant.id);

        // Ciphertext, not the token: no column of any row carries the literal.
        expect(JSON.stringify(rows)).not.toContain(A_TOKEN);

        const read = await api.get("/tenants/apiship/key", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.settings.token).toEqual({ set: true, last4: A_TOKEN.slice(-4) });
        expect(JSON.stringify(read.data)).not.toContain(A_TOKEN);
      });

      it("refuses an empty token instead of storing nothing over something", async () => {
        const stored = await api.put("/tenants/apiship/key", { token: A_TOKEN }, bearer(a.token));
        expect(stored.status).toBe(200);

        const empty = await failed(
          api.put("/tenants/apiship/key", { token: "   " }, bearer(a.token)),
        );
        expect(empty.status).toBe(400);

        // The stored token survived the refused request.
        const read = await api.get("/tenants/apiship/key", bearer(a.token));
        expect(read.data.settings.token).toEqual({ set: true, last4: A_TOKEN.slice(-4) });
      });

      it("is closed without a tenant session", async () => {
        const read = await failed(api.get("/tenants/apiship/key"));
        expect(read.status).toBe(401);

        const write = await failed(api.put("/tenants/apiship/key", { token: A_TOKEN }));
        expect(write.status).toBe(401);
      });

      it("keeps one shop's token invisible and untouchable to another", async () => {
        const savedA = await api.put("/tenants/apiship/key", { token: A_TOKEN }, bearer(a.token));
        expect(savedA.status).toBe(200);

        // B sees NOTHING of A's, not a masked view of it.
        const readB = await api.get("/tenants/apiship/key", bearer(b.token));
        expect(readB.status).toBe(200);
        expect(readB.data.settings).toBeNull();

        // B writing its own token leaves A's alone.
        const savedB = await api.put("/tenants/apiship/key", { token: B_TOKEN }, bearer(b.token));
        expect(savedB.status).toBe(200);
        expect(savedB.data.settings.token.last4).toBe(B_TOKEN.slice(-4));

        const readA = await api.get("/tenants/apiship/key", bearer(a.token));
        expect(readA.data.settings.token.last4).toBe(A_TOKEN.slice(-4));

        const rows = await secretRows();
        expect(rows.filter((row) => row.provider === "apiship")).toHaveLength(2);
      });

      it("forgets the token on DELETE and revives one row, not two, on the next save", async () => {
        expect(
          (await api.put("/tenants/apiship/key", { token: A_TOKEN }, bearer(a.token))).status,
        ).toBe(200);

        const removed = await api.delete("/tenants/apiship/key", bearer(a.token));
        expect(removed.status).toBe(200);
        expect(removed.data.deleted).toBe(true);
        expect(removed.data.settings).toBeNull();

        const again = await api.put("/tenants/apiship/key", { token: B_TOKEN }, bearer(a.token));
        expect(again.status).toBe(200);
        expect(again.data.settings.token.last4).toBe(B_TOKEN.slice(-4));

        const live = (await secretRows()).filter(
          (row) => row.provider === "apiship" && row.deleted_at === null,
        );
        expect(live).toHaveLength(1);
      });

      it("says «not asked» with no token, and tells a dead ApiShip from a bad token", async () => {
        const nothing = await api.get("/tenants/apiship/probe", bearer(a.token));
        expect(nothing.status).toBe(200);
        // t-2026-10-14-58 added the cabinet's carriers and the calculator to
        // the same answer; the two original fields keep their meaning.
        expect(nothing.data).toMatchObject({ token_set: false, probe: null });

        expect(
          (await api.put("/tenants/apiship/key", { token: A_TOKEN }, bearer(a.token))).status,
        ).toBe(200);

        const probed = await api.get("/tenants/apiship/probe", bearer(a.token));
        expect(probed.status).toBe(200);
        expect(probed.data.token_set).toBe(true);
        // Nothing listens on that port, so ApiShip gave no verdict about the
        // token — and the route says exactly that: `status: null`, not a
        // rejection it would have had to invent (rule 20a).
        expect(probed.data.probe.ok).toBe(false);
        expect(probed.data.probe.status).toBeNull();
        expect(typeof probed.data.probe.error).toBe("string");
        expect(JSON.stringify(probed.data)).not.toContain(A_TOKEN);
      });
    });
  },
});
