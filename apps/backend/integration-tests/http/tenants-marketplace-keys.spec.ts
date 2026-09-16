import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

jest.setTimeout(240_000);

/**
 * Seam test of w24-integration-keys-self-service: the shop owner stores her
 * OWN marketplace key from the panel, for every registered marketplace.
 *
 * What it proves, each with a request and not by reading code:
 *
 * - `PUT /tenants/wb/key` stores the token and answers with `{ set, last4 }`
 *   plus what the key says about itself, never the value;
 * - the stored row is CIPHERTEXT: the literal is in no column of
 *   `tenant_integration_secret` and in no response of the namespace;
 * - the WRITE slot `wildberries_write` stays empty. Ivan's invariant of
 *   2026-09-16 02:46 WITA is that the product only reads marketplaces, and a
 *   read key carrying write rights must not become a write credential;
 * - Ozon needs a PAIR and says which field is missing, by LABEL and never by
 *   value; a secret left out on a later save keeps its stored value;
 * - no token, no write: the namespace is behind `authenticate("tenant", …)`;
 * - tenant B can neither read nor replace tenant A's key;
 * - `DELETE` forgets the key, and saving again leaves ONE live row rather than
 *   a second one shadowing the first.
 *
 * Runner facts, same as `tenants-payment-settings.spec.ts`: a throwaway
 * database migrated from this repository's config, restored from its
 * post-`beforeAll` snapshot before every test, and `DB_HOST` must be the
 * literal `localhost`.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret";

/**
 * A WB-shaped token: three base64url parts whose payload carries `s` with bit
 * 30 set (read-only) and an `exp` a year out. The signature is not checked by
 * anything in this repository — `inspectToken` only DECODES the payload — so
 * the value is a fixture, not a forgery of a real WB key.
 */
const wbToken = (tail: string): string => {
  const payload = {
    id: `seam-${tail}`,
    sid: "seam-seller",
    s: (1 << 30) | 1,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    t: false,
    acc: 0,
  };
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.seam-signature-${tail}`;
};

/** A WB token whose read-only bit is CLEAR: the key carries write rights. */
const wbWriteCapableToken = (): string => {
  const payload = {
    id: "seam-writer",
    sid: "seam-seller",
    s: 1,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    t: false,
    acc: 0,
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.seam-signature-writer`;
};

const A_KEY = wbToken("aaaa1111");
const B_KEY = wbToken("bbbb2222");
const OZON_CLIENT_ID = "seam-cabinet-4242";
const OZON_KEY = "seam-ozon-api-key-9999";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the owner stores her own marketplace keys", () => {
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

      it("stores the Wildberries token and answers with the mask and the key's own facts", async () => {
        const saved = await api.put("/tenants/wb/key", { api_key: A_KEY }, bearer(a.token));
        expect(saved.status).toBe(200);
        expect(saved.data.marketplace).toBe("wb");
        expect(saved.data.connection.key).toEqual({ set: true, last4: A_KEY.slice(-4) });
        expect(saved.data.connection.is_enabled).toBe(true);
        // What the key SAYS about itself, asked on the spot: the panel shows
        // the rights and the expiry without a second request and without a
        // page reload.
        expect(saved.data.credentials.read_only).toBe(true);
        expect(saved.data.credentials.expires_at).toEqual(expect.any(String));
        expect(saved.data.credentials.error).toBeNull();

        // The field spec travels with the answer, so the form can render
        // itself from the adapter rather than from a copy in the panel.
        expect(saved.data.fields).toEqual([
          expect.objectContaining({
            name: "api_key",
            secret: true,
            value: null,
            masked: { set: true, last4: A_KEY.slice(-4) },
          }),
        ]);
      });

      it("keeps the token out of every response body and out of the database", async () => {
        await api.put("/tenants/wb/key", { api_key: A_KEY }, bearer(a.token));

        const bodies = await Promise.all([
          api.get("/tenants/wb/key", bearer(a.token)),
          api.get("/tenants/wb/status", bearer(a.token)),
          api.get("/tenants/marketplaces", bearer(a.token)),
          api.get("/tenants/marketplaces/wb/status", bearer(a.token)),
        ]);
        for (const response of bodies) {
          expect(response.status).toBe(200);
          expect(JSON.stringify(response.data)).not.toContain(A_KEY);
        }

        const rows = await secretRows();
        expect(rows.length).toBeGreaterThan(0);
        // Every column, not just `payload`: a key copied into a comment or a
        // name column would be just as readable.
        expect(JSON.stringify(rows)).not.toContain(A_KEY);
        expect(rows.some((row) => typeof row.payload === "string" && row.payload.length > 0)).toBe(
          true,
        );
      });

      it("never fills the write slot, not even for a key that carries write rights", async () => {
        const saved = await api.put(
          "/tenants/wb/key",
          { api_key: wbWriteCapableToken() },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        // The key is ACCEPTED and reported honestly: refusing it would send the
        // owner back to Wildberries to mint a second token for no gain.
        expect(saved.data.credentials.read_only).toBe(false);

        const rows = await secretRows();
        expect(rows.filter((row) => row.provider === "wildberries_write")).toHaveLength(0);

        // And the write screen still reports the write credential as absent.
        const writeSettings = await api.get("/tenants/wb/write-settings", bearer(a.token));
        expect(writeSettings.status).toBe(200);
        expect(writeSettings.data.gates.credential.slot).toBe("wildberries_write");
        expect(writeSettings.data.gates.credential.key).toEqual({ set: false, last4: null });
      });

      it("asks Ozon for the pair, names the missing field by its label, and keeps a secret left out", async () => {
        const half = await failed(
          api.put("/tenants/ozon/key", { client_id: OZON_CLIENT_ID }, bearer(a.token)),
        );
        expect(half.status).toBe(400);
        expect(half.data.message).toContain("Api-Key");

        const saved = await api.put(
          "/tenants/ozon/key",
          { client_id: OZON_CLIENT_ID, api_key: OZON_KEY },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        // `Client-Id` is not a secret: the owner has to see which cabinet this
        // shop is bound to. The key is masked.
        expect(saved.data.fields).toEqual([
          expect.objectContaining({ name: "client_id", secret: false, value: OZON_CLIENT_ID }),
          expect.objectContaining({
            name: "api_key",
            secret: true,
            value: null,
            masked: { set: true, last4: OZON_KEY.slice(-4) },
          }),
        ]);
        expect(JSON.stringify(saved.data)).not.toContain(OZON_KEY);

        // Changing the cabinet without retyping the key she cannot read.
        const again = await api.put(
          "/tenants/ozon/key",
          { client_id: "seam-cabinet-4343" },
          bearer(a.token),
        );
        expect(again.status).toBe(200);
        expect(again.data.fields[0].value).toBe("seam-cabinet-4343");
        expect(again.data.fields[1].masked).toEqual({ set: true, last4: OZON_KEY.slice(-4) });
      });

      it("refuses an empty value rather than overwriting a stored key with nothing", async () => {
        await api.put("/tenants/wb/key", { api_key: A_KEY }, bearer(a.token));
        const blank = await failed(api.put("/tenants/wb/key", { api_key: "   " }, bearer(a.token)));
        expect(blank.status).toBe(400);

        const read = await api.get("/tenants/wb/key", bearer(a.token));
        expect(read.data.connection.key).toEqual({ set: true, last4: A_KEY.slice(-4) });
      });

      it("refuses an unknown field instead of storing it silently", async () => {
        const junk = await failed(
          api.put("/tenants/wb/key", { api_key: A_KEY, secret_sauce: "x" }, bearer(a.token)),
        );
        expect(junk.status).toBe(400);
        expect(junk.data.message).toContain("secret_sauce");
      });

      it("refuses an unregistered marketplace", async () => {
        const missing = await failed(
          api.put("/tenants/marketplaces/avito/key", { api_key: A_KEY }, bearer(a.token)),
        );
        expect(missing.status).toBe(404);
      });

      it("takes no key without an owner token", async () => {
        const anonymous = await failed(api.put("/tenants/wb/key", { api_key: A_KEY }));
        expect(anonymous.status).toBe(401);
        const anonymousRead = await failed(api.get("/tenants/wb/key"));
        expect(anonymousRead.status).toBe(401);
      });

      it("scopes the key to one shop: B neither reads nor replaces A's", async () => {
        await api.put("/tenants/wb/key", { api_key: A_KEY }, bearer(a.token));

        const bRead = await api.get("/tenants/wb/key", bearer(b.token));
        expect(bRead.status).toBe(200);
        expect(bRead.data.connection.key).toEqual({ set: false, last4: null });

        await api.put("/tenants/wb/key", { api_key: B_KEY }, bearer(b.token));

        const aRead = await api.get("/tenants/wb/key", bearer(a.token));
        expect(aRead.data.connection.key).toEqual({ set: true, last4: A_KEY.slice(-4) });

        const rows = await secretRows();
        const wb = rows.filter((row) => row.provider === "wildberries" && !row.deleted_at);
        expect(wb).toHaveLength(2);
        expect(new Set(wb.map((row) => row.tenant_id))).toEqual(
          new Set([a.tenant.id, b.tenant.id]),
        );
      });

      it("forgets the key on DELETE and leaves one live row when it is saved again", async () => {
        await api.put("/tenants/wb/key", { api_key: A_KEY }, bearer(a.token));

        const removed = await api.delete("/tenants/wb/key", bearer(a.token));
        expect(removed.status).toBe(200);
        expect(removed.data.connection.key).toEqual({ set: false, last4: null });
        expect(removed.data.credentials).toBeNull();

        const card = await api.get("/tenants/marketplaces/wb/status", bearer(a.token));
        expect(card.data.connection.key).toEqual({ set: false, last4: null });

        // Saving again REVIVES the row instead of adding a second one: the
        // readers take the first row with `deleted_at is null`, so two live
        // rows would make "which key is in force" depend on row order.
        const again = await api.put("/tenants/wb/key", { api_key: B_KEY }, bearer(a.token));
        expect(again.data.connection.key).toEqual({ set: true, last4: B_KEY.slice(-4) });

        const rows = await secretRows();
        const live = rows.filter(
          (row) =>
            row.provider === "wildberries" && row.tenant_id === a.tenant.id && !row.deleted_at,
        );
        expect(live).toHaveLength(1);
      });
    });
  },
});
