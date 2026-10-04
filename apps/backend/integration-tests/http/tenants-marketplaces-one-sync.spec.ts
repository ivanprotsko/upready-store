import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";
import { WB_SYNC_KINDS } from "../../src/modules/wb/models/wb-sync-run";

jest.setTimeout(240_000);

/**
 * `GET` and `POST /tenants/marketplaces/:marketplace/sync` — «Wildberries →
 * Обновление» (task-07 of ask-20261005-023327-f02b).
 *
 * NO ADAPTER EVER RUNS HERE, for the reason `tenants-marketplaces-sync-now.spec.ts`
 * gives: a kind the `POST` decides is due is handed to the real adapter in the
 * background. Every tenant here either has no key (nothing can start) or has
 * every Wildberries kind seeded `rate_limited` with a `retry_at` in the future
 * (nothing is due), and the 409 is proven with a fresh `running` row. The
 * Wildberries key below is a locally decoded JWT, and no tenant has an Ozon
 * key, so the shared `GET` asks Ozon nothing either.
 *
 * What it proves, each with a request:
 *
 * - `GET` for `wb` answers the Wildberries entry the shared `GET` answers,
 *   every kind plus the projection, and only Wildberries warnings;
 * - `GET` and `POST` for an unregistered marketplace answer 404;
 * - `POST` answers 409 while a Wildberries run of this tenant is going, and an
 *   Ozon run does not block the Wildberries button;
 * - `POST` without a key reports one skipped entry for Wildberries only;
 * - both take no request without an owner token.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";

/** The WB-shaped token of `tenants-marketplaces-sync-now.spec.ts`: decoded, never sent. */
const wbToken = (tail: string): string => {
  const payload = {
    id: `one-sync-${tail}`,
    sid: "one-sync-seller",
    s: (1 << 30) | 1,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    t: false,
    acc: 0,
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.one-sync-signature-${tail}`;
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: «Обновление» of one marketplace", () => {
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

      const mp = () => getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

      /** A `mp_sync_run` row, deliberately never DUE (see the file's own doc comment). */
      const seedRun = async (
        tenantId: string,
        kind: string,
        status: "running" | "rate_limited",
        marketplace = "wb",
      ) => {
        const now = new Date();
        await mp().createMpSyncRuns({
          tenant_id: tenantId,
          marketplace,
          kind,
          status,
          started_at: now,
          finished_at: status === "rate_limited" ? now : null,
          retry_at: status === "rate_limited" ? new Date(now.getTime() + 10 * 60_000) : null,
          rows: 7,
          requests: 1,
          attempts: 1,
        });
      };

      it("answers the Wildberries entry of the shared GET, with only Wildberries warnings", async () => {
        const owner = await registerTenant("acme-one-sync", "Acme One Sync");
        const saved = await api.put("/tenants/wb/key", { api_key: wbToken("get") }, bearer(owner.token));
        expect(saved.status).toBe(200);
        for (const kind of [...WB_SYNC_KINDS, "projection"]) {
          await seedRun(owner.tenant.id, kind, "rate_limited", "wb");
        }

        const one = await api.get("/tenants/marketplaces/wb/sync", bearer(owner.token));
        const all = await api.get("/tenants/marketplaces/sync", bearer(owner.token));
        expect(one.status).toBe(200);
        expect(all.status).toBe(200);

        expect(Object.keys(one.data).sort()).toEqual(["marketplace", "now", "schedule", "warnings"]);
        expect(one.data.marketplace.id).toBe("wb");
        expect(one.data.marketplace.connection.key.set).toBe(true);
        expect(one.data.marketplace.kinds.map((kind: { kind: string }) => kind.kind)).toEqual([
          ...WB_SYNC_KINDS,
          "projection",
        ]);

        // The same states and dates as the shared screen. `next_at`, `due` and
        // `due_reason` are counted from each request's own clock, so they are
        // held to the same kind rather than to the millisecond.
        const shared = all.data.marketplaces.find((entry: { id: string }) => entry.id === "wb");
        const stable = (kind: Record<string, unknown>) => {
          const { next_at: _next, ...rest } = kind;
          return rest;
        };
        expect(one.data.marketplace.kinds.map(stable)).toEqual(shared.kinds.map(stable));
        expect(one.data.marketplace.credentials).toEqual(shared.credentials);
        expect(one.data.schedule).toEqual(all.data.schedule);

        expect(one.data.warnings.every((warning: { marketplace: string }) => warning.marketplace === "wb")).toBe(
          true,
        );
        expect(one.data.warnings).toEqual(
          all.data.warnings.filter((warning: { marketplace: string }) => warning.marketplace === "wb"),
        );
        // The shared answer does carry Ozon's own warning; this one must not.
        expect(all.data.warnings.some((warning: { marketplace: string }) => warning.marketplace === "ozon")).toBe(
          true,
        );
      });

      it("answers a shop without a key with the kinds that never ran and one no_key warning", async () => {
        const owner = await registerTenant("hoopy-one-sync", "Hoopy One Sync");

        const one = await api.get("/tenants/marketplaces/wb/sync", bearer(owner.token));
        expect(one.status).toBe(200);
        expect(one.data.marketplace.connection.key).toEqual({ set: false, last4: null });
        expect(one.data.marketplace.kinds.every((kind: { status: unknown }) => kind.status === null)).toBe(true);
        expect(one.data.warnings.map((warning: { type: string }) => warning.type)).toEqual(["no_key"]);
      });

      it("answers 404 for a marketplace nobody registered", async () => {
        const owner = await registerTenant("globex-one-sync", "Globex One Sync");

        const read = await failed(api.get("/tenants/marketplaces/yandex/sync", bearer(owner.token)));
        expect(read.status).toBe(404);
        const start = await failed(api.post("/tenants/marketplaces/yandex/sync", {}, bearer(owner.token)));
        expect(start.status).toBe(404);
      });

      it("refuses a second start while a Wildberries run is going (409), and an Ozon run does not block it", async () => {
        const owner = await registerTenant("brontitall-one-sync", "Brontitall One Sync");

        // Ozon is busy, Wildberries is not: the Wildberries button still works.
        // No key, so nothing can start (see the file's own doc comment).
        await seedRun(owner.tenant.id, "products", "running", "ozon");
        const notBlocked = await api.post("/tenants/marketplaces/wb/sync", {}, bearer(owner.token));
        expect(notBlocked.status).toBe(200);
        expect(notBlocked.data.results).toEqual([
          expect.objectContaining({ marketplace: "wb", kind: "*", outcome: "skipped", reason: "no_key" }),
        ]);

        await seedRun(owner.tenant.id, "cards", "running", "wb");
        const second = await failed(api.post("/tenants/marketplaces/wb/sync", {}, bearer(owner.token)));
        expect(second.status).toBe(409);
        expect(second.data.type).toBe("sync_in_progress");
        expect(second.data.message).toEqual(expect.stringContaining("Wildberries"));
      });

      it("reports a rate-limited Wildberries kind as skipped and starts nothing", async () => {
        const owner = await registerTenant("initech-one-sync", "Initech One Sync");
        const saved = await api.put("/tenants/wb/key", { api_key: wbToken("post") }, bearer(owner.token));
        expect(saved.status).toBe(200);
        for (const kind of [...WB_SYNC_KINDS, "projection"]) {
          await seedRun(owner.tenant.id, kind, "rate_limited", "wb");
        }

        const response = await api.post("/tenants/marketplaces/wb/sync", {}, bearer(owner.token));
        expect(response.status).toBe(200);
        expect(response.data.results).toHaveLength(WB_SYNC_KINDS.length + 1);
        expect(
          response.data.results.every(
            (entry: { marketplace: string; outcome: string; reason: string }) =>
              entry.marketplace === "wb" && entry.outcome === "skipped" && entry.reason === "waiting",
          ),
        ).toBe(true);

        const running = await mp().listMpSyncRuns({ tenant_id: owner.tenant.id, status: "running" });
        expect(running).toHaveLength(0);
      });

      it("takes no request without an owner token", async () => {
        const read = await failed(api.get("/tenants/marketplaces/wb/sync"));
        expect(read.status).toBe(401);
        const start = await failed(api.post("/tenants/marketplaces/wb/sync", {}));
        expect(start.status).toBe(401);
      });
    });
  },
});
